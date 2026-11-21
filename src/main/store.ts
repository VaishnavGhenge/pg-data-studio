// Saved connection metadata and OS-encrypted passwords share one atomic file.

import { app, safeStorage } from "electron";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

interface StoredSource extends SourceInput {
  encryptedPassword?: string;
}

const FILE = path.join(app.getPath("userData"), "connections.json");
let pendingWrite = Promise.resolve();

function readFile(): string | null {
  try {
    return fs.readFileSync(FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function write(sources: StoredSource[], previous: string | null): void {
  if (readFile() !== previous) {
    throw new Error(
      "Saved connections changed on disk. Try again with the latest connection settings.",
    );
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const temp = `${FILE}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify({ sources }, null, 2), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temp, FILE);
  } finally {
    try {
      fs.unlinkSync(temp);
    } catch {
      /* Already renamed, or never created. */
    }
  }
}

// Drop a malformed tunnel rather than the whole source, so a hand-edited file
// still loads.
function normalizeTunnel(t: unknown): SsmTunnel | null {
  const o = t as SsmTunnel;
  if (!o || typeof o.target !== "string" || typeof o.region !== "string") return null;
  return {
    target: o.target,
    region: o.region,
    profile: typeof o.profile === "string" ? o.profile : "",
  };
}

function withValidTunnel(s: StoredSource): StoredSource {
  if (s.tunnel === undefined) return s;
  const tunnel = normalizeTunnel(s.tunnel);
  if (tunnel) return { ...s, tunnel };
  const { tunnel: _dropped, ...rest } = s;
  return rest;
}

function isSource(s: unknown): s is StoredSource {
  const o = s as StoredSource;
  return (
    !!o &&
    typeof o.id === "string" &&
    typeof o.host === "string" &&
    typeof o.database === "string" &&
    typeof o.user === "string"
  );
}

// Parse a postgres:// connection string into a Source (best effort). Exported so
// the legacy migration and any future importer share one parser.
export function sourceFromUrl(cs: string): SourceInput | null {
  try {
    const u = new URL(cs.trim());
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    const database = decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres";
    const host = u.hostname || "localhost";
    const sslmode = u.searchParams.get("sslmode");
    return {
      id: randomUUID(),
      name: `${database} @ ${host}`,
      host,
      port: u.port ? Number(u.port) : 5432,
      database,
      user: decodeURIComponent(u.username) || "postgres",
      password: decodeURIComponent(u.password),
      ssl: sslmode ? sslmode !== "disable" : false,
    };
  } catch {
    return null;
  }
}

function load(): { sources: StoredSource[]; previous: string | null; legacy: boolean } {
  const previous = readFile();
  const raw = previous === null ? {} : JSON.parse(previous);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Saved connections file must contain a JSON object.");
  }
  if (Array.isArray(raw.sources)) {
    const sources = raw.sources.filter(isSource).map(withValidTunnel);
    return {
      previous,
      sources,
      legacy: sources.some((s: StoredSource) => Object.hasOwn(s, "password")),
    };
  }
  const recent = Array.isArray(raw.recent) ? raw.recent : [];
  const sources = recent
    .filter((url: unknown): url is string => typeof url === "string")
    .map(sourceFromUrl)
    .filter((source: SourceInput | null): source is SourceInput => source !== null);
  return { previous, sources, legacy: recent.length > 0 };
}

async function requireSecureStorage(): Promise<void> {
  const available = await safeStorage.isAsyncEncryptionAvailable();
  const backend = process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : null;
  if (!available || backend === "basic_text" || backend === "unknown") {
    throw new Error(
      "Secure password storage is unavailable. Unlock your OS credential store and try again.",
    );
  }
}

async function encrypt(sources: StoredSource[]): Promise<StoredSource[]> {
  const protectedSources: StoredSource[] = [];
  for (const { password, ...source } of sources) {
    if (password) {
      await requireSecureStorage();
      source.encryptedPassword = (await safeStorage.encryptStringAsync(password)).toString(
        "base64",
      );
    }
    protectedSources.push(source);
  }
  return protectedSources;
}

function changeStore<T>(change: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(change);
  pendingWrite = result.then(
    () => {},
    () => {},
  );
  return result;
}

function metadata({ password, encryptedPassword, ...source }: StoredSource): Source {
  return password || encryptedPassword ? { ...source, hasSavedPassword: true } : source;
}

export function listSources(): Promise<Source[]> {
  return changeStore(async () => {
    const sources = await migrate();
    return sources.map(metadata);
  });
}

async function migrate(): Promise<StoredSource[]> {
  const { sources, previous, legacy } = load();
  if (!legacy) return sources;
  const secured = await encrypt(sources);
  write(secured, previous);
  return secured;
}

function requireSource(sources: StoredSource[], id: string): StoredSource {
  const source = sources.find((s) => s.id === id);
  if (!source)
    throw new Error(
      "That saved connection no longer exists. Refresh your connections and try again.",
    );
  return source;
}

async function savedPassword({ encryptedPassword }: StoredSource): Promise<string> {
  if (!encryptedPassword) return "";
  await requireSecureStorage();
  const decrypted = await safeStorage.decryptStringAsync(Buffer.from(encryptedPassword, "base64"));
  return decrypted.result;
}

export function connectionConfig(id: string): Promise<ConnectConfig> {
  return changeStore(async () => {
    const source = requireSource(await migrate(), id);
    return { ...metadata(source), password: await savedPassword(source) };
  });
}

export async function testConnectionConfig(input: SourceInput): Promise<ConnectConfig> {
  const { password, id, ...config } = input;
  if (password !== undefined || !id) return { ...config, password: password ?? "" };
  const saved = await connectionConfig(id);
  return { ...config, password: saved.password };
}

// Saves replace the file by rename, so a watcher on the file itself would stay
// on the old inode. Watch the directory and filter for our file instead.
export function watchSources(onChange: () => void, delayMs = 150): () => void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  let timer: NodeJS.Timeout | null = null;
  const watcher = fs.watch(path.dirname(FILE), (_event, name) => {
    if (name && String(name) !== path.basename(FILE)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, delayMs);
  });
  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}

// Upsert by id; a source without an id is treated as new and assigned one.
export function saveSource(input: SourceInput): Promise<Source> {
  return changeStore(async () => {
    const { sources, previous } = load();
    const idx = sources.findIndex((s) => s.id === input.id);
    const existing = idx >= 0 ? sources[idx] : undefined;
    const { password, ...fields } = input;
    const source: StoredSource = {
      ...fields,
      id: input.id || randomUUID(),
      ...(password === undefined
        ? { password: existing?.password, encryptedPassword: existing?.encryptedPassword }
        : { password }),
    };
    if (existing) sources[idx] = source;
    else sources.push(source);
    const secured = await encrypt(sources);
    write(secured, previous);
    return metadata(requireSource(secured, source.id));
  });
}

export function duplicateSource(id: string): Promise<Source> {
  return changeStore(async () => {
    const { sources, previous } = load();
    const source = requireSource(sources, id);
    const copy = { ...source, id: randomUUID(), name: source.name + " (copy)" };
    const secured = await encrypt([...sources, copy]);
    write(secured, previous);
    return metadata(requireSource(secured, copy.id));
  });
}

export function deleteSource(id: string): Promise<void> {
  return changeStore(async () => {
    const { sources, previous } = load();
    const secured = await encrypt(sources.filter((s) => s.id !== id));
    write(secured, previous);
  });
}

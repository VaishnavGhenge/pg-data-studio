// Persistence for saved data sources, stored as JSON in the OS user-data dir.
// Passwords are saved in plaintext — this is a local developer tool, the same
// trust model as a .pgpass or a .env file on your machine.

import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

interface StoreData {
  sources: Source[];
}

const FILE = path.join(app.getPath("userData"), "connections.json");

function readRaw(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

function write(data: StoreData): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const temp = `${FILE}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), {
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

function withValidTunnel(s: Source): Source {
  if (s.tunnel === undefined) return s;
  const tunnel = normalizeTunnel(s.tunnel);
  if (tunnel) return { ...s, tunnel };
  const { tunnel: _dropped, ...rest } = s;
  return rest;
}

function isSource(s: unknown): s is Source {
  const o = s as Source;
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
export function sourceFromUrl(cs: string): Source | null {
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

// Read stored sources, migrating the pre-0.2 `recent: string[]` format the first
// time it's seen.
function load(): StoreData {
  const raw = readRaw();
  if (Array.isArray(raw.sources)) {
    return { sources: raw.sources.filter(isSource).map(withValidTunnel) };
  }
  const recent = Array.isArray(raw.recent) ? (raw.recent as string[]) : [];
  const sources = recent.map(sourceFromUrl).filter((s): s is Source => s !== null);
  const data: StoreData = { sources };
  if (recent.length) write(data); // persist the migration once
  return data;
}

export function listSources(): Source[] {
  return load().sources;
}

// Upsert by id; a source without an id is treated as new and assigned one.
export function saveSource(input: Source): Source {
  const data = load();
  const source: Source = { ...input, id: input.id || randomUUID() };
  const idx = data.sources.findIndex((s) => s.id === source.id);
  if (idx >= 0) data.sources[idx] = source;
  else data.sources.push(source);
  write(data);
  return source;
}

export function deleteSource(id: string): void {
  const data = load();
  data.sources = data.sources.filter((s) => s.id !== id);
  write(data);
}

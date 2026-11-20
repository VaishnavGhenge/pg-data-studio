// AWS Session Manager port-forwarding for databases that are only reachable
// from a bastion. We drive the AWS CLI (and its session-manager-plugin) rather
// than an SDK: it reuses the user's existing profiles, SSO logins and MFA
// caching, and it's what the bastion's IAM policy is written for.

import { spawn, type ChildProcess } from "child_process";
import * as net from "net";
import * as os from "os";
import * as path from "path";

export interface Tunnel {
  localPort: number;
  close(): void;
}

const READY_TIMEOUT_MS = 20000;
const INSTANCE_ID = /^(i|mi)-[0-9a-f]{8,17}$/;
const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
const PROFILE = /^[\w.@+-]+$/;

const open = new Set<ChildProcess>();

// An app started from the Dock gets launchd's minimal PATH, which has neither
// Homebrew's `aws` nor the plugin. Add the places they normally live.
export function cliPath(base = process.env.PATH ?? ""): string {
  const extra = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/local/sessionmanagerplugin/bin",
    path.join(os.homedir(), ".local", "bin"),
  ];
  const parts = base.split(path.delimiter).filter(Boolean);
  return [...parts, ...extra.filter((p) => !parts.includes(p))].join(path.delimiter);
}

export function validateTunnel(t: SsmTunnel): string | null {
  if (!INSTANCE_ID.test(t.target.trim()))
    return "Bastion must be an instance id like i-0123456789abcdef0.";
  if (!REGION.test(t.region.trim())) return "Region must look like eu-west-1.";
  if (t.profile.trim() && !PROFILE.test(t.profile.trim())) return "AWS profile name is invalid.";
  return null;
}

export function ssmArgs(
  t: SsmTunnel,
  remoteHost: string,
  remotePort: number,
  localPort: number,
): string[] {
  const args = [
    "ssm",
    "start-session",
    "--target",
    t.target.trim(),
    "--region",
    t.region.trim(),
    "--document-name",
    "AWS-StartPortForwardingSessionToRemoteHost",
    "--parameters",
    JSON.stringify({
      host: [remoteHost],
      portNumber: [String(remotePort)],
      localPortNumber: [String(localPort)],
    }),
  ];
  if (t.profile.trim()) args.push("--profile", t.profile.trim());
  return args;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
  });
}

// Turn the CLI's stderr into something a person can act on.
export function explainFailure(stderr: string, code: number | null): string {
  const text = stderr.trim();
  if (/SessionManagerPlugin is not found|session-manager-plugin.*not found/i.test(text))
    return "AWS Session Manager plugin is not installed. Install it with `brew install --cask session-manager-plugin`.";
  if (/ENOENT/.test(text)) return "AWS CLI (`aws`) was not found on PATH.";
  if (/AccessDenied|not authorized/i.test(text))
    return `AWS refused the session. Your IAM user needs the bastion's access policy.\n${text}`;
  if (/could not be found|config profile/i.test(text)) return `AWS profile problem: ${text}`;
  if (/Token.*expired|ExpiredToken|SSO/i.test(text))
    return `AWS credentials expired. Run \`aws sso login\` (or refresh your keys) and retry.\n${text}`;
  return text || `AWS CLI exited with code ${code ?? "unknown"} before the tunnel was ready.`;
}

// Killing `aws` alone orphans session-manager-plugin, which keeps the port
// forwarded and the session open. Signal the whole group instead.
function killTree(child: ChildProcess): void {
  try {
    if (!child.pid) throw new Error("no pid");
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    child.kill();
  }
}

export async function openTunnel(
  t: SsmTunnel,
  remoteHost: string,
  remotePort: number,
): Promise<Tunnel> {
  const problem = validateTunnel(t);
  if (problem) throw new Error(problem);

  const localPort = await freePort();
  const child = spawn("aws", ssmArgs(t, remoteHost, remotePort, localPort), {
    env: { ...process.env, PATH: cliPath() },
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group, so closing can reach the plugin `aws` spawns.
    detached: process.platform !== "win32",
  });
  open.add(child);

  let stderr = "";
  let exited = false;
  let exitCode: number | null = null;
  child.stderr?.on("data", (d) => (stderr += String(d)));
  child.stdout?.resume();
  child.on("error", (e) => {
    stderr += String(e.message);
    exited = true;
  });
  child.on("exit", (code) => {
    exited = true;
    exitCode = code;
    open.delete(child);
  });

  const close = () => {
    open.delete(child);
    if (!exited) killTree(child);
  };

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited) throw new Error(explainFailure(stderr, exitCode));
    if (await canConnect(localPort)) return { localPort, close };
    await new Promise((r) => setTimeout(r, 250));
  }
  close();
  throw new Error(
    `Tunnel was not ready after ${READY_TIMEOUT_MS / 1000}s. ${stderr.trim()}`.trim(),
  );
}

// Synchronous so it can run from a quit handler that Electron won't await.
export function closeAllTunnels(): void {
  for (const child of open) killTree(child);
  open.clear();
}

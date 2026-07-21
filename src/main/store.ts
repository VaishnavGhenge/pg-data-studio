// Tiny JSON persistence for recent connections, stored in the OS user-data dir.
// Note: connection strings are saved in plaintext — this is a local developer
// tool, same trust model as a .pgpass or a .env file on your machine.

import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

interface StoreData {
  recent: string[];
}

const FILE = path.join(app.getPath("userData"), "connections.json");

function read(): StoreData {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { recent: Array.isArray(parsed.recent) ? parsed.recent : [] };
  } catch {
    return { recent: [] };
  }
}

function write(data: StoreData): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
  } catch {
    /* non-fatal: persistence is a convenience, not a requirement */
  }
}

export function getRecent(): string[] {
  return read().recent;
}

export function remember(connectionString: string): void {
  const data = read();
  const recent = data.recent.filter((c) => c !== connectionString);
  recent.unshift(connectionString);
  data.recent = recent.slice(0, 8);
  write(data);
}

export function forget(connectionString: string): void {
  const data = read();
  data.recent = data.recent.filter((c) => c !== connectionString);
  write(data);
}

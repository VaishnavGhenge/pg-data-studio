import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import * as path from "path";
import * as db from "./db";
import * as store from "./store";
import { closeAllTunnels } from "./tunnel";

app.setName("PG Data Studio");

let mainWindow: BrowserWindow | null = null;
let stopWatchingSources: (() => void) | null = null;

// The renderer has no inline scripts/eval and loads nothing external — CSP is
// set here rather than a static <meta> tag so it can be strict in production
// while staying relaxed enough for the Vite dev server's HMR websocket and
// React Fast Refresh's inline preamble during `electron-vite dev`.
function installCsp(): void {
  const csp = app.isPackaged
    ? "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:;"
    : "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: ws: http://localhost:*;";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: "#0a0d13",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    title: "PG Data Studio",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL); // electron-vite dev server
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  // Open target=_blank / external links in the OS browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---- IPC: every handler resolves to { ok, data } or { ok: false, error } so the
// renderer has a single, predictable shape to branch on. ----

// Node's connect() tries every resolved address for a host (IPv4 + IPv6) and,
// if all of them fail, throws an AggregateError whose own .message is empty —
// the real per-address reasons (e.g. "connect ECONNREFUSED 127.0.0.1:5432")
// only live in .errors[]. This is exactly what happens connecting to
// "localhost" when nothing's listening, so without unwrapping it the
// renderer would show a blank error message.
function errorMessage(err: unknown): string {
  if (err instanceof AggregateError && err.errors.length) {
    const sub = err.errors.map((e) => (e instanceof Error ? e.message : String(e))).filter(Boolean);
    if (sub.length) return sub.join("; ");
  }
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

function handle<T>(channel: string, fn: (...args: any[]) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });
}

// A saved source connects with what's on disk, not the renderer's copy, which
// can be stale if connections.json was edited outside the app. An unreadable
// file shouldn't block connecting, so fall back to what the renderer sent.
function latestConfig(cfg: ConnectConfig & { id?: string }): ConnectConfig {
  try {
    return (cfg.id && store.getSource(cfg.id)) || cfg;
  } catch {
    return cfg;
  }
}

handle<DbMeta>("db:connect", async (cfg: ConnectConfig & { id?: string }) =>
  db.connect(latestConfig(cfg)),
);

handle<DbMeta>("db:test", async (cfg: ConnectConfig) => db.testConnect(cfg));

handle<boolean>("db:disconnect", async () => {
  await db.disconnect();
  return true;
});

handle<DbStatus>("db:status", async () => ({
  connected: db.isConnected(),
  meta: db.currentMeta(),
}));

handle<TableInfo[]>("db:listTables", async () => db.listTables());

handle<{ columns: Column[]; pk: string[] }>(
  "db:tableColumns",
  async (schema: string, table: string) => db.getColumns(schema, table),
);

handle<QueryResult>("db:query", async (schema: string, table: string, opts: QueryOpts) =>
  db.runQuery(schema, table, opts),
);
handle<string>("db:countRows", async (schema: string, table: string, opts: QueryOpts) =>
  db.countRows(schema, table, opts),
);

handle<ApplyResult>(
  "db:applyChanges",
  async (schema: string, table: string, changes: RowChange[]) =>
    db.applyChanges(schema, table, changes),
);

handle<Source[]>("store:list", async () => store.listSources());
handle<Source>("store:save", async (source: Source) => store.saveSource(source));
handle<boolean>("store:delete", async (id: string) => {
  store.deleteSource(id);
  return true;
});

// The OS "that shortcut/action isn't available right now" alert sound (the
// renderer plays this for type-to-search keystrokes with no source
// connected) — shell.beep() is main-process only, not exposed to a
// sandboxed renderer directly.
handle<boolean>("app:beep", async () => {
  shell.beep();
  return true;
});

// ---- app lifecycle ----

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    installCsp();
    createWindow();
    stopWatchingSources = store.watchSources(() => mainWindow?.webContents.send("sources:changed"));
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  await db.disconnect();
});

// before-quit isn't awaited, so the async disconnect above may not reach the
// tunnel. Kill the AWS CLI children synchronously so none outlive the app.
app.on("will-quit", () => {
  closeAllTunnels();
  stopWatchingSources?.();
});

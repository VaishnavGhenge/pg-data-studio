import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import * as path from "path";
import * as db from "./db";
import * as store from "./store";
import { closeAllTunnels } from "./tunnel";

app.setName("PG Data Studio");

let mainWindow: BrowserWindow | null = null;
let stopWatchingSources: (() => void) | null = null;
let activeSaves = 0;

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

  const window = mainWindow;
  window.webContents.on("will-prevent-unload", (event) => {
    if (activeSaves > 0) {
      dialog.showMessageBoxSync(window, {
        type: "info",
        message: "Changes are still saving",
        detail: "Wait for the save to finish before closing the window.",
      });
      return;
    }
    const choice = dialog.showMessageBoxSync(window, {
      type: "warning",
      message: "Discard unsaved changes?",
      detail: "Pending edits in open tables will be lost.",
      buttons: ["Keep editing", "Discard changes"],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault(); // Allow Electron to unload the page.
  });
  window.on("closed", () => {
    mainWindow = null;
    void db.disconnect();
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

handle<DbMeta>("db:connect", async (id: string) => db.connect(() => store.connectionConfig(id)));

handle<DbMeta>("db:test", async (cfg: SourceInput) =>
  db.testConnect(await store.testConnectionConfig(cfg)),
);

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
  async (schema: string, table: string, changes: RowChange[]) => {
    activeSaves++;
    try {
      return await db.applyChanges(schema, table, changes);
    } finally {
      activeSaves--;
    }
  },
);

handle<Source[]>("store:list", async () => store.listSources());
handle<Source>("store:save", async (source: SourceInput) => store.saveSource(source));
handle<Source>("store:duplicate", async (id: string) => store.duplicateSource(id));
handle<boolean>("store:delete", async (id: string) => {
  await store.deleteSource(id);
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

// A cancelled quit keeps the window and connection alive. Once all windows
// close, stop any tunnel that is still draining or opening.
app.on("will-quit", () => {
  closeAllTunnels();
  stopWatchingSources?.();
});

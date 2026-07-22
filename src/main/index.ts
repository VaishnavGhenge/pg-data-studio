import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as path from "path";
import * as db from "./db";
import * as store from "./store";

app.setName("PG Data Studio");

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: "#16191f",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    title: "PG Data Studio",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

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

function handle<T>(
  channel: string,
  fn: (...args: any[]) => Promise<T>
): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });
}

handle<DbMeta>("db:connect", async (cfg: ConnectConfig) => db.connect(cfg));

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
  async (schema: string, table: string) => db.getColumns(schema, table)
);

handle<QueryResult>("db:query", async (schema: string, table: string, opts: QueryOpts) =>
  db.runQuery(schema, table, opts)
);

handle<ApplyResult>(
  "db:applyChanges",
  async (schema: string, table: string, changes: RowChange[]) =>
    db.applyChanges(schema, table, changes)
);

handle<Source[]>("store:list", async () => store.listSources());
handle<Source>("store:save", async (source: Source) => store.saveSource(source));
handle<boolean>("store:delete", async (id: string) => {
  store.deleteSource(id);
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
    createWindow();
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

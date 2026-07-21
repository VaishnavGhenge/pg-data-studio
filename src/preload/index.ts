// The only bridge between the sandboxed renderer and Node. The renderer gets a
// small, explicit `window.api` surface — no ipcRenderer, no require, no Node.

import { contextBridge, ipcRenderer } from "electron";

const invoke = <T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> =>
  ipcRenderer.invoke(channel, ...args);

const api: Api = {
  connect: (connectionString) => invoke<DbMeta>("db:connect", connectionString),
  disconnect: () => invoke<boolean>("db:disconnect"),
  status: () => invoke<DbStatus>("db:status"),
  listTables: () => invoke<TableInfo[]>("db:listTables"),
  query: (schema, table, opts) => invoke<QueryResult>("db:query", schema, table, opts),
  applyChanges: (schema, table, changes) =>
    invoke<ApplyResult>("db:applyChanges", schema, table, changes),
  recentConnections: () => invoke<string[]>("store:recent"),
  forgetConnection: (connectionString) =>
    invoke<boolean>("store:forget", connectionString),
};

contextBridge.exposeInMainWorld("api", api);

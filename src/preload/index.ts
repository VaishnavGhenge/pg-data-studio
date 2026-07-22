// The only bridge between the sandboxed renderer and Node. The renderer gets a
// small, explicit `window.api` surface — no ipcRenderer, no require, no Node.

import { contextBridge, ipcRenderer } from "electron";

const invoke = <T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> =>
  ipcRenderer.invoke(channel, ...args);

const api: Api = {
  connect: (cfg) => invoke<DbMeta>("db:connect", cfg),
  testConnection: (cfg) => invoke<DbMeta>("db:test", cfg),
  disconnect: () => invoke<boolean>("db:disconnect"),
  status: () => invoke<DbStatus>("db:status"),
  listTables: () => invoke<TableInfo[]>("db:listTables"),
  tableColumns: (schema, table) =>
    invoke<{ columns: Column[]; pk: string[] }>("db:tableColumns", schema, table),
  query: (schema, table, opts) => invoke<QueryResult>("db:query", schema, table, opts),
  applyChanges: (schema, table, changes) =>
    invoke<ApplyResult>("db:applyChanges", schema, table, changes),
  listSources: () => invoke<Source[]>("store:list"),
  saveSource: (source) => invoke<Source>("store:save", source),
  deleteSource: (id) => invoke<boolean>("store:delete", id),
  beep: () => invoke<boolean>("app:beep"),
};

contextBridge.exposeInMainWorld("api", api);

// Shared contract between main, preload, and renderer.
//
// This file has no imports/exports, so it's an *ambient global* declaration:
// these types are visible everywhere without importing, and — being types only —
// they compile to nothing. That lets the sandboxed renderer stay a plain global
// script (no require/exports) while still being fully typed.

/** A single table cell, normalized to a string or NULL for transport. */
type Cell = string | null;

interface Column {
  name: string;
  dataType: string;
  ordinal: number;
  notNull: boolean;
  isPk: boolean;
}

interface TableInfo {
  schema: string;
  name: string;
  estRows: number;
}

interface DbMeta {
  database: string | null;
  serverVersion: string | null;
  host: string | null;
}

interface QueryOpts {
  limit?: number;
  offset?: number;
  orderBy?: string | null;
  dir?: "asc" | "desc";
}

interface QueryResult {
  columns: Column[];
  pk: string[];
  rows: Record<string, Cell>[];
  rowCount: number;
  ms: number;
  previewSql: string;
}

/** One row's edit: match by primary key, apply the SET map. */
interface RowChange {
  pk: Record<string, Cell>;
  set: Record<string, Cell>;
}

interface ApplyResult {
  updated: number;
  statements: string[];
}

interface DbStatus {
  connected: boolean;
  meta: DbMeta;
}

/** Uniform IPC envelope: every handler resolves to one of these. */
type IpcOk<T> = { ok: true; data: T };
type IpcErr = { ok: false; error: string };
type IpcResult<T> = IpcOk<T> | IpcErr;

/** The entire surface the renderer can reach (exposed via preload). */
interface Api {
  connect(connectionString: string): Promise<IpcResult<DbMeta>>;
  disconnect(): Promise<IpcResult<boolean>>;
  status(): Promise<IpcResult<DbStatus>>;
  listTables(): Promise<IpcResult<TableInfo[]>>;
  query(schema: string, table: string, opts: QueryOpts): Promise<IpcResult<QueryResult>>;
  applyChanges(
    schema: string,
    table: string,
    changes: RowChange[]
  ): Promise<IpcResult<ApplyResult>>;
  recentConnections(): Promise<IpcResult<string[]>>;
  forgetConnection(connectionString: string): Promise<IpcResult<boolean>>;
}

interface Window {
  api: Api;
}

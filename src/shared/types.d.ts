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

/**
 * An AWS Session Manager port-forward through a bastion instance. When set,
 * `host`/`port` are what the bastion dials (e.g. a private RDS endpoint), and
 * the pool connects to a local port the AWS CLI forwards to it.
 */
interface SsmTunnel {
  /** EC2 instance id of the bastion, e.g. i-00ea5db1a5097f6c3. */
  target: string;
  /** AWS CLI profile; empty uses the CLI's default credential chain. */
  profile: string;
  region: string;
}

/** The Postgres connection fields needed to open a pool. */
interface ConnectConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  tunnel?: SsmTunnel | null;
}

/** A saved data source: a named ConnectConfig with a stable id. */
interface Source extends ConnectConfig {
  id: string;
  name: string;
}

/** Operators available for a structured per-column filter. */
type FilterOp =
  "=" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "starts" | "ends" | "isnull" | "notnull";

/** One structured column filter: `<column> <op> <value>`, parameterized. */
interface ColumnFilter {
  column: string;
  op: FilterOp;
  value: string | null; // ignored for isnull / notnull
}

interface QueryOpts {
  limit?: number;
  offset?: number;
  orderBy?: string | null;
  dir?: "asc" | "desc";
  /** Raw SQL boolean expression appended as a WHERE clause (user-authored). */
  where?: string | null;
  /** Structured per-column filters, ANDed together and with `where`. */
  filters?: ColumnFilter[];
}

interface QueryResult {
  columns: Column[];
  pk: string[];
  rows: Record<string, Cell>[];
  rowCount: number;
  /** Zero-based offset of the first returned row — the current page's start. */
  offset: number;
  /** True when at least one more row exists past this page. */
  hasMore: boolean;
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
  connect(cfg: ConnectConfig): Promise<IpcResult<DbMeta>>;
  testConnection(cfg: ConnectConfig): Promise<IpcResult<DbMeta>>;
  disconnect(): Promise<IpcResult<boolean>>;
  status(): Promise<IpcResult<DbStatus>>;
  listTables(): Promise<IpcResult<TableInfo[]>>;
  tableColumns(
    schema: string,
    table: string,
  ): Promise<IpcResult<{ columns: Column[]; pk: string[] }>>;
  query(schema: string, table: string, opts: QueryOpts): Promise<IpcResult<QueryResult>>;
  countRows(schema: string, table: string, opts: QueryOpts): Promise<IpcResult<string>>;
  applyChanges(
    schema: string,
    table: string,
    changes: RowChange[],
  ): Promise<IpcResult<ApplyResult>>;
  listSources(): Promise<IpcResult<Source[]>>;
  saveSource(source: Source): Promise<IpcResult<Source>>;
  deleteSource(id: string): Promise<IpcResult<boolean>>;
  beep(): Promise<IpcResult<boolean>>;
}

interface Window {
  api: Api;
}

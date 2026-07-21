// All Postgres access lives here, in the main process. The renderer never
// touches the driver — it only sends intent over IPC. Identifiers can't be
// parameterized in SQL, so every table/column name is validated against the
// live catalog before it's quoted into a statement (injection-safe by design).

import { Pool } from "pg";

let pool: Pool | null = null;
let meta: DbMeta = { database: null, serverVersion: null, host: null };

function quoteIdent(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function requirePool(): Pool {
  if (!pool) throw new Error("Not connected to a database.");
  return pool;
}

export async function connect(connectionString: string): Promise<DbMeta> {
  await disconnect();
  const p = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
  });

  // Validate the connection eagerly so the UI gets a real error, not a
  // pool that fails on first query.
  const client = await p.connect();
  try {
    const r = await client.query(
      "select current_database() as db, version() as v, inet_server_addr()::text as host"
    );
    meta = {
      database: r.rows[0].db,
      serverVersion: String(r.rows[0].v).split(" ").slice(0, 2).join(" "),
      host: r.rows[0].host || "local",
    };
  } finally {
    client.release();
  }
  pool = p;
  return { ...meta };
}

export async function disconnect(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end().catch(() => {});
  }
  meta = { database: null, serverVersion: null, host: null };
}

export async function listTables(): Promise<TableInfo[]> {
  const p = requirePool();
  const sql = `
    select n.nspname as schema,
           c.relname  as name,
           greatest(c.reltuples, 0)::bigint as est_rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname not in ('pg_catalog', 'information_schema')
    order by n.nspname, c.relname`;
  const r = await p.query(sql);
  return r.rows.map((row): TableInfo => ({
    schema: row.schema,
    name: row.name,
    estRows: Number(row.est_rows),
  }));
}

export async function getColumns(
  schema: string,
  table: string
): Promise<{ columns: Column[]; pk: string[] }> {
  const p = requirePool();
  const colsSql = `
    select a.attname as name,
           format_type(a.atttypid, a.atttypmod) as data_type,
           a.attnum   as ordinal,
           a.attnotnull as not_null
    from pg_attribute a
    join pg_class c     on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = $1 and c.relname = $2
      and a.attnum > 0 and not a.attisdropped
    order by a.attnum`;
  const pkSql = `
    select a.attname as name
    from pg_index i
    join pg_class c     on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where i.indisprimary and n.nspname = $1 and c.relname = $2`;

  const [cols, pk] = await Promise.all([
    p.query(colsSql, [schema, table]),
    p.query(pkSql, [schema, table]),
  ]);

  if (cols.rows.length === 0) {
    throw new Error(`Table ${schema}.${table} not found.`);
  }

  const pkSet = new Set<string>(pk.rows.map((r) => r.name));
  return {
    columns: cols.rows.map((r): Column => ({
      name: r.name,
      dataType: r.data_type,
      ordinal: r.ordinal,
      notNull: r.not_null,
      isPk: pkSet.has(r.name),
    })),
    pk: pk.rows.map((r) => r.name as string),
  };
}

export async function runQuery(
  schema: string,
  table: string,
  opts: QueryOpts = {}
): Promise<QueryResult> {
  const p = requirePool();
  const { columns, pk } = await getColumns(schema, table);
  const valid = new Set(columns.map((c) => c.name));

  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 5000);
  const offset = Math.max(Number(opts.offset) || 0, 0);

  let orderSql = "";
  if (opts.orderBy && valid.has(opts.orderBy)) {
    const dir = opts.dir === "desc" ? "desc" : "asc";
    orderSql = ` order by ${quoteIdent(opts.orderBy)} ${dir}`;
  }

  const ref = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const sql = `select * from ${ref}${orderSql} limit $1 offset $2`;

  // Fetch one extra row past the page: if it comes back, there's a next page.
  // This gives Prev/Next paging without an expensive COUNT(*) on large tables.
  const started = process.hrtime.bigint();
  const r = await p.query({ text: sql, values: [limit + 1, offset], rowMode: "array" });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;

  const hasMore = r.rows.length > limit;
  const pageArrs = (r.rows as unknown[][]).slice(0, limit);

  // Return rows as objects keyed by column name, with every cell serialized to a
  // string or null so the sandboxed renderer never reasons about pg's JS types.
  const colNames = r.fields.map((f) => f.name);
  const rows = pageArrs.map((arr) => {
    const obj: Record<string, Cell> = {};
    colNames.forEach((name, i) => {
      obj[name] = serializeCell(arr[i]);
    });
    return obj;
  });

  return {
    columns,
    pk,
    rows,
    rowCount: rows.length,
    offset,
    hasMore,
    ms: Math.round(ms * 10) / 10,
    previewSql: `SELECT * FROM ${ref}${orderSql.toUpperCase()} LIMIT ${limit} OFFSET ${offset}`,
  };
}

function serializeCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return "\\x" + v.toString("hex");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Apply a batch of edits in a single transaction. Each change matches one row by
// its primary key and applies the SET map.
export async function applyChanges(
  schema: string,
  table: string,
  changes: RowChange[]
): Promise<ApplyResult> {
  const p = requirePool();
  const { columns, pk } = await getColumns(schema, table);
  if (pk.length === 0) {
    throw new Error(
      `${schema}.${table} has no primary key — inline editing needs one to target rows safely.`
    );
  }
  const valid = new Set(columns.map((c) => c.name));
  const pkSet = new Set(pk);
  const ref = `${quoteIdent(schema)}.${quoteIdent(table)}`;

  const client = await p.connect();
  const statements: string[] = [];
  let updated = 0;

  try {
    await client.query("begin");

    for (const change of changes) {
      const setCols = Object.keys(change.set).filter(
        (c) => valid.has(c) && !pkSet.has(c)
      );
      if (setCols.length === 0) continue;

      for (const k of pk) {
        if (!(k in change.pk)) {
          throw new Error(`Missing primary key value for "${k}".`);
        }
      }

      const setClause = setCols
        .map((c, i) => `${quoteIdent(c)} = $${i + 1}`)
        .join(", ");
      const whereClause = pk
        .map((c, i) => `${quoteIdent(c)} = $${setCols.length + i + 1}`)
        .join(" and ");

      const params: Cell[] = [
        ...setCols.map((c) => change.set[c]),
        ...pk.map((c) => change.pk[c]),
      ];
      const sql = `update ${ref} set ${setClause} where ${whereClause}`;

      const res = await client.query(sql, params);
      if (res.rowCount === 0) {
        throw new Error(
          `No row matched ${pk
            .map((c) => `${c}=${change.pk[c]}`)
            .join(", ")} — it may have been deleted or changed by someone else.`
        );
      }
      updated += res.rowCount ?? 0;
      statements.push(renderStatement(schema, table, setCols, change, pk));
    }

    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  return { updated, statements };
}

function literal(v: Cell): string {
  if (v === null || v === undefined) return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function renderStatement(
  schema: string,
  table: string,
  setCols: string[],
  change: RowChange,
  pk: string[]
): string {
  const ref = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const sets = setCols
    .map((c) => `${quoteIdent(c)} = ${literal(change.set[c])}`)
    .join(", ");
  const where = pk
    .map((c) => `${quoteIdent(c)} = ${literal(change.pk[c])}`)
    .join(" AND ");
  return `UPDATE ${ref} SET ${sets} WHERE ${where};`;
}

export function isConnected(): boolean {
  return !!pool;
}

export function currentMeta(): DbMeta {
  return { ...meta };
}

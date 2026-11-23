const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loader } = require("./load.cjs");
const load = loader();
const { rowKeyOf, displayRowKey } = load("src/renderer/src/lib/rowKey.ts");
const { dirtyKey, groupDirtyByRow } = load("src/renderer/src/lib/dirty.ts");
const { WorkspaceRequests } = load("src/renderer/src/lib/workspaceRequests.ts");
const { tableReducer, hasPendingEdits } = load("src/renderer/src/state/tableStore.tsx");
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const ok = (data) => ({ ok: true, data });

test("composite keys and dirty cells cannot collide", () => {
  const rows = [
    { a: "1", b: "23" },
    { a: "12", b: "3" },
  ];
  const keys = rows.map((row) => rowKeyOf(["a", "b"], row));
  assert.notEqual(keys[0], keys[1]);
  assert.equal(
    rows.find((row) => rowKeyOf(["a", "b"], row) === keys[1]),
    rows[1],
  );
  assert.notEqual(dirtyKey("1", "23"), dirtyKey("12", "3"));
  const dirty = Object.fromEntries(
    keys.map((key, i) => [
      dirtyKey(key, "value"),
      {
        rowKey: key,
        pkVals: rows[i],
        col: "value",
        old: "old",
        val: `new${i}`,
      },
    ]),
  );
  assert.deepEqual(
    groupDirtyByRow(dirty).map((c) => c.pk),
    rows,
  );
});

test("keyless duplicate rows have distinct page identities", () => {
  const rows = [{ value: "same" }, { value: "same" }];
  assert.notEqual(displayRowKey([], rows[0], 0), displayRowKey([], rows[1], 1));
  const filtered = [rows[1]];
  assert.equal(displayRowKey([], filtered[0], rows.indexOf(filtered[0])), "row:1");
});

function workspace(api, dirty = {}) {
  let state = { ...tableReducer({}, { type: "CLEAR_WORKSPACE" }), dirty };
  const requests = new WorkspaceRequests();
  const toasts = [];
  const sourceActions = [];
  let discard = true;
  const tableStore = {
    hasPendingEdits,
    useTableState: () => state,
    useTableDispatch: () => (action) => {
      state = tableReducer(state, action);
    },
    useWorkspaceRequests: () => requests,
  };
  const modules = loader(
    {
      react: { useCallback: (fn) => fn },
      "../state/tableStore": tableStore,
      "../state/toastStore": { useToast: () => ({ show: (...args) => toasts.push(args) }) },
      "../state/confirmStore": {
        useConfirm: () => async () => true,
        useConfirmDiscard: () => async () => discard,
      },
      "../state/sourcesStore": {
        useSourcesState: () => ({ sources: [{ id: "A", name: "A" }], connectedId: "A" }),
        useSourcesDispatch: () => (action) => sourceActions.push(action),
      },
    },
    { window: { api } },
  );
  return {
    table: () => modules("src/renderer/src/hooks/useTableActions.ts").useTableActions(),
    source: () => modules("src/renderer/src/hooks/useSourceActions.ts").useSourceActions(),
    get state() {
      return state;
    },
    requests,
    toasts,
    sourceActions,
    declineDiscard: () => {
      discard = false;
    },
  };
}
function result(name) {
  return ok({
    columns: [],
    pk: ["id"],
    rows: [{ id: "1", value: name }],
    offset: 0,
    hasMore: false,
    ms: 1,
    previewSql: name,
  });
}

test("late table A result cannot replace table B across hook instances", async () => {
  const a = deferred(),
    b = deferred();
  const w = workspace({ query: (_, table) => (table === "A" ? a.promise : b.promise) });
  const first = w.table().openTable("public", "A");
  const second = w.table().openTable("public", "B");
  b.resolve(result("B"));
  await second;
  a.resolve(result("A"));
  await first;
  assert.equal(w.state.current.name, "B");
  assert.equal(w.state.rows[0].value, "B");
});

test("late sort result cannot replace a newer filter and its query state", async () => {
  const sorted = deferred(),
    filtered = deferred();
  const w = workspace({
    query: (_, __, opts) =>
      opts.where
        ? filtered.promise
        : opts.orderBy
          ? sorted.promise
          : Promise.resolve(result("initial")),
  });
  await w.table().openTable("public", "A");
  const first = w.table().setSort("value");
  const second = w.table().applyWhere("id = 1");
  filtered.resolve(result("filtered"));
  await second;
  sorted.resolve(result("sorted"));
  await first;
  assert.equal(w.state.rows[0].value, "filtered");
  assert.equal(w.state.where, "id = 1");
  assert.equal(w.state.sortCol, null);
});

test("disconnect invalidates outstanding results", async () => {
  const pending = deferred();
  const w = workspace({ query: () => pending.promise, disconnect: async () => ok(true) });
  const query = w.table().openTable("public", "A");
  await w.source().disconnect();
  pending.resolve(result("old"));
  await query;
  assert.equal(w.state.current, null);
  assert.deepEqual(w.state.rows, []);
});

test("failed filter preserves the last result and applied settings", async () => {
  const w = workspace({
    query: (_, __, opts) =>
      Promise.resolve(opts.where ? { ok: false, error: "syntax error" } : result("initial")),
  });
  await w.table().openTable("public", "A");
  await w.table().applyWhere("invalid SQL");
  assert.equal(w.state.rows[0].value, "initial");
  assert.equal(w.state.where, "");
  assert.equal(w.toasts.at(-1)[0], "syntax error");
});

test("saving blocks table and connection switches until the refresh completes", async () => {
  const pending = deferred();
  let connections = 0;
  const w = workspace({
    query: async () => result("saved"),
    applyChanges: () => pending.promise,
    connect: async () => {
      connections++;
      return ok({});
    },
  });
  await w.table().openTable("public", "A");
  w.state.dirty = {
    edit: { rowKey: "1", pkVals: { id: "1" }, col: "value", old: "old", val: "new" },
  };
  const save = w.table().save();
  await w.table().openTable("public", "B");
  await w.source().connect({ id: "B" });
  assert.equal(w.state.current.name, "A");
  assert.equal(connections, 0);
  pending.resolve(ok({ updated: 1 }));
  await save;
  assert.equal(w.requests.busy, false);
  assert.deepEqual(w.state.dirty, {});
});

test("failed connection preserves workspace and rejects stale query results", async () => {
  const pending = deferred();
  const w = workspace({
    query: () => pending.promise,
    connect: async () => ({ ok: false, error: "unreachable" }),
  });
  const query = w.table().openTable("public", "A");
  await w.source().connect({ id: "B" });
  pending.resolve(result("old"));
  await query;
  assert.equal(w.state.current.name, "A");
  assert.deepEqual(w.state.rows, []);
  assert.equal(w.requests.busy, false);
  assert.equal(w.sourceActions.at(-1).type, "CONNECT_ERROR");
});

test("declining discard aborts deletion of the active source", async () => {
  let deleted = false,
    disconnected = false;
  const w = workspace(
    {
      disconnect: async () => {
        disconnected = true;
        return ok(true);
      },
      deleteSource: async () => {
        deleted = true;
        return ok(true);
      },
    },
    { pending: {} },
  );
  w.declineDiscard();
  await w.source().deleteSource("A");
  assert.equal(deleted, false);
  assert.equal(disconnected, false);
});

test("accepted discard allows disconnect and deletion", async () => {
  const calls = [];
  const w = workspace(
    {
      disconnect: async () => {
        calls.push("disconnect");
        return ok(true);
      },
      deleteSource: async () => {
        calls.push("delete");
        return ok(true);
      },
      listSources: async () => ok([]),
    },
    { pending: {} },
  );
  await w.source().deleteSource("A");
  assert.deepEqual(calls, ["disconnect", "delete"]);
});

function database({ openTunnel, write } = {}) {
  const pools = [];
  const Result = require("pg/lib/result");
  class Pool {
    constructor(config) {
      this.config = config;
      this.ended = false;
      this.queries = [];
      pools.push(this);
    }
    async end() {
      this.ended = true;
    }
    async connect() {
      if (this.config.host === "bad") throw Error("unreachable");
      return {
        query: async (sql, params) => {
          if (!sql.startsWith("select current_database")) return write?.(sql, params);
          if (this.probe) await this.probe.promise;
          return { rows: [{ db: this.config.database, v: "PostgreSQL 17", host: "local" }] };
        },
        release() {},
      };
    }
    async query(sql) {
      this.queries.push(sql);
      if (typeof sql === "string") {
        if (sql.includes("from pg_index")) return { rows: [{ name: "id" }, { name: "Part" }] };
        return {
          rows: ["id", "Part", "value"].map((name, i) => ({
            name,
            data_type: "text",
            ordinal: i + 1,
            not_null: true,
          })),
        };
      }
      const result = new Result(sql.rowMode, sql.types);
      result.addFields([
        { name: "id", dataTypeID: 3802 },
        { name: "Part", dataTypeID: 1114 },
        { name: "value", dataTypeID: 1007 },
        { name: "nullable", dataTypeID: 25 },
      ]);
      result.rows.push(
        result.parseRow(['{"id":9007199254740993}', "2026-01-01 12:00:00.123456", "{1,2,3}", null]),
      );
      return result;
    }
  }
  const mocks = { pg: { Pool }, ...(openTunnel && { "./tunnel": { openTunnel } }) };
  return { db: loader(mocks)("src/main/db.ts"), pools };
}
const cfg = (database, host = "localhost") => ({ database, host, user: "postgres", port: 5432 });

test("query preserves JSON precision, timestamp microseconds, arrays and NULL through pg parsing", async () => {
  const { db } = database();
  await db.connect(cfg("A"));
  const result = await db.runQuery("public", "items");
  assert.deepEqual(result.rows[0], {
    id: '{"id":9007199254740993}',
    Part: "2026-01-01 12:00:00.123456",
    value: "{1,2,3}",
    nullable: null,
  });
});

test("pagination orders by the complete primary key and preserves quoted case in preview", async () => {
  const { db, pools } = database();
  await db.connect(cfg("A"));
  const first = await db.runQuery("public", "items");
  assert.match(pools[0].queries.at(-1).text, /order by "id" asc, "Part" asc/);
  assert.match(first.previewSql, /"Part" asc/);
  await db.runQuery("public", "items", { orderBy: "value", dir: "desc", offset: 200 });
  assert.match(pools[0].queries.at(-1).text, /order by "value" desc, "id" asc, "Part" asc/);
  await db.runQuery("public", "items", { orderBy: "id", dir: "desc" });
  assert.match(pools[0].queries.at(-1).text, /order by "id" desc, "Part" asc/);
});

test("an edit conflict rolls back earlier updates and preserves the original NULL guard", async () => {
  const queries = [];
  let updates = 0;
  const { db } = database({
    write(sql, params) {
      queries.push({ sql, params });
      if (sql.startsWith("UPDATE")) return { rowCount: ++updates === 1 ? 1 : 0 };
    },
  });
  await db.connect(cfg("A"));
  const edits = [
    { pk: { id: "1", Part: "a" }, set: { value: "next" }, original: { value: null } },
    { pk: { id: "2", Part: "a" }, set: { value: "again" }, original: { value: "" } },
  ];
  await assert.rejects(db.applyChanges("public", "items", edits), /changed or been deleted/);
  assert.deepEqual(
    queries.map(({ sql }) => sql.split(" ")[0]),
    ["begin", "UPDATE", "UPDATE", "rollback"],
  );
  assert.match(queries[1].sql, /WHERE "id" = \$2 AND "Part" = \$3 AND .*IS NOT DISTINCT FROM \$4/);
  assert.deepEqual(queries[1].params, ["next", "1", "a", null]);
  assert.deepEqual(queries[2].params, ["again", "2", "a", ""]);

  await assert.rejects(
    db.applyChanges("public", "items", [{ ...edits[0], original: {} }]),
    /Missing original value/,
  );
  assert.equal(updates, 2);
});

test("TLS verifies the database hostname for direct connections and SSM forwards", async () => {
  const { db, pools } = database({
    openTunnel: async () => ({ localPort: 12345, close() {} }),
  });
  const host = "database.example.test";
  const options = { ...cfg("A", host), ssl: true, sslCa: "test CA" };
  const certificate = { subjectaltname: "DNS:" + host };
  await db.testConnect(options);
  await db.testConnect({ ...options, tunnel: {} });
  assert.equal(pools[0].config.host, host);
  assert.equal(pools[1].config.host, "127.0.0.1");
  for (const {
    config: { ssl },
  } of pools) {
    assert.equal(ssl.rejectUnauthorized, true);
    assert.equal(ssl.servername, host);
    assert.deepEqual(ssl.ca, ["test CA"]);
    assert.equal(ssl.checkServerIdentity("127.0.0.1", certificate), undefined);
    assert.equal(
      ssl.checkServerIdentity(host, { subjectaltname: "DNS:wrong.example.test" }).code,
      "ERR_TLS_CERT_ALTNAME_INVALID",
    );
  }
});

test("RDS hosts trust the bundled Amazon RDS roots plus Node's public roots", async () => {
  const { rootCertificates } = require("node:tls");
  const { RDS_CA_BUNDLE } = loader()("src/main/rdsCaBundle.ts");
  const { db, pools } = database({
    openTunnel: async () => ({ localPort: 12345, close() {} }),
  });
  const rds = "dev.abc123.eu-west-1.rds.amazonaws.com";
  await db.testConnect({ ...cfg("A", rds), ssl: true, tunnel: {} });
  await db.testConnect({ ...cfg("A", rds), ssl: true, sslCa: "extra CA" });
  await db.testConnect({ ...cfg("A", "db.example.test"), ssl: true });
  await db.testConnect({ ...cfg("A", "rds.amazonaws.com.example.test"), ssl: true });
  const [tunnelled, withExtra, plain, lookalike] = pools.map((p) => p.config.ssl.ca);
  assert.deepEqual(tunnelled, [...rootCertificates, RDS_CA_BUNDLE]);
  assert.deepEqual(withExtra, [...rootCertificates, RDS_CA_BUNDLE, "extra CA"]);
  assert.equal(plain, undefined, "non-RDS hosts keep Node's default trust store");
  assert.equal(lookalike, undefined, "only real *.rds.amazonaws.com hosts get the RDS roots");
  assert.equal(pools[0].config.ssl.servername, rds);
  assert.ok((RDS_CA_BUNDLE.match(/BEGIN CERTIFICATE/g) ?? []).length >= 10);
});

test("disconnect invalidates a connection still resolving saved credentials", async () => {
  const { db, pools } = database();
  const config = deferred();
  const connecting = db.connect(() => config.promise);
  await db.disconnect();
  config.resolve(cfg("A"));
  await assert.rejects(connecting, /superseded/);
  assert.equal(pools.length, 0);
});

test("failed replacement leaves the original pool and metadata connected", async () => {
  const { db, pools } = database();
  await db.connect(cfg("A"));
  await assert.rejects(db.connect(cfg("B", "bad")), /unreachable/);
  assert.equal(db.isConnected(), true);
  assert.equal(db.currentMeta().database, "A");
  assert.equal(pools[0].ended, false);
  assert.equal(pools[1].ended, true);
  await db.connect(cfg("C"));
  assert.equal(pools[0].ended, true);
  assert.equal(db.currentMeta().database, "C");
});

test("disconnect cancels an in-flight connection attempt", async () => {
  const { db, pools } = database();
  const attempt = db.connect(cfg("A"));
  const probe = deferred();
  pools[0].probe = probe;
  await db.disconnect();
  probe.resolve();
  await assert.rejects(attempt, /superseded/);
  assert.equal(db.isConnected(), false);
  assert.equal(pools[0].ended, true);
});

test("a slower connection cannot replace a newer successful connection", async () => {
  const { db, pools } = database();
  const first = db.connect(cfg("A"));
  const probe = deferred();
  pools[0].probe = probe;
  await db.connect(cfg("B"));
  probe.resolve();
  await assert.rejects(first, /superseded/);
  assert.equal(db.currentMeta().database, "B");
  assert.equal(pools[0].ended, true);
  assert.equal(pools[1].ended, false);
});

function storage(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-data-studio-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = loader({ electron: { app: { getPath: () => dir } }, fs: { ...fs, ...overrides } })(
    "src/main/store.ts",
  );
  return { store, dir, file: path.join(dir, "connections.json") };
}
const source = { id: "A", name: "A", host: "localhost", database: "postgres", user: "postgres" };

test("source writes persist atomically and leave no temporary files", async (t) => {
  const { store, dir } = storage(t);
  await store.saveSource(source);
  assert.deepEqual(await store.listSources(), [source]);
  assert.deepEqual(fs.readdirSync(dir), ["connections.json"]);
  await store.deleteSource("A");
  assert.deepEqual(await store.listSources(), []);
});

test("write failure is reported and existing sources survive", async (t) => {
  const { store, file, dir } = storage(t, {
    writeFileSync: () => {
      throw Error("disk full");
    },
  });
  fs.writeFileSync(file, JSON.stringify({ sources: [source] }));
  await assert.rejects(store.saveSource({ ...source, id: "B" }), /disk full/);
  assert.deepEqual(await store.listSources(), [source]);
  assert.deepEqual(fs.readdirSync(dir), ["connections.json"]);
});

test("rename failure is reported and existing sources survive", async (t) => {
  const { store, file, dir } = storage(t, {
    renameSync: () => {
      throw Error("permission denied");
    },
  });
  fs.writeFileSync(file, JSON.stringify({ sources: [source] }));
  await assert.rejects(store.deleteSource("A"), /permission denied/);
  assert.deepEqual(await store.listSources(), [source]);
  assert.deepEqual(fs.readdirSync(dir), ["connections.json"]);
});

test("corrupt source file is not silently overwritten", async (t) => {
  const { store, file } = storage(t);
  fs.writeFileSync(file, "{broken");
  await assert.rejects(store.saveSource(source));
  assert.equal(fs.readFileSync(file, "utf8"), "{broken");
});

test("NULL, empty strings and whitespace are distinct pending edits", () => {
  const { isValueChanged } = load("src/renderer/src/lib/dirty.ts");
  assert.equal(isValueChanged(null, ""), true);
  assert.equal(isValueChanged("", " "), true);
  assert.equal(isValueChanged(null, null), false);
});

test("selection bounds work in both drag directions and TSV quotes delimiters", () => {
  const { selectionBounds, toTsv } = load("src/renderer/src/lib/gridSelection.ts");
  assert.deepEqual(selectionBounds({ row: 3, col: 2 }, { row: 1, col: 0 }), {
    top: 1,
    bottom: 3,
    left: 0,
    right: 2,
  });
  assert.equal(
    toTsv([
      ["a\tb", 'say "hi"', null],
      ["line\nbreak", "", "x"],
    ]),
    '"a\tb"\t"say ""hi"""\t\n"line\nbreak"\t\tx',
  );
});

test("JSON formatting preserves number tokens and escaped strings", () => {
  const { formatJson } = load("src/renderer/src/lib/jsonFormat.ts");
  const text = '{"number":9007199254740993,"exp":1e1000,"string":"a\\\"b","array":[]}';
  const formatted = formatJson(text);
  assert.match(formatted, /9007199254740993/);
  assert.match(formatted, /1e1000/);
  assert.deepEqual(JSON.parse(formatted), JSON.parse(text));
  assert.throws(() => formatJson("{bad"));
});

function edit(state, value) {
  return tableReducer(state, {
    type: "COMMIT_CELL",
    rowKey: "row",
    col: "name",
    pkVals: { id: "1" },
    orig: "original",
    val: value,
  });
}

test("undo and redo retain exact values and new edits clear redo history", () => {
  let state = tableReducer({}, { type: "CLEAR_WORKSPACE" });
  state = edit(state, "");
  state = edit(state, null);
  state = tableReducer(state, { type: "UNDO" });
  assert.equal(Object.values(state.dirty)[0].val, "");
  state = tableReducer(state, { type: "REDO" });
  assert.equal(Object.values(state.dirty)[0].val, null);
  state = tableReducer(state, { type: "UNDO" });
  state = edit(state, "new");
  assert.deepEqual(state.future, []);
});

test("tab switching and closing preserve each tab's unsaved changes", () => {
  let state = tableReducer({}, { type: "CLEAR_WORKSPACE" });
  state = tableReducer(state, { type: "OPEN_TABLE", schema: "public", name: "A" });
  state = edit(state, "A edit");
  state = tableReducer(state, { type: "OPEN_TABLE", schema: "public", name: "B" });
  state = edit(state, "B edit");
  state = tableReducer(state, { type: "OPEN_TABLE", schema: "public", name: "A" });
  assert.equal(Object.values(state.dirty)[0].val, "A edit");
  assert.equal(state.past.length, 1);
  state = tableReducer(state, { type: "CLOSE_TAB", schema: "public", name: "A" });
  assert.equal(state.current.name, "B");
  assert.equal(Object.values(state.dirty)[0].val, "B edit");
  state = tableReducer(state, { type: "CLEAR_WORKSPACE" });
  assert.deepEqual(state.tabs, []);
  assert.deepEqual(state.snapshots, {});
});

test("retry repeats the failed query rather than the last successful filter", async () => {
  const queries = [];
  const w = workspace({
    query: (_, __, opts) => {
      queries.push(opts);
      return Promise.resolve(opts.where ? { ok: false, error: "bad filter" } : result("initial"));
    },
  });
  await w.table().openTable("public", "A");
  await w.table().applyWhere("bad");
  await w.table().retry();
  assert.equal(queries.at(-1).where, "bad");
  assert.equal(w.state.where, "");
  assert.equal(w.state.loading, false);
  assert.equal(w.state.error, "bad filter");
});

test("page size changes reset the offset and subsequent pages use the new size", async () => {
  const queries = [];
  const w = workspace({
    query: (_, __, opts) => {
      queries.push(opts);
      return Promise.resolve({
        ...result("page"),
        data: { ...result("page").data, offset: opts.offset },
      });
    },
  });
  await w.table().openTable("public", "A");
  await w.table().refresh(500);
  assert.equal(w.state.pageSize, 500);
  await w.table().goToPage(1);
  assert.equal(queries.at(-1).offset, 500);
  await w.table().refresh(1000);
  assert.equal(queries.at(-1).offset, 0);
});

test("disconnect also checks edits in background tabs", async () => {
  let disconnected = false;
  const w = workspace({
    query: async () => result("page"),
    disconnect: async () => {
      disconnected = true;
      return ok(true);
    },
  });
  await w.table().openTable("public", "A");
  w.state.dirty = { pending: {} };
  await w.table().openTable("public", "B");
  w.declineDiscard();
  assert.equal(await w.source().disconnect(), false);
  assert.equal(disconnected, false);
});

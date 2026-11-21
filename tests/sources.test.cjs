const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loader } = require("./load.cjs");

function storage(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-data-studio-sources-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const safeStorage = {
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => "gnome_libsecret",
    encryptStringAsync: async (value) => Buffer.from("mock:" + value),
    decryptStringAsync: async (buffer) => ({ result: buffer.toString().slice(5) }),
    ...overrides,
  };
  const store = loader({ electron: { app: { getPath: () => dir }, safeStorage } })(
    "src/main/store.ts",
  );
  return { store, dir, file: path.join(dir, "connections.json") };
}

const source = { id: "A", name: "A", host: "localhost", database: "postgres", user: "postgres" };

function watching(t, store) {
  let calls = 0;
  const waiters = [];
  const stop = store.watchSources(() => {
    calls++;
    waiters.splice(0).forEach((resolve) => resolve());
  }, 30);
  t.after(stop);
  const next = (ms = 2000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no change event")), ms);
      waiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  return { next, count: () => calls };
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// macOS can report the setup write after the watcher has started, so count
// only what arrives once that has drained.
async function baseline(watch) {
  await settle(500);
  return watch.count();
}

test("connections read the current file, including edits made outside the app", async (t) => {
  const { store, file } = storage(t);
  await store.saveSource(source);
  const edited = {
    ...source,
    tunnel: { target: "i-0123456789abcdef0", profile: "", region: "eu-west-1" },
  };
  fs.writeFileSync(file, JSON.stringify({ sources: [edited] }));
  assert.deepEqual(await store.connectionConfig("A"), { ...edited, password: "" });
  await assert.rejects(store.connectionConfig("missing"), /no longer exists/);
});

test("plaintext passwords migrate once and stay out of all source metadata", async (t) => {
  const { store, file } = storage(t);
  fs.writeFileSync(file, JSON.stringify({ sources: [{ ...source, password: "legacy secret" }] }));
  assert.deepEqual(await store.listSources(), [{ ...source, hasSavedPassword: true }]);
  const saved = JSON.parse(fs.readFileSync(file, "utf8")).sources[0];
  assert.equal(saved.password, undefined);
  assert.equal(saved.encryptedPassword, Buffer.from("mock:legacy secret").toString("base64"));
  assert.equal((await store.connectionConfig("A")).password, "legacy secret");
  assert.equal(
    (await store.testConnectionConfig({ ...source, host: "new-host" })).password,
    "legacy secret",
  );
  assert.equal((await store.testConnectionConfig({ ...source, password: "" })).password, "");
  const renamed = await store.saveSource({ ...source, name: "Renamed" });
  assert.deepEqual(renamed, { ...source, name: "Renamed", hasSavedPassword: true });
  const copy = await store.duplicateSource(renamed.id);
  assert.notEqual(copy.id, renamed.id);
  assert.equal(copy.hasSavedPassword, true);
  assert.equal(Object.hasOwn(copy, "encryptedPassword"), false);
  assert.equal((await store.connectionConfig(copy.id)).password, "legacy secret");
  assert.equal((await store.saveSource({ ...source, password: "" })).hasSavedPassword, undefined);
  assert.equal((await store.connectionConfig("A")).password, "");
});

test("legacy URL migration removes embedded passwords", async (t) => {
  const { store, file } = storage(t);
  fs.writeFileSync(
    file,
    JSON.stringify({ recent: ["postgres://alice:legacy%20secret@localhost/db"] }),
  );
  const [saved] = await store.listSources();
  assert.equal(saved.hasSavedPassword, true);
  assert.equal((await store.connectionConfig(saved.id)).password, "legacy secret");
  assert.deepEqual(
    (await store.listSources()).map((entry) => entry.id),
    [saved.id],
  );
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).recent, undefined);
});

test("unavailable OS storage preserves legacy files and refuses new plaintext writes", async (t) => {
  const { store, file } = storage(t, { isAsyncEncryptionAvailable: async () => false });
  await assert.rejects(store.saveSource({ ...source, password: "secret" }), /unavailable/);
  assert.equal(fs.existsSync(file), false);
  const legacy = JSON.stringify({ sources: [{ ...source, password: "legacy secret" }] });
  fs.writeFileSync(file, legacy);
  await assert.rejects(store.listSources(), /unavailable/);
  assert.equal(fs.readFileSync(file, "utf8"), legacy);
});

test("concurrent saves preserve both sources", async (t) => {
  const { store } = storage(t);
  await Promise.all([
    store.saveSource({ ...source, password: "first" }),
    store.saveSource({ ...source, id: "B", password: "second" }),
  ]);
  assert.deepEqual(
    (await store.listSources()).map(({ id }) => id),
    ["A", "B"],
  );
});

test("an external atomic replace of connections.json is reported", async (t) => {
  const { store, file } = storage(t);
  await store.saveSource(source);
  const watch = watching(t, store);
  await settle(100);
  const changed = watch.next();
  const temp = file + ".external.tmp";
  fs.writeFileSync(temp, JSON.stringify({ sources: [{ ...source, name: "renamed" }] }));
  fs.renameSync(temp, file);
  await changed;
  assert.equal((await store.connectionConfig("A")).name, "renamed");
});

test("a burst of writes is coalesced into one reload", async (t) => {
  const { store, file } = storage(t);
  await store.saveSource(source);
  const watch = watching(t, store);
  const before = await baseline(watch);
  const changed = watch.next();
  for (let i = 0; i < 5; i++)
    fs.writeFileSync(file, JSON.stringify({ sources: [{ ...source, name: `n${i}` }] }));
  await changed;
  await settle(150);
  assert.equal(watch.count() - before, 1);
});

test("other files in the user-data directory don't trigger a reload", async (t) => {
  const { store, dir } = storage(t);
  await store.saveSource(source);
  const watch = watching(t, store);
  const before = await baseline(watch);
  fs.writeFileSync(path.join(dir, "Cookies"), "chromium churn");
  await settle(300);
  assert.equal(watch.count() - before, 0);
});

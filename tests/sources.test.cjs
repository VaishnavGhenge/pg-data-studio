const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loader } = require("./load.cjs");

function storage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-data-studio-sources-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = loader({ electron: { app: { getPath: () => dir } } })("src/main/store.ts");
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

test("getSource reads the current file, including edits made outside the app", (t) => {
  const { store, file } = storage(t);
  store.saveSource(source);
  const edited = {
    ...source,
    tunnel: { target: "i-0123456789abcdef0", profile: "", region: "eu-west-1" },
  };
  fs.writeFileSync(file, JSON.stringify({ sources: [edited] }));
  assert.deepEqual(store.getSource("A"), edited);
  assert.equal(store.getSource("missing"), null);
});

test("an external atomic replace of connections.json is reported", async (t) => {
  const { store, file } = storage(t);
  store.saveSource(source);
  const watch = watching(t, store);
  await settle(100);
  const changed = watch.next();
  const temp = file + ".external.tmp";
  fs.writeFileSync(temp, JSON.stringify({ sources: [{ ...source, name: "renamed" }] }));
  fs.renameSync(temp, file);
  await changed;
  assert.equal(store.getSource("A").name, "renamed");
});

test("a burst of writes is coalesced into one reload", async (t) => {
  const { store, file } = storage(t);
  store.saveSource(source);
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
  store.saveSource(source);
  const watch = watching(t, store);
  const before = await baseline(watch);
  fs.writeFileSync(path.join(dir, "Cookies"), "chromium churn");
  await settle(300);
  assert.equal(watch.count() - before, 0);
});

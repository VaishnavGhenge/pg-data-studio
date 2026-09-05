const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Load the real TypeScript modules with replaceable I/O boundaries. No Electron
// process or database credentials are needed for these regression tests.
exports.loader = function (mocks = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    function localRequire(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (!id.startsWith(".")) return require(id);
      const base = path.resolve(path.dirname(file), id);
      return load([".ts", ".tsx", ""].map((ext) => base + ext).find((p) => fs.existsSync(p)));
    }
    new Function("require", "module", "exports", ...Object.keys(globals), code)(
      localRequire,
      mod,
      mod.exports,
      ...Object.values(globals),
    );
    return mod.exports;
  }
  return load;
};

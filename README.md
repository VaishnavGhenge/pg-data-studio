# PG Data Studio

A simple, fast Postgres data viewer and editor. Browse tables, sort, filter, edit
cells inline, and commit changes — with every edit tracked by primary key and shown
as SQL before it runs.

Built with Electron and TypeScript. All database access happens in the main
process; the renderer is sandboxed and talks to it over a minimal, fully typed
IPC bridge.

## Requirements

- Node.js 18+
- A reachable Postgres database

## Run it

```bash
npm install
npm start        # compiles TS → dist/, then launches Electron
```

For development, run the compiler in watch mode in one terminal and Electron in
another:

```bash
npm run watch    # tsc -w
npm start        # re-run after a rebuild
```

On launch you'll get a connect screen. Paste a connection string:

```
postgres://user:password@localhost:5432/dbname
```

It's remembered for next time (stored in plaintext in the app's user-data dir —
same trust model as a local `.env`).

## What it does

- **Browse** — tables grouped by schema in the sidebar, with row estimates.
- **View** — first 200 rows, server-side sort by clicking a column header.
- **Filter** — quick client-side filter over the loaded rows.
- **Edit** — click any non-key cell and type. Empty a cell to set `NULL`.
- **Review** — the pending bar shows the exact `UPDATE … WHERE <pk> = …` per row.
- **Save** — all edits apply in one transaction; on failure, nothing is written.

Editing needs a primary key: it's what maps an edited cell back to the right row.
Tables without one are read-only (by design — safer than guessing).

## Architecture

```
src/
  shared/
    types.d.ts  Ambient types shared by all three layers (compile to nothing)
  main/
    index.ts    Electron entry, window, IPC handlers (thin wrappers)
    db.ts       All pg access; identifier validation + parameterized SQL
    store.ts    Remembers recent connection strings
  preload/
    index.ts    contextBridge → window.api (the only renderer↔main surface)
  renderer/
    index.html
    styles.css
    app.ts      UI only; no Node, no DB — sandboxed global script
```

TypeScript compiles `src/ → dist/` (`tsc`), and a small `scripts/copy-assets.js`
copies the renderer's HTML/CSS into `dist/`. No bundler. The shared `types.d.ts`
has no imports/exports, so its types are globally visible to every layer and the
renderer stays a plain browser script — no `require` at runtime.

Security posture: `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, strict CSP, external links open in the OS browser.

## Package a distributable

```bash
npm run dist        # current platform
npm run dist:mac    # .dmg
```

Output lands in `release/`.

## Known limitations (v0.1)

- SELECT is capped at 200 rows; no paging UI yet.
- Editing complex types (jsonb, arrays) round-trips as text — fine for scalars,
  rough for nested values.
- No row insert/delete yet, and no free-form SQL editor.
- Filter is client-side over loaded rows, not a server-side `WHERE`.

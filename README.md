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
npm run dev      # electron-vite dev — HMR for the renderer, launches Electron
```

`npm start` builds and runs a production build via `electron-vite preview`, for
smoke-testing without packaging a distributable.

On first launch, click **+** in the sidebar to add a data source — a structured
form (host/port/user/password/database/SSL) that stays in sync with a raw
`postgres://` URL field, whichever you'd rather edit. Saved sources are
remembered for next time (stored in plaintext in the app's user-data dir — same
trust model as a local `.env`).

## What it does

- **Browse** — tables grouped by schema in the sidebar, with row estimates.
- **View** — first 200 rows, server-side sort by clicking a column header.
- **Filter** — quick client-side filter over the loaded rows.
- **Edit** — click a non-key cell to select it, double-click (or Enter) to
  edit. Empty a cell to set `NULL`.
- **Review** — dirty cells/rows are highlighted; Save/Revert live in the
  toolbar with a live pending-change count.
- **Save** — all edits apply in one transaction; on failure, nothing is written.

Editing needs a primary key: it's what maps an edited cell back to the right row.
Tables without one are read-only (by design — safer than guessing).

## Architecture

```
src/
  shared/
    types.d.ts    Ambient types shared by all three layers (compile to nothing)
  main/
    index.ts      Electron entry, window, IPC handlers (thin wrappers), CSP header
    db.ts         All pg access; identifier validation + parameterized SQL
    store.ts      Persists saved data sources
  preload/
    index.ts      contextBridge → window.api (the only renderer↔main surface)
  renderer/
    index.html    Mounts a single #root
    src/
      main.tsx, App.tsx     React entry + top-level composition
      state/                Context + useReducer stores (sources/table/toast/confirm)
      hooks/                IPC + action orchestration (useSourceActions, useTableActions, …)
      lib/                  Pure helpers (dirty-tracking math, row identity, filter ops)
      components/           layout/, navigator/, grid/, common/
```

Built with **electron-vite**: main/preload compile as plain TypeScript, the
renderer is React + TypeScript via Vite (with HMR in `npm run dev`). The shared
`types.d.ts` has no imports/exports, so its types are globally visible to every
layer without an explicit import.

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

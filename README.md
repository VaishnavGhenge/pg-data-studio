# PG Data Studio

A simple, fast Postgres data viewer and editor. Browse tables, sort, filter, edit
cells inline, and commit changes — with every edit tracked by primary key and shown
as SQL before it runs.

Built with Electron and TypeScript. All database access happens in the main
process; the renderer is sandboxed and talks to it over a minimal, fully typed
IPC bridge.

## Install (beta)

Grab the latest `.dmg` from
[Releases](https://github.com/VaishnavGhenge/pg-data-studio/releases). Apple
Silicon only, macOS 11 or later.

The build is not signed with an Apple Developer ID, so macOS quarantines it.
After dragging the app into Applications:

1. Open it. macOS refuses, saying it cannot verify the developer.
2. Go to System Settings > Privacy & Security, scroll down to Security, and
   click **Open Anyway**. You have about an hour from the failed launch before
   that button disappears; if it does, open the app again to bring it back.
3. Confirm. Every launch after that is normal.

Check what you downloaded against the release's `SHA256SUMS.txt`:

```bash
shasum -a 256 -c SHA256SUMS.txt
```

Building from source skips all of this. Locally built apps never carry the
quarantine flag.

## Requirements

- Node.js 20.19+ or 22.12+ (required by the installed Vite toolchain)
- A reachable Postgres database

## Run it

```bash
npm install
npm run dev      # electron-vite dev — HMR for the renderer, launches Electron
```

Run `npm run build` first, then `npm start` to preview that production build
without packaging a distributable.

On first launch, click **+** in the sidebar to add a data source — a structured
form (host/port/user/password/database/SSL) that stays in sync with a raw
`postgres://` URL field, whichever you'd rather edit. Saved sources are
remembered for next time (stored in plaintext in the app's user-data dir — same
trust model as a local `.env`).

## What it does

- **Browse** — tables grouped by schema in the sidebar, with row estimates.
- **View** — 200 rows per page with Previous/Next controls; server-side sort by
  clicking a column header, with primary-key ordering to break ties.
- **Filter** — quick client-side filter over the loaded page, a server-side SQL
  WHERE expression, and parameterized per-column filters.
- **Edit** — click a non-key cell to select it, double-click (or Enter) to
  edit. Empty a cell to set `NULL`.
- **Review** — dirty cells/rows are highlighted; Save/Revert live in the
  toolbar with a live pending-change count.
- **Save** — all edits apply in one transaction; on failure, nothing is written.

Editing needs a primary key: it's what maps an edited cell back to the right row.
Tables without one are read-only (by design — safer than guessing).
Values retain PostgreSQL's text representation, including JSON numbers,
timestamp microseconds, and native array syntax such as `{1,2,3}`. A failed
connection switch keeps the previous connection available. Saving connections
uses atomic file replacement and reports persistence errors.

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

## Cut a release

1. Bump `version` in `package.json` and commit it.
2. `git tag v0.1.0-beta.2 && git push origin main --tags`

`.github/workflows/release.yml` picks the tag up on a GitHub-hosted Apple
Silicon runner: typecheck, tests, then an arm64 `.dmg` attached to a GitHub
Release alongside `SHA256SUMS.txt`. A tag with a `-` suffix publishes as a
prerelease, so `v0.1.0-beta.2` lands as one and `v0.1.0` does not. The tag has
to match `package.json`, or the job fails before it builds anything.

To build locally instead:

```bash
npm run dist        # current platform
npm run dist:mac    # arm64 .dmg
```

Output lands in `release/`.

### Signing, when there's a budget for it

Everything above is unsigned. Dropping the Open Anyway step needs an Apple
Developer Program membership at $99/year, a Developer ID Application
certificate, and notarization. There is no free path: Apple does not notarize
for non-members.

Once you have a membership, remove `"identity": null` from `build.mac`, add
`"notarize": true`, and set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` as repository secrets. The
workflow needs no other change.

That is also the price of entry for Homebrew. Since 1 September 2026
`homebrew-cask` rejects casks that fail Gatekeeper, and `--no-quarantine` is
gone from Homebrew entirely, so an unsigned app cannot be installed cleanly
through `brew` by any route.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

Regression tests exercise row identity, asynchronous action ordering, PostgreSQL
driver parsing, connection replacement, and filesystem failures. They use mocked
database transport and IPC, and do not require a running database or Electron GUI.

## Known limitations (v0.1)

- Pages contain 200 rows; there is no total count or jump-to-page control.
- Offset pagination can shift when other clients insert, delete, or reorder rows.
  Tables without primary keys have no guaranteed ordering.
- Complex types use text editing; there is no structured JSON/array editor.
- No row insert/delete yet, and no free-form SQL editor.
- The quick filter searches only the loaded page; use WHERE or column filters
  to search the table on the server.

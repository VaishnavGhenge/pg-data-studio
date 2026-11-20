# Progress & TODO

Working notes for PG Data Studio. Last updated 2026-07-21.

Target: parity with the JetBrains/DataGrip data editor, one feature at a time.

## Status

v0.1.0 shipped as the initial commit. Since then, four features have merged to
`main`, and the data-sources rework plus two fixes are staged on
`feature/data-sources` (not yet merged).

## Done

### Core (v0.1.0)
- Electron + TypeScript, no bundler (`tsc` compiles `src/ → dist/`, a script
  copies renderer HTML/CSS).
- Three-layer, security-first architecture: all `pg` access in main, a sandboxed
  renderer, a typed IPC bridge. `contextIsolation`, no `nodeIntegration`,
  `sandbox`, strict CSP.
- Browse tables grouped by schema, view first 200 rows, inline cell editing with
  a per-row `UPDATE` preview, transactional all-or-nothing save.
- SQL injection safety: identifiers validated against the live catalog, values
  parameterized.

### Pagination — merged (`2e548cc`)
- Prev/Next paging, 200 rows/page. Detects a next page by fetching `limit + 1`
  rows, so no `COUNT(*)` on large tables.
- Pager hidden for single-page tables; absolute row numbers in the gutter;
  paging preserves sort and guards unsaved edits.

### WHERE filter bar — merged (`7a36442`)
- Free-form SQL boolean expression pushed into the query. Enter applies, Esc/×
  clears. Raw SQL against the user's own DB; a bad predicate surfaces as a
  Postgres error toast.

### Per-column funnel filters — merged (`f5fafdd`)
- Funnel icon per header opens a popover: equals, comparisons,
  contains/starts/ends, is null / is not null.
- Structured and **parameterized** end to end (column validated, operator
  whitelisted, value bound). ANDs with other columns and with the WHERE bar.
  Reflected in the SQL preview. Survives paging and sort.

### Data sources UI — staged on `feature/data-sources` (not merged)
- Replaced the single connection-string box with a JetBrains-style two-pane
  connect screen: sources list (left, + / −) and a structured form (right):
  Name, Host/Port, User/Password, Database, SSL, and a URL field that syncs with
  the fields both ways.
- Connections are now structured `Source` objects with a stable id. Store gains
  `listSources` / `saveSource` (upsert) / `deleteSource`, and migrates the old
  `recent: string[]` format on first read.
- `Test` (throwaway pool, shows server version), `Save`, `Delete`, `Connect`.
- Fixes found by running the app:
  - `[hidden] { display: none !important }` — author `display` rules were
    overriding the `hidden` attribute, leaking the filter popover onto the
    connect screen (and would have kept the connect screen from hiding).
  - Vertical scroll — the `.app`/`.connect` grids needed
    `grid-template-rows: minmax(0, 1fr)` + `min-height: 0` on flex children so
    their `overflow:auto` regions actually scroll.

### Table filter + navigator — merged
- Sidebar table filter (type-to-narrow) + full-name tooltips; tree renders as one
  delegated list (perf fix for the table-listing lag).
- Reworked into a DataGrip-style **database navigator**: lazy tree of
  source > schema > table > column, click a source to connect (one active at a
  time), click a table to open, expand a table for its columns.
- Connection form moved into a **modal**; **right-click** a source for
  Edit / Duplicate / Disconnect / Delete; **draggable sidebar splitter**
  (persisted). Icons switched to inlined Lucide SVGs.
- Grid cells: single click selects/highlights, double click edits; Save/Revert
  live in the toolbar with a live change count; a reusable in-app confirm
  dialog replaced `window.confirm()`.

### React rewrite — on `feature/react-rewrite` (not yet merged)
- Renderer rebuilt in React + TypeScript, replacing the ~1,300-line vanilla
  DOM-string renderer. `main`/`preload`/`db`/`store` are unchanged.
- Toolchain moved from `tsc` + `scripts/copy-assets.js` to **electron-vite**
  (Vite/HMR for the renderer in dev; main/preload still plain TS). CSP moved
  from a static `<meta>` tag to a header set in the main process
  (`session.webRequest.onHeadersReceived`), strict when packaged and relaxed
  only for the dev server's HMR.
- State: four scoped Context+`useReducer` stores (`sourcesStore`,
  `tableStore`, `toastStore`, `confirmStore`) — state and dispatch split into
  separate contexts each so a dispatch-only consumer never re-renders on
  state changes. Cell selection/edit-in-progress state and the navigator's
  lazy-column cache are deliberately local component state, not global.
- Cell editing swapped `contenteditable` toggling for a real `<input>`
  rendered in place of the `<span>` only while editing — same select/edit/
  commit/revert/NULL semantics, verbatim commit math ported to
  `lib/dirty.ts`. `GridRow`/`GridCell` are memoized on primitive per-cell
  props so a keystroke in one cell doesn't re-render the other 199 rows.
- `useConfirmedAction()` centralizes the "dirty? confirm discard" guard that
  was copy-pasted at 7 call sites in the old renderer.
- Verified end-to-end against a real database via Chrome DevTools Protocol
  (driving actual clicks/keystrokes): connect, tree, sort, pagination, WHERE
  bar, column filters, quick filter, cell select/edit/commit/revert/Set NULL,
  the full-value editor, the discard-confirmation guard, and source
  management. Save-to-database itself wasn't exercised against real data.

### Grid polish (on top of the React rewrite, not yet smoke-tested against a real DB)
- Dark theme reworked to a deeper, more saturated navy palette with more
  contrast between panels/canvas; scrollbars themed to match (were the
  browser's stark white default).
- Selected-cell fill switched from `background` to an inset box-shadow tint,
  so it blends with the row's own shading (alt-row stripe, hover, dirty)
  instead of overriding it with a flat rectangle that seamed against the row.
- Column resize: drag a header's right edge (`.col-resizer`). Widths live as
  `--col-w-N` CSS custom properties on the `<table>` (inherited by every
  cell for free) so dragging never re-renders the 200 memoized body rows —
  only the small header row and the table's own style attribute change,
  rAF-throttled.
- Column default width now fits the header's name alone, not the data —
  `tbody td { width: 0 }` stops long values from stretching columns (the
  old 240px cap is gone, it's unnecessary now). The data type only appears
  next to the name once a column is dragged wide enough to fit both in
  full (measured off-screen at mount, compared live against the drag
  width), and disappears again if dragged back down.
- `title` tooltips on hover wherever text is truncated: grid cells, header
  name/type, SQL preview bar (all via `lib/truncatedTitle.ts`, computed
  lazily on hover so it's cheap in a 200-row grid); navigator schema rows
  and columns got the same static full-text tooltip TableRow/SourceRow
  already had.


### AWS SSM bastion tunnels
- Sources can connect through an AWS Session Manager port-forward
  (`src/main/tunnel.ts`): the main process spawns `aws ssm start-session` on a
  free local port, waits for it to accept connections, and points the pool at
  it. Connect, test and disconnect open and close the tunnel with the pool.
- The CLI runs in its own process group and is closed by signalling the group:
  killing only `aws` left `session-manager-plugin` orphaned and still
  forwarding.
- CLI failures (plugin missing, `aws` missing, AccessDenied, unknown profile,
  expired credentials) are turned into readable connect errors.

## TODO

Next up (rough priority):

- [ ] Merge `feature/data-sources` into `main` once smoke-tested against a real
      database.
- [ ] Row insert / delete — `+` / `−` on the grid, transactional
      (`INSERT`/`DELETE ... WHERE pk`). Biggest capability gap.
- [ ] Multi-column `ORDER BY` (currently single-column via header click).
- [ ] Page-size selector on the pager (200 / 500 / 1000), like DataGrip's
      bottom-of-grid control.
- [ ] Source niceties: grouping, per-source color, connection type icons.
- [ ] CSV export / import.
- [ ] Tabs for multiple open tables.
- [ ] Column type icons in headers (we show the type name as text today).

## Known limitations

- SELECT is one page (200 rows) at a time; no jump-to-page or total count.
- The quick `filter` box is client-side over the loaded page only; use the
  WHERE bar or column filters for server-side narrowing.
- Complex types (jsonb, arrays) round-trip as text — fine for scalars, rough for
  nested values.
- SSL is a single checkbox (`sslmode=require`, `rejectUnauthorized: false`); no
  cert options. Tunnels are AWS SSM port-forwards only; there is no plain SSH
  tunnel. If the SSM session drops mid-use, queries fail with a connection
  error until you reconnect.
- Passwords are stored in plaintext in the app's user-data dir (documented trust
  model — same as a local `.env`).

## Workflow

- One feature per `feature/<name>` branch; merge to `main` with `--no-ff`, then
  delete the branch.
- After changes: `npm run typecheck` and `npm run build` (both via
  electron-vite). Dev loop: `npm run dev` (electron-vite dev — HMR for the
  renderer, restarts main/preload on change). `npm start` runs
  `electron-vite preview` against a production build, for smoke-testing
  without packaging.

## Commit history

```
ecee5ed Fix vertical scrolling in grid, sidebar, sources, and form   (feature/data-sources)
ecd04af Fix hidden elements showing due to author display rules       (feature/data-sources)
b41f62d Replace connection-string box with a data sources UI          (feature/data-sources)
f5fafdd Merge branch 'feature/column-filters'
7a36442 Merge branch 'feature/where-filter'
2e548cc Merge branch 'feature/pagination'
005cf63 Initial commit: PG Data Studio v0.1.0
```

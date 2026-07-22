// Renderer: pure UI. Every bit of data comes from `window.api` (see preload).
// There is no database code here and no Node access — this process is sandboxed.
//
// This file has no imports/exports on purpose: it stays a global script so the
// compiled output is plain browser JS (no require/exports). Types come from the
// ambient declarations in src/shared/types.d.ts.

(function () {
  const $ = (id: string): HTMLElement => document.getElementById(id)!;
  const asInput = (id: string): HTMLInputElement => $(id) as HTMLInputElement;
  const asSelect = (id: string): HTMLSelectElement => $(id) as HTMLSelectElement;

  interface DirtyEntry {
    rowKey: string;
    pkVals: Record<string, Cell>;
    col: string;
    old: Cell;
    val: Cell;
  }

  interface State {
    tables: TableInfo[];
    tableFilter: string;
    current: { schema: string; name: string } | null;
    columns: Column[];
    pk: string[];
    rows: Record<string, Cell>[];
    sortCol: string | null;
    sortDir: "asc" | "desc";
    filter: string;
    where: string;
    colFilters: Record<string, { op: FilterOp; value: string }>;
    dirty: Record<string, DirtyEntry>;
    offset: number;
    hasMore: boolean;
  }

  const PAGE_SIZE = 200;

  const state: State = {
    tables: [],
    tableFilter: "",
    current: null,
    columns: [],
    pk: [],
    rows: [],
    sortCol: null,
    sortDir: "asc",
    filter: "",
    where: "",
    colFilters: {},
    dirty: {},
    offset: 0,
    hasMore: false,
  };

  // Operators offered in the per-column filter popover, in display order.
  const FILTER_OPS: { op: FilterOp; label: string; noValue?: boolean }[] = [
    { op: "=", label: "equals" },
    { op: "!=", label: "not equals" },
    { op: ">", label: "greater than" },
    { op: ">=", label: "greater or equal" },
    { op: "<", label: "less than" },
    { op: "<=", label: "less or equal" },
    { op: "contains", label: "contains" },
    { op: "starts", label: "starts with" },
    { op: "ends", label: "ends with" },
    { op: "isnull", label: "is null", noValue: true },
    { op: "notnull", label: "is not null", noValue: true },
  ];
  const NO_VALUE_OPS = new Set<FilterOp>(["isnull", "notnull"]);

  // ---------- icons (Lucide, inlined as SVG paths — CSP blocks external loads) ----------
  function svg(path: string, size = 14): string {
    return (
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      path + "</svg>"
    );
  }
  const IC = {
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    schema: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/>',
    column: '<path d="M8 3v18"/><path d="M16 3v18"/><path d="M3 12h18"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  };
  // Used by the grid column headers (see renderGrid).
  const funnelIcon =
    '<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 3h12l-4.6 5.6V13L6.6 14.5V8.6L2 3z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>';

  // ---------- data sources + navigator state ----------
  let sources: Source[] = [];
  let formSourceId: string | null = null; // id of the source open in the modal ("" = new)
  let ctxSourceId: string | null = null; // id of the source the context menu targets

  const nav = {
    connectedId: null as string | null,
    busyId: null as string | null,
    errorId: null as string | null,
    expanded: new Set<string>(), // "src:<id>" | "sch:<schema>" | "tbl:<schema>.<table>"
    columnsByTable: {} as Record<string, Column[]>,
    loadingCols: new Set<string>(),
  };
  const kSrc = (id: string) => "src:" + id;
  const kSch = (s: string) => "sch:" + s;
  const kTbl = (s: string, t: string) => "tbl:" + s + "." + t;

  async function boot(): Promise<void> {
    sources = await safe(window.api.listSources(), []);
    renderNav();
    if (!sources.length) openModal(null); // nothing saved yet — prompt to add one
  }

  // ---------- render the navigator tree ----------
  function fmtCount(n: number): string {
    if (n < 0) return "?";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  function groupTables(q: string): Record<string, TableInfo[]> {
    const by: Record<string, TableInfo[]> = {};
    for (const t of state.tables) {
      if (q && !t.name.toLowerCase().includes(q)) continue;
      (by[t.schema] = by[t.schema] || []).push(t);
    }
    return by;
  }

  interface RowOpts {
    kind: "source" | "schema" | "table" | "column";
    depth: number;
    icon: string;
    label: string;
    id?: string;
    schema?: string;
    table?: string;
    open?: boolean;
    active?: boolean;
    leaf?: boolean;
    title?: string;
    meta?: string;
    type?: string;
    pk?: boolean;
    trailing?: string;
  }

  function navRow(o: RowOpts): string {
    const pad = 6 + o.depth * 15;
    const chev = o.leaf
      ? '<span class="chev leaf"></span>'
      : '<span class="chev">' + svg(IC.chevron, 13) + "</span>";
    const data =
      (o.id ? ' data-id="' + esc(o.id) + '"' : "") +
      (o.schema ? ' data-schema="' + esc(o.schema) + '"' : "") +
      (o.table ? ' data-table="' + esc(o.table) + '"' : "");
    const typ = o.type ? '<span class="ntype">' + esc(o.type) + "</span>" : "";
    const pk = o.pk ? '<span class="pkmini" title="primary key">' + svg(IC.key, 11) + "</span>" : "";
    const trailing = o.trailing ?? (o.meta ? '<span class="nmeta">' + esc(o.meta) + "</span>" : "");
    return (
      '<div class="nrow ' + o.kind + (o.open ? " open" : "") + (o.active ? " active" : "") +
      '" data-kind="' + o.kind + '"' + data +
      ' style="padding-left:' + pad + 'px"' + (o.title ? ' title="' + esc(o.title) + '"' : "") + ">" +
      chev +
      '<span class="nic">' + svg(o.icon, o.kind === "source" ? 15 : 14) + "</span>" +
      '<span class="nlabel">' + esc(o.label) + "</span>" +
      typ + pk + trailing +
      "</div>"
    );
  }

  function renderNav(): void {
    const tree = $("tree");
    if (!sources.length) {
      tree.innerHTML = '<div class="tree-empty">No data sources yet. Click + to add one.</div>';
      return;
    }
    const q = state.tableFilter.toLowerCase();
    let html = "";
    for (const src of sources) {
      const connected = nav.connectedId === src.id;
      const open = connected && nav.expanded.has(kSrc(src.id));
      const dot =
        nav.busyId === src.id ? "connecting" :
        nav.errorId === src.id ? "error" :
        connected ? "connected" : "off";
      html += navRow({
        kind: "source", depth: 0, id: src.id, icon: IC.database, label: src.name, open,
        title: src.host + ":" + src.port + "/" + src.database,
        trailing: '<span class="ndot ' + dot + '"></span>',
      });
      if (open) html += renderSchemas(q);
    }
    tree.innerHTML = html;
  }

  function renderSchemas(q: string): string {
    const by = groupTables(q);
    const schemas = Object.keys(by);
    if (!schemas.length) {
      return '<div class="nempty" style="padding-left:36px">' + (q ? "no matches" : "no tables") + "</div>";
    }
    let html = "";
    for (const schema of schemas) {
      const open = q ? true : nav.expanded.has(kSch(schema)); // a filter force-opens schemas
      html += navRow({ kind: "schema", depth: 1, schema, icon: IC.schema, label: schema, open });
      if (open) html += renderTables(schema, by[schema]);
    }
    return html;
  }

  function renderTables(schema: string, tables: TableInfo[]): string {
    let html = "";
    for (const t of tables) {
      const key = kTbl(schema, t.name);
      const open = nav.expanded.has(key);
      const active =
        !!state.current && state.current.schema === schema && state.current.name === t.name;
      html += navRow({
        kind: "table", depth: 2, schema, table: t.name, icon: IC.table, label: t.name,
        open, active, title: schema + "." + t.name, meta: fmtCount(t.estRows),
      });
      if (open) html += renderColumns(schema, t.name);
    }
    return html;
  }

  function renderColumns(schema: string, table: string): string {
    const key = kTbl(schema, table);
    const cols = nav.columnsByTable[key];
    if (!cols) {
      return '<div class="nloading" style="padding-left:54px">loading…</div>';
    }
    return cols
      .map((c) =>
        navRow({
          kind: "column", depth: 3, icon: IC.column, label: c.name, leaf: true,
          type: c.dataType, pk: c.isPk,
        })
      )
      .join("");
  }

  // ---------- navigator interactions ----------
  async function onNavClick(e: MouseEvent): Promise<void> {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>(".nrow");
    if (!row) return;
    const kind = row.dataset.kind;
    if (kind === "source") {
      await onSourceClick(row.dataset.id!);
    } else if (kind === "schema") {
      toggleKey(kSch(row.dataset.schema!));
    } else if (kind === "table") {
      const onChevron = !!target.closest(".chev");
      if (onChevron) await toggleTable(row.dataset.schema!, row.dataset.table!);
      else await openTable(row.dataset.schema!, row.dataset.table!);
    }
  }

  function toggleKey(key: string): void {
    if (nav.expanded.has(key)) nav.expanded.delete(key);
    else nav.expanded.add(key);
    renderNav();
  }

  async function toggleTable(schema: string, table: string): Promise<void> {
    const key = kTbl(schema, table);
    if (nav.expanded.has(key)) {
      nav.expanded.delete(key);
      renderNav();
      return;
    }
    nav.expanded.add(key);
    if (!nav.columnsByTable[key] && !nav.loadingCols.has(key)) {
      nav.loadingCols.add(key);
      renderNav();
      const res = await window.api.tableColumns(schema, table);
      nav.loadingCols.delete(key);
      if (res.ok) nav.columnsByTable[key] = res.data.columns;
      else toast(res.error, true);
    }
    renderNav();
  }

  async function onSourceClick(id: string): Promise<void> {
    if (nav.connectedId === id) {
      toggleKey(kSrc(id)); // already connected — just expand/collapse
      return;
    }
    const src = sources.find((s) => s.id === id);
    if (src) await connectSource(src);
  }

  // Connect to a source, switching away from any currently-active one.
  async function connectSource(src: Source): Promise<void> {
    if (Object.keys(state.dirty).length && !confirmDiscard()) return;
    nav.busyId = src.id;
    nav.errorId = null;
    renderNav();
    const res = await window.api.connect(src);
    nav.busyId = null;
    if (!res.ok) {
      nav.errorId = src.id;
      renderNav();
      toast(res.error, true);
      return;
    }
    nav.connectedId = src.id;
    nav.errorId = null;
    nav.expanded = new Set([kSrc(src.id)]);
    nav.columnsByTable = {};
    clearWorkspace();
    $("titlebarConn").textContent = res.data.database + " · " + res.data.host;
    const tr = await window.api.listTables();
    state.tables = tr.ok ? tr.data : [];
    const schemas = Object.keys(groupTables(""));
    if (schemas.length === 1) nav.expanded.add(kSch(schemas[0])); // auto-open a lone schema
    renderNav();
  }

  async function doDisconnect(): Promise<void> {
    if (Object.keys(state.dirty).length && !confirmDiscard()) return;
    await window.api.disconnect();
    nav.connectedId = null;
    nav.errorId = null;
    nav.expanded.clear();
    nav.columnsByTable = {};
    state.tables = [];
    clearWorkspace();
    $("titlebarConn").textContent = "";
    renderNav();
  }

  // Reset the grid/query state back to "nothing open" (stays connected).
  function clearWorkspace(): void {
    Object.assign(state, {
      current: null, columns: [], pk: [], rows: [], dirty: {},
      sortCol: null, sortDir: "asc", filter: "", where: "", colFilters: {},
      offset: 0, hasMore: false,
    });
    asInput("filter").value = "";
    asInput("where").value = "";
    $("whereClear").hidden = true;
    closeFilterPop();
    $("thead").innerHTML = "";
    $("tbody").innerHTML = "";
    $("empty").hidden = false;
    $("sql").textContent = "";
    $("ms").textContent = "0";
    $("pager").hidden = true;
    renderPending();
  }

  async function refreshNav(): Promise<void> {
    sources = await safe(window.api.listSources(), sources);
    if (nav.connectedId) {
      const tr = await window.api.listTables();
      if (tr.ok) state.tables = tr.data;
      nav.columnsByTable = {};
    }
    renderNav();
  }

  // ---------- open a table into the grid ----------
  async function openTable(schema: string, table: string): Promise<void> {
    if (Object.keys(state.dirty).length && !confirmDiscard()) return;
    state.current = { schema, name: table };
    state.sortCol = null;
    state.sortDir = "asc";
    state.filter = "";
    state.where = "";
    state.colFilters = {};
    state.dirty = {};
    state.offset = 0;
    asInput("filter").value = "";
    asInput("where").value = "";
    $("whereClear").hidden = true;
    closeFilterPop();
    renderNav(); // reflect the active table
    await query();
  }

  // ---------- source add/edit modal ----------
  function openModal(src: Source | null): void {
    formSourceId = src ? src.id : null;
    $("modalTitle").textContent = src ? "Edit data source" : "New data source";
    fillForm(src);
    $("sourceModal").hidden = false;
    asInput("srcName").focus();
  }

  function closeModal(): void {
    $("sourceModal").hidden = true;
  }

  function fillForm(s: Source | null): void {
    asInput("srcName").value = s?.name ?? "";
    asInput("srcHost").value = s?.host ?? "localhost";
    asInput("srcPort").value = String(s?.port ?? 5432);
    asInput("srcUser").value = s?.user ?? "postgres";
    asInput("srcPassword").value = s?.password ?? "";
    asInput("srcDatabase").value = s?.database ?? "";
    asInput("srcSsl").checked = s?.ssl ?? false;
    syncUrlFromForm();
    showFormError("");
    $("testResult").textContent = "";
  }

  function readForm(): Source {
    return {
      id: formSourceId ?? "",
      name: asInput("srcName").value.trim(),
      host: asInput("srcHost").value.trim(),
      port: Number(asInput("srcPort").value) || 5432,
      database: asInput("srcDatabase").value.trim(),
      user: asInput("srcUser").value.trim(),
      password: asInput("srcPassword").value,
      ssl: asInput("srcSsl").checked,
    };
  }

  function defaultName(s: Source): string {
    return `${s.database || "postgres"} @ ${s.host || "localhost"}`;
  }

  function validate(s: Source): string | null {
    if (!s.host) return "Host is required.";
    if (!s.database) return "Database is required.";
    if (!s.user) return "User is required.";
    return null;
  }

  function buildUrl(s: Source): string {
    const cred = s.user
      ? encodeURIComponent(s.user) +
        (s.password ? ":" + encodeURIComponent(s.password) : "") + "@"
      : "";
    const port = s.port ? ":" + s.port : "";
    const q = s.ssl ? "?sslmode=require" : "";
    return `postgres://${cred}${s.host}${port}/${encodeURIComponent(s.database)}${q}`;
  }

  function syncUrlFromForm(): void {
    asInput("srcUrl").value = buildUrl(readForm());
  }

  // Parse the URL field back into the structured fields. Programmatic value
  // assignment doesn't fire "input", so this can't loop with syncUrlFromForm.
  function parseUrlToForm(): void {
    const raw = asInput("srcUrl").value.trim();
    if (!raw) return;
    try {
      const u = new URL(raw);
      if (!/^postgres(ql)?:$/.test(u.protocol)) return;
      if (u.hostname) asInput("srcHost").value = decodeURIComponent(u.hostname);
      asInput("srcPort").value = u.port || "5432";
      const db = decodeURIComponent(u.pathname.replace(/^\//, ""));
      if (db) asInput("srcDatabase").value = db;
      if (u.username) asInput("srcUser").value = decodeURIComponent(u.username);
      if (u.password) asInput("srcPassword").value = decodeURIComponent(u.password);
      const sslmode = u.searchParams.get("sslmode");
      if (sslmode) asInput("srcSsl").checked = sslmode !== "disable";
      syncUrlFromForm(); // normalize
    } catch {
      /* invalid URL — leave the fields untouched */
    }
  }

  function showFormError(msg: string): void {
    const err = $("connectError");
    err.textContent = msg;
    err.hidden = !msg;
  }

  function setBusy(btn: HTMLButtonElement, label: string, busy: boolean): void {
    btn.disabled = busy;
    btn.textContent = label;
  }

  // Persist the form's source (upsert), refresh the list, return the saved row.
  async function persist(s: Source): Promise<Source | null> {
    const res = await window.api.saveSource(s);
    if (!res.ok) {
      showFormError(res.error);
      return null;
    }
    formSourceId = res.data.id;
    sources = await safe(window.api.listSources(), sources);
    renderNav();
    return res.data;
  }

  async function doConnect(): Promise<void> {
    const s = readForm();
    const err = validate(s);
    if (err) return showFormError(err);
    if (!s.name) s.name = defaultName(s);
    showFormError("");
    const btn = $("connectBtn") as HTMLButtonElement;
    setBusy(btn, "Connecting…", true);
    const saved = await persist(s);
    setBusy(btn, "Connect", false);
    if (!saved) return;
    closeModal();
    await connectSource(saved);
  }

  async function doSave(): Promise<void> {
    const s = readForm();
    const err = validate(s);
    if (err) return showFormError(err);
    if (!s.name) s.name = defaultName(s);
    const saved = await persist(s);
    if (saved) {
      closeModal();
      toast("✓ Saved");
    }
  }

  async function doTest(): Promise<void> {
    const s = readForm();
    const err = validate(s);
    if (err) return showFormError(err);
    showFormError("");
    const btn = $("testSource") as HTMLButtonElement;
    const out = $("testResult");
    out.className = "test-result";
    out.textContent = "Testing…";
    setBusy(btn, "Testing…", true);
    const res = await window.api.testConnection(s);
    setBusy(btn, "Test", false);
    if (!res.ok) {
      out.classList.add("err");
      out.textContent = "✕ " + res.error;
      return;
    }
    out.classList.add("ok");
    out.textContent = "✓ " + (res.data.serverVersion ?? "connected");
  }

  // ---------- source management (context menu) ----------
  async function deleteSourceById(id: string): Promise<void> {
    const src = sources.find((s) => s.id === id);
    if (!src) return;
    if (!window.confirm(`Delete data source "${src.name}"?`)) return;
    if (nav.connectedId === id) await doDisconnect();
    await window.api.deleteSource(id);
    sources = await safe(window.api.listSources(), []);
    renderNav();
  }

  async function duplicateSource(id: string): Promise<void> {
    const src = sources.find((s) => s.id === id);
    if (!src) return;
    await persist({ ...src, id: "", name: src.name + " (copy)" });
    toast("✓ Duplicated");
  }

  function openCtxMenu(id: string, x: number, y: number): void {
    ctxSourceId = id;
    const menu = $("ctxMenu");
    // Refresh and Disconnect only apply to the currently-connected source.
    const offline = nav.connectedId !== id;
    (menu.querySelector('[data-act="refresh"]') as HTMLButtonElement).disabled = offline;
    (menu.querySelector('[data-act="disconnect"]') as HTMLButtonElement).disabled = offline;
    menu.hidden = false;
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth - mw - 8) + "px";
    menu.style.top = Math.min(y, window.innerHeight - mh - 8) + "px";
  }

  function closeCtxMenu(): void {
    ctxSourceId = null;
    $("ctxMenu").hidden = true;
  }

  // ---------- resizable sidebar splitter ----------
  function initSplitter(): void {
    const splitter = $("splitter");
    const root = document.documentElement;
    try {
      const saved = localStorage.getItem("sideW");
      if (saved) root.style.setProperty("--side-w", saved);
    } catch {
      /* localStorage may be unavailable; width just won't persist */
    }
    splitter.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = (e as MouseEvent).clientX;
      const startW = $("side").getBoundingClientRect().width;
      splitter.classList.add("dragging");
      document.body.classList.add("col-resizing");
      const onMove = (ev: MouseEvent) => {
        const w = Math.max(180, Math.min(560, startW + (ev.clientX - startX)));
        root.style.setProperty("--side-w", w + "px");
      };
      const onUp = () => {
        splitter.classList.remove("dragging");
        document.body.classList.remove("col-resizing");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        try {
          localStorage.setItem("sideW", root.style.getPropertyValue("--side-w"));
        } catch {
          /* ignore */
        }
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  async function query(): Promise<void> {
    if (!state.current) return;
    const { schema, name } = state.current;
    const res = await window.api.query(schema, name, {
      limit: PAGE_SIZE,
      offset: state.offset,
      orderBy: state.sortCol,
      dir: state.sortDir,
      where: state.where || null,
      filters: Object.entries(state.colFilters).map(([column, f]) => ({
        column,
        op: f.op,
        value: NO_VALUE_OPS.has(f.op) ? null : f.value,
      })),
    });
    if (!res.ok) {
      toast(res.error, true);
      return;
    }
    state.columns = res.data.columns;
    state.pk = res.data.pk;
    state.rows = res.data.rows;
    state.offset = res.data.offset;
    state.hasMore = res.data.hasMore;
    $("sql").textContent = res.data.previewSql;
    $("ms").textContent = String(res.data.ms);
    renderGrid();
    renderPager();
  }

  // ---------- pagination ----------
  function renderPager(): void {
    const pager = $("pager");
    const loaded = state.rows.length;
    // Show the pager once there's more than one page's worth of data to move through.
    pager.hidden = state.offset === 0 && !state.hasMore;
    const from = loaded ? state.offset + 1 : 0;
    const to = state.offset + loaded;
    $("pageRange").textContent = from + "–" + to;
    ($("prevPage") as HTMLButtonElement).disabled = state.offset === 0;
    ($("nextPage") as HTMLButtonElement).disabled = !state.hasMore;
  }

  async function goToPage(delta: number): Promise<void> {
    const next = Math.max(state.offset + delta * PAGE_SIZE, 0);
    if (next === state.offset) return;
    if (Object.keys(state.dirty).length && !confirmDiscard()) return;
    state.offset = next;
    state.dirty = {};
    await query();
  }

  // ---------- server-side WHERE filter ----------
  async function applyWhere(): Promise<void> {
    const next = asInput("where").value.trim();
    if (next === state.where) return;
    if (Object.keys(state.dirty).length && !confirmDiscard()) return;
    state.where = next;
    state.offset = 0; // a new predicate changes the result set; start at page 1
    state.dirty = {};
    $("whereClear").hidden = next === "";
    $("where").classList.toggle("active", next !== "");
    await query();
  }

  function clearWhere(): void {
    asInput("where").value = "";
    $("where").classList.remove("active");
    applyWhere();
  }

  // ---------- per-column filter popover ----------
  let popCol: string | null = null;

  function initFilterPop(): void {
    asSelect("fpOp").innerHTML = FILTER_OPS.map(
      (o) => '<option value="' + o.op + '">' + o.label + "</option>"
    ).join("");
    asSelect("fpOp").addEventListener("change", syncPopValue);
    $("fpApply").addEventListener("click", applyColFilter);
    $("fpClear").addEventListener("click", clearColFilter);
    asInput("fpVal").addEventListener("keydown", (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === "Enter") applyColFilter();
      else if (key === "Escape") closeFilterPop();
    });
    // Dismiss on outside click, Escape, or grid scroll (position would drift).
    document.addEventListener("mousedown", (e) => {
      if (!popCol) return;
      const t = e.target as HTMLElement;
      if (t.closest("#filterPop") || t.closest(".funnel")) return;
      closeFilterPop();
    });
    document.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape" && popCol) closeFilterPop();
    });
    $("gridScroll").addEventListener("scroll", closeFilterPop);
  }

  function syncPopValue(): void {
    const op = asSelect("fpOp").value as FilterOp;
    asInput("fpVal").style.display = NO_VALUE_OPS.has(op) ? "none" : "";
  }

  function openFilterPop(col: string, anchor: HTMLElement): void {
    popCol = col;
    $("fpCol").textContent = col;
    const cur = state.colFilters[col];
    asSelect("fpOp").value = cur ? cur.op : "=";
    asInput("fpVal").value = cur ? cur.value : "";
    syncPopValue();

    const pop = $("filterPop");
    pop.hidden = false; // unhide before measuring width
    const r = anchor.getBoundingClientRect();
    let left = r.left;
    if (left + pop.offsetWidth > window.innerWidth - 8) {
      left = window.innerWidth - pop.offsetWidth - 8;
    }
    pop.style.left = Math.max(8, left) + "px";
    pop.style.top = r.bottom + 4 + "px";

    if (NO_VALUE_OPS.has(asSelect("fpOp").value as FilterOp)) {
      asSelect("fpOp").focus();
    } else {
      asInput("fpVal").focus();
      asInput("fpVal").select();
    }
  }

  function closeFilterPop(): void {
    popCol = null;
    $("filterPop").hidden = true;
  }

  function applyColFilter(): void {
    if (!popCol) return;
    const col = popCol;
    const op = asSelect("fpOp").value as FilterOp;
    const raw = asInput("fpVal").value;
    const noVal = NO_VALUE_OPS.has(op);
    const willClear = !noVal && raw.trim() === "";
    const cur = state.colFilters[col];

    // No-op guard: nothing to do if the popover matches current state.
    if (willClear && !cur) return closeFilterPop();
    if (!willClear && cur && cur.op === op && (noVal || cur.value === raw)) {
      return closeFilterPop();
    }
    if (Object.keys(state.dirty).length && !confirmDiscard()) return;

    if (willClear) delete state.colFilters[col];
    else state.colFilters[col] = { op, value: noVal ? "" : raw };
    state.offset = 0; // predicate changed — back to the first page
    state.dirty = {};
    closeFilterPop();
    query();
  }

  function clearColFilter(): void {
    if (popCol && state.colFilters[popCol]) {
      if (Object.keys(state.dirty).length && !confirmDiscard()) return;
      delete state.colFilters[popCol];
      state.offset = 0;
      state.dirty = {};
      closeFilterPop();
      query();
    } else {
      closeFilterPop();
    }
  }

  function rowKeyOf(row: Record<string, Cell>): string {
    // Stable identity for a row across sorts/edits, from its primary key.
    return state.pk.map((c) => String(row[c])).join("");
  }

  function visibleRows(): Record<string, Cell>[] {
    let rows = state.rows;
    if (state.filter) {
      const q = state.filter.toLowerCase();
      rows = rows.filter((r) =>
        state.columns.some((c) => {
          const v = r[c.name];
          return String(v === null ? "null" : v).toLowerCase().includes(q);
        })
      );
    }
    return rows;
  }

  function renderGrid(): void {
    const cols = state.columns;
    $("empty").hidden = true;

    // header
    let h = '<tr><th class="gutter-h"></th>';
    cols.forEach((c) => {
      const sorted = state.sortCol === c.name;
      const arrow = sorted ? (state.sortDir === "asc" ? "▲" : "▼") : "";
      const filtered = !!state.colFilters[c.name];
      h +=
        '<th class="' + (sorted ? "sorted " : "") + (filtered ? "filtered" : "") + '" data-col="' + esc(c.name) + '">' +
        '<div class="th"><span>' + esc(c.name) + "</span>" +
        (c.isPk ? '<span class="pkbadge">PK</span>' : "") +
        '<span class="typ">' + esc(c.dataType) + "</span>" +
        '<span class="funnel' + (filtered ? " on" : "") + '" data-fcol="' + esc(c.name) + '" title="Filter column">' + funnelIcon + "</span>" +
        '<span class="sort">' + arrow + "</span></div></th>";
    });
    h += "</tr>";
    $("thead").innerHTML = h;
    $("thead").querySelectorAll<HTMLElement>(".funnel").forEach((f) => {
      f.addEventListener("click", (e) => {
        e.stopPropagation(); // don't trigger the header's sort
        openFilterPop(f.dataset.fcol!, f);
      });
    });
    $("thead").querySelectorAll<HTMLElement>("th[data-col]").forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.col!;
        if (Object.keys(state.dirty).length && !confirmDiscard()) return;
        if (state.sortCol === col) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortCol = col;
          state.sortDir = "asc";
        }
        state.offset = 0; // re-sort reorders everything; start from the first page
        state.dirty = {};
        query(); // server-side sort keeps LIMIT correct
      });
    });

    // body
    const rows = visibleRows();
    const editable = state.pk.length > 0;
    let b = "";
    rows.forEach((row, idx) => {
      const rk = rowKeyOf(row);
      const rowDirty = cols.some((c) => state.dirty[rk + "" + c.name]);
      b += '<tr class="' + (rowDirty ? "dirty-row" : "") + '">';
      b += '<td class="gutter">' + (state.offset + idx + 1) + "</td>";
      cols.forEach((c) => {
        const key = rk + "" + c.name;
        const d = state.dirty[key];
        const raw = d ? d.val : row[c.name];
        const display = raw === null ? '<span class="nullv">NULL</span>' : esc(String(raw));
        const isNum = /int|numeric|real|double|decimal|money|serial/i.test(c.dataType);
        const cls = [
          isNum ? "num" : "",
          c.isPk ? "pkcell" : editable ? "editable" : "",
          d ? "dirty" : "",
        ].join(" ").trim();
        const ce = !c.isPk && editable ? ' contenteditable="true"' : "";
        b +=
          '<td class="' + cls + '" data-rk="' + esc(rk) + '" data-col="' + esc(c.name) + '">' +
          '<span class="cell"' + ce + ' spellcheck="false">' + display + "</span></td>";
      });
      b += "</tr>";
    });
    $("tbody").innerHTML = b;
    $("rowcount").textContent = String(rows.length);
    wireCells();
    renderPending();
  }

  function wireCells(): void {
    $("tbody").querySelectorAll<HTMLElement>("td.editable .cell").forEach((cell) => {
      const td = cell.parentElement as HTMLElement;
      cell.addEventListener("focus", () => {
        if (cell.querySelector(".nullv")) cell.textContent = "";
        requestAnimationFrame(() => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        });
      });
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          cell.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          revertCell(td, cell);
          cell.blur();
        }
      });
      cell.addEventListener("blur", () => commitCell(td, cell));
    });
  }

  function findRow(rk: string): Record<string, Cell> | undefined {
    return state.rows.find((r) => rowKeyOf(r) === rk);
  }

  function pkValsOf(row: Record<string, Cell>): Record<string, Cell> {
    const o: Record<string, Cell> = {};
    state.pk.forEach((c) => (o[c] = row[c]));
    return o;
  }

  function revertCell(td: HTMLElement, cell: HTMLElement): void {
    const rk = td.dataset.rk!;
    const col = td.dataset.col!;
    const row = findRow(rk);
    const orig = row ? row[col] : null;
    cell.innerHTML = orig === null ? '<span class="nullv">NULL</span>' : esc(String(orig));
    delete state.dirty[rk + "" + col];
    td.classList.remove("dirty");
    syncRowDirty(td);
    renderPending();
  }

  function commitCell(td: HTMLElement, cell: HTMLElement): void {
    const rk = td.dataset.rk!;
    const col = td.dataset.col!;
    const row = findRow(rk);
    if (!row) return;
    const orig = row[col];
    const origStr = orig === null ? "" : String(orig);
    const key = rk + "" + col;

    const text = cell.textContent ?? "";
    // An emptied cell means NULL; a value equal to the original clears the edit.
    const newVal: Cell = text.trim() === "" ? null : text;

    if (newVal === orig || (newVal !== null && String(newVal) === origStr)) {
      delete state.dirty[key];
      td.classList.remove("dirty");
      cell.innerHTML = orig === null ? '<span class="nullv">NULL</span>' : esc(origStr);
    } else {
      state.dirty[key] = {
        rowKey: rk,
        pkVals: pkValsOf(row),
        col,
        old: orig,
        val: newVal,
      };
      td.classList.add("dirty");
      cell.innerHTML = newVal === null ? '<span class="nullv">NULL</span>' : esc(String(newVal));
    }
    syncRowDirty(td);
    renderPending();
  }

  function syncRowDirty(td: HTMLElement): void {
    const tr = td.parentElement as HTMLElement;
    tr.classList.toggle("dirty-row", !!tr.querySelector("td.dirty"));
  }

  // ---------- pending changes ----------
  function renderPending(): void {
    const keys = Object.keys(state.dirty);
    const bar = $("pending");
    bar.classList.toggle("open", keys.length > 0);
    $("pcount").textContent = keys.length + (keys.length === 1 ? " change" : " changes");
    $("pendingLbl").innerHTML =
      keys.length && state.current
        ? "pending on <b>" + esc(state.current.schema + "." + state.current.name) + "</b> — not yet written"
        : "";

    // Group edits by row, then preview one UPDATE per row.
    const groups: Record<string, { pkVals: Record<string, Cell>; sets: DirtyEntry[] }> = {};
    keys.forEach((k) => {
      const d = state.dirty[k];
      (groups[d.rowKey] = groups[d.rowKey] || { pkVals: d.pkVals, sets: [] }).sets.push(d);
    });

    let html = "";
    Object.values(groups).forEach((g) => {
      const sets = g.sets.map((d) => qi(d.col) + " = " + lit(d.val)).join(", ");
      const where = state.pk.map((c) => qi(c) + " = " + lit(g.pkVals[c])).join(" AND ");
      const ref = qi(state.current!.schema) + "." + qi(state.current!.name);
      html += '<div class="stmt">UPDATE ' + esc(ref) + " SET " + esc(sets) + "\n  WHERE " + esc(where) + ";</div>";
    });
    $("stmts").innerHTML = html;
  }

  async function save(): Promise<void> {
    const keys = Object.keys(state.dirty);
    if (!keys.length || !state.current) return;
    const btn = $("save") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Saving…";

    const groups: Record<string, RowChange> = {};
    keys.forEach((k) => {
      const d = state.dirty[k];
      const g = (groups[d.rowKey] = groups[d.rowKey] || { pk: d.pkVals, set: {} });
      g.set[d.col] = d.val;
    });
    const changes = Object.values(groups);

    const res = await window.api.applyChanges(state.current.schema, state.current.name, changes);
    btn.disabled = false;
    btn.textContent = "Save changes";

    if (!res.ok) {
      toast(res.error, true);
      return;
    }
    state.dirty = {};
    await query(); // reload canonical values
    const n = res.data.updated;
    toast("✓ " + n + (n === 1 ? " row" : " rows") + " updated");
  }

  function revertAll(): void {
    state.dirty = {};
    renderGrid();
  }

  // ---------- helpers ----------
  function qi(name: string): string {
    return '"' + String(name).replace(/"/g, '""') + '"';
  }
  function lit(v: Cell): string {
    if (v === null || v === undefined) return "NULL";
    return "'" + String(v).replace(/'/g, "''") + "'";
  }
  function esc(s: string): string {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function confirmDiscard(): boolean {
    return window.confirm("You have unsaved changes. Discard them?");
  }
  async function safe<T>(promise: Promise<IpcResult<T>>, fallback: T): Promise<T> {
    const res = await promise;
    return res.ok ? res.data : fallback;
  }

  let toastTimer: number | undefined;
  function toast(msg: string, isErr = false): void {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("err", isErr);
    t.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.classList.remove("show"), isErr ? 4000 : 2200);
  }

  // ---------- wire up ----------
  // Modal (add/edit source)
  $("connectBtn").addEventListener("click", doConnect);
  $("saveSource").addEventListener("click", doSave);
  $("testSource").addEventListener("click", doTest);
  $("newSource").addEventListener("click", () => openModal(null));
  $("modalClose").addEventListener("click", closeModal);
  $("sourceModal").addEventListener("mousedown", (e) => {
    if (e.target === $("sourceModal")) closeModal(); // click on backdrop
  });
  // Structured fields keep the URL field in sync; Enter connects.
  ["srcName", "srcHost", "srcPort", "srcUser", "srcPassword", "srcDatabase"].forEach((id) => {
    const el = asInput(id);
    if (id !== "srcName") el.addEventListener("input", syncUrlFromForm);
    el.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") doConnect();
    });
  });
  asInput("srcSsl").addEventListener("change", syncUrlFromForm);
  // The URL field parses back into the structured fields on edit.
  asInput("srcUrl").addEventListener("change", parseUrlToForm);
  asInput("srcUrl").addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") { parseUrlToForm(); doConnect(); }
  });

  // Navigator
  $("tree").addEventListener("click", (e) => onNavClick(e as MouseEvent));
  $("tree").addEventListener("contextmenu", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".nrow.source");
    if (!row) return;
    e.preventDefault();
    openCtxMenu(row.dataset.id!, (e as MouseEvent).clientX, (e as MouseEvent).clientY);
  });
  asInput("tableFilter").addEventListener("input", (e) => {
    state.tableFilter = (e.target as HTMLInputElement).value.trim();
    renderNav();
  });

  // Context menu
  $("ctxMenu").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".ctx-item");
    if (!btn || btn.hasAttribute("disabled")) return;
    const id = ctxSourceId;
    const act = btn.dataset.act;
    closeCtxMenu();
    if (!id) return;
    if (act === "edit") { const s = sources.find((x) => x.id === id); if (s) openModal(s); }
    else if (act === "duplicate") duplicateSource(id);
    else if (act === "refresh") { if (nav.connectedId === id) refreshNav(); }
    else if (act === "disconnect") { if (nav.connectedId === id) doDisconnect(); }
    else if (act === "delete") deleteSourceById(id);
  });
  document.addEventListener("mousedown", (e) => {
    if (ctxSourceId && !(e.target as HTMLElement).closest("#ctxMenu")) closeCtxMenu();
  });
  document.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Escape") return;
    if (ctxSourceId) closeCtxMenu();
    else if (!$("sourceModal").hidden) closeModal();
  });

  // Grid / query
  asInput("filter").addEventListener("input", (e) => {
    state.filter = (e.target as HTMLInputElement).value.trim();
    renderGrid();
  });
  $("save").addEventListener("click", save);
  $("revert").addEventListener("click", revertAll);
  $("prevPage").addEventListener("click", () => goToPage(-1));
  $("nextPage").addEventListener("click", () => goToPage(1));
  asInput("where").addEventListener("keydown", (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key === "Enter") applyWhere();
    else if (ev.key === "Escape") clearWhere();
  });
  $("whereClear").addEventListener("click", clearWhere);
  initFilterPop();
  initSplitter();

  boot();
})();

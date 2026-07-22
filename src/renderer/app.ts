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

  // ---------- connect screen: data sources + form ----------
  const dbIcon =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><ellipse cx="8" cy="4" rx="5" ry="2" stroke="currentColor" stroke-width="1.1"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" stroke="currentColor" stroke-width="1.1"/></svg>';

  let sources: Source[] = [];
  let selectedId: string | null = null;

  async function initConnect(): Promise<void> {
    sources = await safe(window.api.listSources(), []);
    renderSources();
    if (sources[0]) selectSource(sources[0]);
    else newSource();
  }

  function renderSources(): void {
    const list = $("sourcesList");
    list.innerHTML = "";
    if (!sources.length) {
      const empty = document.createElement("div");
      empty.className = "sources-empty";
      empty.textContent = "No sources yet — fill in the form to add one.";
      list.appendChild(empty);
      return;
    }
    sources.forEach((s) => {
      const item = document.createElement("div");
      item.className = "source-item" + (s.id === selectedId ? " active" : "");
      item.innerHTML =
        dbIcon +
        '<span class="s-body"><span class="s-nm">' + esc(s.name) + "</span>" +
        '<span class="s-sub">' + esc(s.host + ":" + s.port + "/" + s.database) + "</span></span>";
      item.addEventListener("click", () => selectSource(s));
      list.appendChild(item);
    });
  }

  function selectSource(s: Source): void {
    selectedId = s.id;
    renderSources();
    fillForm(s);
  }

  function newSource(): void {
    selectedId = null;
    renderSources();
    fillForm(null);
    asInput("srcName").focus();
  }

  // ---- form <-> model ----
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
    $("deleteSource").hidden = !s;
  }

  function readForm(): Source {
    return {
      id: selectedId ?? "",
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

  // ---- actions ----
  async function persist(s: Source): Promise<Source | null> {
    const res = await window.api.saveSource(s);
    if (!res.ok) {
      showFormError(res.error);
      return null;
    }
    selectedId = res.data.id;
    sources = await safe(window.api.listSources(), sources);
    renderSources();
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
    await persist(s); // remember what we're connecting to, even if it fails
    const res = await window.api.connect(s);
    setBusy(btn, "Connect", false);
    if (!res.ok) return showFormError(res.error);
    enterWorkspace(res.data);
  }

  async function doSave(): Promise<void> {
    const s = readForm();
    const err = validate(s);
    if (err) return showFormError(err);
    if (!s.name) s.name = defaultName(s);
    const saved = await persist(s);
    if (saved) {
      fillForm(saved);
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

  async function doDelete(): Promise<void> {
    if (!selectedId) return newSource();
    const cur = sources.find((s) => s.id === selectedId);
    if (cur && !window.confirm(`Delete source "${cur.name}"?`)) return;
    await window.api.deleteSource(selectedId);
    sources = await safe(window.api.listSources(), []);
    if (sources[0]) selectSource(sources[0]);
    else newSource();
  }

  function enterWorkspace(meta: DbMeta): void {
    $("connect").hidden = true;
    $("app").hidden = false;
    $("disconnectBtn").hidden = false;
    $("titlebarConn").textContent = meta.database + " · " + meta.host;
    loadTables();
  }

  async function doDisconnect(): Promise<void> {
    await window.api.disconnect();
    Object.assign(state, {
      tables: [], tableFilter: "", current: null, columns: [], pk: [], rows: [], dirty: {},
      sortCol: null, sortDir: "asc", filter: "", where: "", colFilters: {},
      offset: 0, hasMore: false,
    });
    asInput("tableFilter").value = "";
    closeFilterPop();
    $("app").hidden = true;
    $("disconnectBtn").hidden = true;
    $("titlebarConn").textContent = "";
    $("connect").hidden = false;
    initConnect();
  }

  // ---------- sidebar ----------
  const treeIcon =
    '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 6h12M6.5 6v7.5" stroke="currentColor" stroke-width="1.2"/></svg>';
  const funnelIcon =
    '<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 3h12l-4.6 5.6V13L6.6 14.5V8.6L2 3z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>';

  async function loadTables(): Promise<void> {
    const res = await window.api.listTables();
    if (!res.ok) {
      toast(res.error, true);
      return;
    }
    state.tables = res.data;
    renderTree();
    if (state.tables.length && !state.current) {
      selectTable(state.tables[0]);
    }
  }

  function renderTree(): void {
    const tree = $("tree");
    const q = state.tableFilter.toLowerCase();
    const matches = q
      ? state.tables.filter((t) => t.name.toLowerCase().includes(q))
      : state.tables;

    const bySchema: Record<string, TableInfo[]> = {};
    matches.forEach((t) => (bySchema[t.schema] = bySchema[t.schema] || []).push(t));

    // Build the whole tree as one HTML string (fast) with data-* for delegation.
    // No per-row listeners: a single click handler on #tree dispatches (see wire-up).
    let html = "";
    Object.keys(bySchema).forEach((schema) => {
      html += '<div class="tgroup">' + esc(schema) + "</div>";
      bySchema[schema].forEach((t) => {
        const full = t.schema + "." + t.name;
        html +=
          '<div class="tbl" data-schema="' + esc(t.schema) + '" data-table="' + esc(t.name) +
          '" title="' + esc(full) + '">' +
          treeIcon +
          '<span class="nm">' + esc(t.name) + "</span>" +
          '<span class="rows">' + fmtCount(t.estRows) + "</span></div>";
      });
    });
    if (!html) {
      html = '<div class="tree-empty">' + (q ? "No matching tables" : "No tables") + "</div>";
    }
    tree.innerHTML = html;
    highlightActiveTable();
  }

  // Move the .active marker to the current table without rebuilding the tree.
  function highlightActiveTable(): void {
    const tree = $("tree");
    tree.querySelector(".tbl.active")?.classList.remove("active");
    if (!state.current) return;
    const sel =
      '.tbl[data-schema="' + cssEsc(state.current.schema) +
      '"][data-table="' + cssEsc(state.current.name) + '"]';
    tree.querySelector(sel)?.classList.add("active");
  }

  // Escape a value for use inside a CSS attribute selector.
  function cssEsc(s: string): string {
    return s.replace(/["\\]/g, "\\$&");
  }

  function fmtCount(n: number): string {
    if (n < 0) return "?";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  // ---------- load + render a table ----------
  async function selectTable(t: TableInfo): Promise<void> {
    if (Object.keys(state.dirty).length && !confirmDiscard()) return;
    state.current = { schema: t.schema, name: t.name };
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
    highlightActiveTable();
    await query();
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
  $("connectBtn").addEventListener("click", doConnect);
  $("saveSource").addEventListener("click", doSave);
  $("testSource").addEventListener("click", doTest);
  $("deleteSource").addEventListener("click", doDelete);
  $("newSource").addEventListener("click", newSource);
  $("removeSource").addEventListener("click", doDelete);
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
  $("disconnectBtn").addEventListener("click", doDisconnect);
  $("refreshBtn").addEventListener("click", loadTables);
  // One delegated handler for the whole table list (no per-row listeners).
  $("tree").addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".tbl");
    if (!el) return;
    const t = state.tables.find(
      (x) => x.schema === el.dataset.schema && x.name === el.dataset.table
    );
    if (t) selectTable(t);
  });
  asInput("tableFilter").addEventListener("input", (e) => {
    state.tableFilter = (e.target as HTMLInputElement).value.trim();
    renderTree();
  });
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

  initConnect();
})();

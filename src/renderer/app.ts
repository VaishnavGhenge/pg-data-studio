// Renderer: pure UI. Every bit of data comes from `window.api` (see preload).
// There is no database code here and no Node access — this process is sandboxed.
//
// This file has no imports/exports on purpose: it stays a global script so the
// compiled output is plain browser JS (no require/exports). Types come from the
// ambient declarations in src/shared/types.d.ts.

(function () {
  const $ = (id: string): HTMLElement => document.getElementById(id)!;
  const asInput = (id: string): HTMLInputElement => $(id) as HTMLInputElement;

  interface DirtyEntry {
    rowKey: string;
    pkVals: Record<string, Cell>;
    col: string;
    old: Cell;
    val: Cell;
  }

  interface State {
    tables: TableInfo[];
    current: { schema: string; name: string } | null;
    columns: Column[];
    pk: string[];
    rows: Record<string, Cell>[];
    sortCol: string | null;
    sortDir: "asc" | "desc";
    filter: string;
    dirty: Record<string, DirtyEntry>;
  }

  const state: State = {
    tables: [],
    current: null,
    columns: [],
    pk: [],
    rows: [],
    sortCol: null,
    sortDir: "asc",
    filter: "",
    dirty: {},
  };

  // ---------- connect screen ----------
  async function initConnect(): Promise<void> {
    const recent = await safe(window.api.recentConnections(), [] as string[]);
    renderRecent(recent);
    const input = asInput("connStr");
    if (recent[0]) input.value = recent[0];
    input.focus();
    input.select();
  }

  function renderRecent(list: string[]): void {
    const box = $("recent");
    box.innerHTML = "";
    list.forEach((cs) => {
      const item = document.createElement("div");
      item.className = "recent-item";
      item.innerHTML =
        '<span class="nm">' + redact(cs) + "</span>" +
        '<span class="rx" title="Forget">×</span>';
      item.querySelector<HTMLElement>(".nm")!.addEventListener("click", () => {
        asInput("connStr").value = cs;
        doConnect();
      });
      item.querySelector<HTMLElement>(".rx")!.addEventListener("click", async (e) => {
        e.stopPropagation();
        await window.api.forgetConnection(cs);
        renderRecent(await safe(window.api.recentConnections(), [] as string[]));
      });
      box.appendChild(item);
    });
  }

  // Hide the password when showing a stored connection string.
  function redact(cs: string): string {
    return cs.replace(/:\/\/([^:@/]+):([^@/]+)@/, "://$1:•••@");
  }

  async function doConnect(): Promise<void> {
    const cs = asInput("connStr").value.trim();
    const err = $("connectError");
    const btn = $("connectBtn") as HTMLButtonElement;
    if (!cs) return;
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Connecting…";

    const res = await window.api.connect(cs);
    btn.disabled = false;
    btn.textContent = "Connect";

    if (!res.ok) {
      err.textContent = res.error;
      err.hidden = false;
      return;
    }
    enterWorkspace(res.data);
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
      tables: [], current: null, columns: [], pk: [], rows: [], dirty: {},
      sortCol: null, sortDir: "asc", filter: "",
    });
    $("app").hidden = true;
    $("disconnectBtn").hidden = true;
    $("titlebarConn").textContent = "";
    $("connect").hidden = false;
    initConnect();
  }

  // ---------- sidebar ----------
  const treeIcon =
    '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 6h12M6.5 6v7.5" stroke="currentColor" stroke-width="1.2"/></svg>';

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
    tree.innerHTML = "";
    const bySchema: Record<string, TableInfo[]> = {};
    state.tables.forEach((t) => (bySchema[t.schema] = bySchema[t.schema] || []).push(t));

    Object.keys(bySchema).forEach((schema) => {
      const grp = document.createElement("div");
      grp.className = "tgroup";
      grp.textContent = schema;
      tree.appendChild(grp);
      bySchema[schema].forEach((t) => {
        const active =
          !!state.current && state.current.schema === t.schema && state.current.name === t.name;
        const el = document.createElement("div");
        el.className = "tbl" + (active ? " active" : "");
        el.innerHTML =
          treeIcon +
          '<span class="nm">' + esc(t.name) + "</span>" +
          '<span class="rows">' + fmtCount(t.estRows) + "</span>";
        el.addEventListener("click", () => selectTable(t));
        tree.appendChild(el);
      });
    });
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
    state.dirty = {};
    asInput("filter").value = "";
    renderTree();
    await query();
  }

  async function query(): Promise<void> {
    if (!state.current) return;
    const { schema, name } = state.current;
    const res = await window.api.query(schema, name, {
      limit: 200,
      orderBy: state.sortCol,
      dir: state.sortDir,
    });
    if (!res.ok) {
      toast(res.error, true);
      return;
    }
    state.columns = res.data.columns;
    state.pk = res.data.pk;
    state.rows = res.data.rows;
    $("sql").textContent = res.data.previewSql;
    $("ms").textContent = String(res.data.ms);
    renderGrid();
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
      h +=
        '<th class="' + (sorted ? "sorted" : "") + '" data-col="' + esc(c.name) + '">' +
        '<div class="th"><span>' + esc(c.name) + "</span>" +
        (c.isPk ? '<span class="pkbadge">PK</span>' : "") +
        '<span class="typ">' + esc(c.dataType) + "</span>" +
        '<span class="sort">' + arrow + "</span></div></th>";
    });
    h += "</tr>";
    $("thead").innerHTML = h;
    $("thead").querySelectorAll<HTMLElement>("th[data-col]").forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.col!;
        if (state.sortCol === col) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortCol = col;
          state.sortDir = "asc";
        }
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
      b += '<td class="gutter">' + (idx + 1) + "</td>";
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
  asInput("connStr").addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") doConnect();
  });
  $("disconnectBtn").addEventListener("click", doDisconnect);
  $("refreshBtn").addEventListener("click", loadTables);
  asInput("filter").addEventListener("input", (e) => {
    state.filter = (e.target as HTMLInputElement).value.trim();
    renderGrid();
  });
  $("save").addEventListener("click", save);
  $("revert").addEventListener("click", revertAll);

  initConnect();
})();

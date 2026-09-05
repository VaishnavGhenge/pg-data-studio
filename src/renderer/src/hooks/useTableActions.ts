// Orchestrates every grid/table IPC call + the TableContext dispatches that
// go with it. Each action computes the *new* sort/offset/where/filters value
// explicitly and passes it straight to `query()`, rather than dispatching and
// then trying to read it back — a `dispatch` doesn't apply synchronously the
// way the old renderer's direct mutation of a plain `state` object did, so
// "change X, then query with the new X" has to thread the new value through
// by hand.

import { useTableDispatch, useTableState, useWorkspaceRequests } from "../state/tableStore";
import { useToast } from "../state/toastStore";
import { useConfirmedAction } from "./useConfirmedAction";
import { unwrap } from "./useApi";
import { NO_VALUE_OPS } from "../lib/filterOps";
import { groupDirtyByRow } from "../lib/dirty";
import { useConfirmDiscard } from "../state/confirmStore";
import { tableId } from "../lib/preferences";

type ColFilters = Record<string, { op: FilterOp; value: string }>;

export function useTableActions() {
  const state = useTableState();
  const dispatch = useTableDispatch();
  const { show: toast } = useToast();
  const runGuarded = useConfirmedAction();
  const requests = useWorkspaceRequests();
  const confirmDiscard = useConfirmDiscard();

  // Publish data and its sort/filter settings together, and only if this
  // remains the newest workspace request. Failures preserve the last result.
  async function query(
    schema: string,
    name: string,
    offset: number,
    sortCol: string | null,
    sortDir: "asc" | "desc",
    where: string,
    colFilters: ColFilters,
    pageSize = state.pageSize,
  ): Promise<boolean> {
    const version = requests.invalidate();
    dispatch({
      type: "QUERY_START",
      query: { offset, sortCol, sortDir, where, colFilters, pageSize },
    });
    try {
      const data = await unwrap(
        window.api.query(schema, name, {
          limit: pageSize,
          offset,
          orderBy: sortCol,
          dir: sortDir,
          where: where || null,
          filters: Object.entries(colFilters).map(([column, f]) => ({
            column,
            op: f.op,
            value: NO_VALUE_OPS.has(f.op) ? null : f.value,
          })),
        }),
      );
      if (!requests.isCurrent(version)) return false;
      dispatch({
        type: "QUERY_SUCCESS",
        columns: data.columns,
        pk: data.pk,
        rows: data.rows,
        offset: data.offset,
        hasMore: data.hasMore,
        ms: data.ms,
        previewSql: data.previewSql,
        sortCol,
        sortDir,
        where,
        colFilters,
        pageSize,
      });
      return true;
    } catch (e) {
      if (!requests.isCurrent(version)) return false;
      toast(e instanceof Error ? e.message : String(e), true);
      dispatch({ type: "QUERY_ERROR", error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  async function openTable(schema: string, name: string): Promise<void> {
    if (requests.busy) return;
    if (state.current?.schema === schema && state.current.name === name) return;
    requests.invalidate();
    const existing = state.snapshots[tableId(schema, name)];
    dispatch({ type: "OPEN_TABLE", schema, name });
    if (existing?.previewSql) return;
    await query(schema, name, 0, null, "asc", "", {}, existing?.pageSize ?? 200);
  }

  async function closeTab(schema: string, name: string): Promise<void> {
    if (requests.busy) return;
    const active = state.current?.schema === schema && state.current?.name === name;
    const tab = active ? state : state.snapshots[tableId(schema, name)];
    const version = requests.version;
    if (tab && Object.keys(tab.dirty).length && !(await confirmDiscard())) return;
    if (!requests.isCurrent(version) || requests.busy) return;
    if (active) requests.invalidate();
    dispatch({ type: "CLOSE_TAB", schema, name });
    if (active) {
      const next = state.tabs.filter((tab) => tab.schema !== schema || tab.name !== name).at(-1);
      if (next && !state.snapshots[tableId(next.schema, next.name)]?.previewSql) {
        await query(next.schema, next.name, 0, null, "asc", "", {}, 200);
      }
    }
  }

  async function refresh(pageSize = state.pageSize): Promise<void> {
    if (!state.current) return;
    const { schema, name } = state.current;
    await runGuarded(async () => {
      await query(
        schema,
        name,
        pageSize === state.pageSize ? state.offset : 0,
        state.sortCol,
        state.sortDir,
        state.where,
        state.colFilters,
        pageSize,
      );
    });
  }

  async function retry(): Promise<void> {
    if (!state.current || !state.lastQuery) return;
    const { schema, name } = state.current;
    const q = state.lastQuery;
    await runGuarded(async () => {
      await query(schema, name, q.offset, q.sortCol, q.sortDir, q.where, q.colFilters, q.pageSize);
    });
  }

  async function resetFilters(): Promise<void> {
    if (!state.current) return;
    const { schema, name } = state.current;
    await runGuarded(async () => {
      await query(schema, name, 0, null, "asc", "", {});
    });
  }

  function undo(): void {
    if (!requests.busy && !state.loading) dispatch({ type: "UNDO" });
  }
  function redo(): void {
    if (!requests.busy && !state.loading) dispatch({ type: "REDO" });
  }

  async function goToPage(delta: number): Promise<void> {
    if (!state.current) return;
    const next = Math.max(state.offset + delta * state.pageSize, 0);
    if (next === state.offset) return;
    const { schema, name } = state.current;
    await runGuarded(async () => {
      await query(schema, name, next, state.sortCol, state.sortDir, state.where, state.colFilters);
    });
  }

  async function applyWhere(nextWhere: string): Promise<void> {
    if (!state.current || nextWhere === state.where) return;
    const { schema, name } = state.current;
    await runGuarded(async () => {
      await query(schema, name, 0, state.sortCol, state.sortDir, nextWhere, state.colFilters);
    });
  }

  // Three-state cycle per column: unsorted -> asc -> desc -> unsorted (back
  // to the table's default order), rather than only ever toggling between
  // asc/desc with no way back to unsorted.
  async function setSort(col: string): Promise<void> {
    if (!state.current) return;
    const { schema, name } = state.current;
    let nextCol: string | null;
    let nextDir: "asc" | "desc";
    if (state.sortCol !== col) {
      nextCol = col;
      nextDir = "asc";
    } else if (state.sortDir === "asc") {
      nextCol = col;
      nextDir = "desc";
    } else {
      nextCol = null;
      nextDir = "asc";
    }
    await runGuarded(async () => {
      await query(schema, name, 0, nextCol, nextDir, state.where, state.colFilters);
    });
  }

  // filter === null clears the column's filter. No-op guard matches the old
  // renderer: skip the confirm+refetch entirely if nothing would change.
  // Returns whether the popover should close: true for a no-op or a
  // successful apply, false only if the user declined to discard pending
  // edits (matching the old renderer, which left the popover open in that
  // one case and closed it in every other).
  async function applyColFilter(
    col: string,
    filter: { op: FilterOp; value: string } | null,
  ): Promise<boolean> {
    if (!state.current) return true;
    const cur = state.colFilters[col];
    const noVal = filter ? NO_VALUE_OPS.has(filter.op) : false;
    if (!filter && !cur) return true;
    if (filter && cur && cur.op === filter.op && (noVal || cur.value === filter.value)) return true;

    const { schema, name } = state.current;
    let succeeded = false;
    const ran = await runGuarded(async () => {
      const nextFilters = { ...state.colFilters };
      if (filter) nextFilters[col] = filter;
      else delete nextFilters[col];
      succeeded = await query(
        schema,
        name,
        0,
        state.sortCol,
        state.sortDir,
        state.where,
        nextFilters,
      );
    });
    return ran && succeeded;
  }

  async function save(): Promise<boolean> {
    if (!state.current || !Object.keys(state.dirty).length) return false;
    if (!requests.lock()) return false;
    const { schema, name } = state.current;
    const changes = groupDirtyByRow(state.dirty);
    try {
      const res = await unwrap(window.api.applyChanges(schema, name, changes));
      dispatch({ type: "SAVE_SUCCESS" });
      await query(
        schema,
        name,
        state.offset,
        state.sortCol,
        state.sortDir,
        state.where,
        state.colFilters,
      );
      toast(res.updated + (res.updated === 1 ? " row" : " rows") + " updated");
      return true;
    } catch (e) {
      // Dirty state is intentionally left in place on failure, matching the
      // old renderer — a failed save shouldn't silently discard the edits.
      toast(e instanceof Error ? e.message : String(e), true);
      return false;
    } finally {
      requests.busy = false;
    }
  }

  function revertAll(): void {
    if (requests.busy) return;
    dispatch({ type: "REVERT_ALL" });
  }

  return {
    openTable,
    closeTab,
    refresh,
    retry,
    resetFilters,
    undo,
    redo,
    goToPage,
    applyWhere,
    setSort,
    applyColFilter,
    save,
    revertAll,
  };
}

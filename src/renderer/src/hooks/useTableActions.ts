// Orchestrates every grid/table IPC call + the TableContext dispatches that
// go with it. Each action computes the *new* sort/offset/where/filters value
// explicitly and passes it straight to `query()`, rather than dispatching and
// then trying to read it back — a `dispatch` doesn't apply synchronously the
// way the old renderer's direct mutation of a plain `state` object did, so
// "change X, then query with the new X" has to thread the new value through
// by hand.

import { useTableDispatch, useTableState } from "../state/tableStore";
import { useToast } from "../state/toastStore";
import { useConfirmedAction } from "./useConfirmedAction";
import { unwrap } from "./useApi";
import { NO_VALUE_OPS } from "../lib/filterOps";
import { groupDirtyByRow } from "../lib/dirty";

const PAGE_SIZE = 200;

type ColFilters = Record<string, { op: FilterOp; value: string }>;

export function useTableActions() {
  const state = useTableState();
  const dispatch = useTableDispatch();
  const { show: toast } = useToast();
  const runGuarded = useConfirmedAction();

  async function query(
    schema: string,
    name: string,
    offset: number,
    sortCol: string | null,
    sortDir: "asc" | "desc",
    where: string,
    colFilters: ColFilters
  ): Promise<void> {
    try {
      const data = await unwrap(
        window.api.query(schema, name, {
          limit: PAGE_SIZE,
          offset,
          orderBy: sortCol,
          dir: sortDir,
          where: where || null,
          filters: Object.entries(colFilters).map(([column, f]) => ({
            column,
            op: f.op,
            value: NO_VALUE_OPS.has(f.op) ? null : f.value,
          })),
        })
      );
      dispatch({
        type: "QUERY_SUCCESS",
        columns: data.columns,
        pk: data.pk,
        rows: data.rows,
        offset: data.offset,
        hasMore: data.hasMore,
        ms: data.ms,
        previewSql: data.previewSql,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  }

  async function openTable(schema: string, name: string): Promise<void> {
    await runGuarded(async () => {
      dispatch({ type: "OPEN_TABLE", schema, name });
      await query(schema, name, 0, null, "asc", "", {});
    });
  }

  async function goToPage(delta: number): Promise<void> {
    if (!state.current) return;
    const next = Math.max(state.offset + delta * PAGE_SIZE, 0);
    if (next === state.offset) return;
    const { schema, name } = state.current;
    await runGuarded(async () => {
      dispatch({ type: "SET_OFFSET", offset: next });
      await query(schema, name, next, state.sortCol, state.sortDir, state.where, state.colFilters);
    });
  }

  async function applyWhere(nextWhere: string): Promise<void> {
    if (!state.current || nextWhere === state.where) return;
    const { schema, name } = state.current;
    await runGuarded(async () => {
      dispatch({ type: "SET_WHERE", where: nextWhere });
      await query(schema, name, 0, state.sortCol, state.sortDir, nextWhere, state.colFilters);
    });
  }

  async function setSort(col: string): Promise<void> {
    if (!state.current) return;
    const { schema, name } = state.current;
    const sortDir: "asc" | "desc" =
      state.sortCol === col ? (state.sortDir === "asc" ? "desc" : "asc") : "asc";
    await runGuarded(async () => {
      dispatch({ type: "SET_SORT", col });
      await query(schema, name, 0, col, sortDir, state.where, state.colFilters);
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
    filter: { op: FilterOp; value: string } | null
  ): Promise<boolean> {
    if (!state.current) return true;
    const cur = state.colFilters[col];
    const noVal = filter ? NO_VALUE_OPS.has(filter.op) : false;
    if (!filter && !cur) return true;
    if (filter && cur && cur.op === filter.op && (noVal || cur.value === filter.value)) return true;

    const { schema, name } = state.current;
    return runGuarded(async () => {
      const nextFilters = { ...state.colFilters };
      if (filter) nextFilters[col] = filter;
      else delete nextFilters[col];
      dispatch({ type: "SET_COL_FILTER", col, filter });
      await query(schema, name, 0, state.sortCol, state.sortDir, state.where, nextFilters);
    });
  }

  async function save(): Promise<void> {
    if (!state.current || !Object.keys(state.dirty).length) return;
    const { schema, name } = state.current;
    const changes = groupDirtyByRow(state.dirty);
    try {
      const res = await unwrap(window.api.applyChanges(schema, name, changes));
      dispatch({ type: "SAVE_SUCCESS" });
      await query(schema, name, state.offset, state.sortCol, state.sortDir, state.where, state.colFilters);
      toast("✓ " + res.updated + (res.updated === 1 ? " row" : " rows") + " updated");
    } catch (e) {
      // Dirty state is intentionally left in place on failure, matching the
      // old renderer — a failed save shouldn't silently discard the edits.
      toast(e instanceof Error ? e.message : String(e), true);
    }
  }

  function revertAll(): void {
    dispatch({ type: "REVERT_ALL" });
  }

  return { openTable, goToPage, applyWhere, setSort, applyColFilter, save, revertAll };
}

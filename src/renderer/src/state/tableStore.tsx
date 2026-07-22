// The "open table" / grid slice: the currently open schema.table, its fetched
// page, sort/where/column-filters, and the pending-edits (dirty) map. Read by
// Toolbar, WhereBar, Pager, GridTable. The client-side quick-filter text and
// per-cell selection/edit-in-progress state are NOT here on purpose — they're
// local to TableView/GridTable so typing in one cell or the quick-filter box
// never re-renders anything through this context.

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { type DirtyEntry, dirtyKey, isValueChanged } from "../lib/dirty";

export interface TableState {
  current: { schema: string; name: string } | null;
  columns: Column[];
  pk: string[];
  rows: Record<string, Cell>[];
  sortCol: string | null;
  sortDir: "asc" | "desc";
  where: string;
  colFilters: Record<string, { op: FilterOp; value: string }>;
  dirty: Record<string, DirtyEntry>;
  offset: number;
  hasMore: boolean;
  previewSql: string;
  ms: number;
}

const initialState: TableState = {
  current: null,
  columns: [],
  pk: [],
  rows: [],
  sortCol: null,
  sortDir: "asc",
  where: "",
  colFilters: {},
  dirty: {},
  offset: 0,
  hasMore: false,
  previewSql: "",
  ms: 0,
};

export type TableAction =
  | { type: "OPEN_TABLE"; schema: string; name: string }
  | { type: "CLEAR_WORKSPACE" }
  | {
      type: "QUERY_SUCCESS";
      columns: Column[];
      pk: string[];
      rows: Record<string, Cell>[];
      offset: number;
      hasMore: boolean;
      ms: number;
      previewSql: string;
    }
  | { type: "SET_SORT"; col: string | null; dir: "asc" | "desc" }
  | { type: "SET_OFFSET"; offset: number }
  | { type: "SET_WHERE"; where: string }
  | { type: "SET_COL_FILTER"; col: string; filter: { op: FilterOp; value: string } | null }
  | {
      type: "COMMIT_CELL";
      rowKey: string;
      col: string;
      pkVals: Record<string, Cell>;
      orig: Cell;
      val: Cell;
    }
  | { type: "REVERT_ALL" }
  | { type: "SAVE_SUCCESS" };

function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case "OPEN_TABLE":
      return { ...initialState, current: { schema: action.schema, name: action.name } };
    case "CLEAR_WORKSPACE":
      return { ...initialState };
    case "QUERY_SUCCESS":
      return {
        ...state,
        columns: action.columns,
        pk: action.pk,
        rows: action.rows,
        offset: action.offset,
        hasMore: action.hasMore,
        ms: action.ms,
        previewSql: action.previewSql,
      };
    // col/dir are pre-computed by the caller (useTableActions.setSort), which
    // owns the asc -> desc -> unsorted cycle.
    case "SET_SORT":
      return { ...state, sortCol: action.col, sortDir: action.dir, offset: 0, dirty: {} };
    case "SET_OFFSET":
      return { ...state, offset: action.offset, dirty: {} };
    case "SET_WHERE":
      return { ...state, where: action.where, offset: 0, dirty: {} };
    case "SET_COL_FILTER": {
      const colFilters = { ...state.colFilters };
      if (action.filter) colFilters[action.col] = action.filter;
      else delete colFilters[action.col];
      return { ...state, colFilters, offset: 0, dirty: {} };
    }
    case "COMMIT_CELL": {
      const key = dirtyKey(action.rowKey, action.col);
      const dirty = { ...state.dirty };
      if (isValueChanged(action.orig, action.val)) {
        dirty[key] = {
          rowKey: action.rowKey,
          pkVals: action.pkVals,
          col: action.col,
          old: action.orig,
          val: action.val,
        };
      } else {
        delete dirty[key];
      }
      return { ...state, dirty };
    }
    case "REVERT_ALL":
      return { ...state, dirty: {} };
    case "SAVE_SUCCESS":
      return { ...state, dirty: {} };
    default:
      return state;
  }
}

const StateCtx = createContext<TableState | null>(null);
const DispatchCtx = createContext<Dispatch<TableAction> | null>(null);

export function TableProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tableReducer, initialState);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useTableState(): TableState {
  const ctx = useContext(StateCtx);
  if (!ctx) throw new Error("useTableState must be used within TableProvider");
  return ctx;
}

export function useTableDispatch(): Dispatch<TableAction> {
  const ctx = useContext(DispatchCtx);
  if (!ctx) throw new Error("useTableDispatch must be used within TableProvider");
  return ctx;
}

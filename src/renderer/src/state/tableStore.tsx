// The active tab's results, query state and edit history. Switching tabs saves
// a snapshot without discarding edits; switching connections clears all tabs.
// Cell drafts stay local to InlineCellEditor to keep keystrokes inexpensive.

import {
  createContext,
  useContext,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import { WorkspaceRequests } from "../lib/workspaceRequests";
import { type DirtyEntry, dirtyKey, isValueChanged } from "../lib/dirty";
import { tableId } from "../lib/preferences";

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
  loading: boolean;
  error: string | null;
  pageSize: number;
  lastQuery: {
    offset: number;
    sortCol: string | null;
    sortDir: "asc" | "desc";
    where: string;
    colFilters: TableState["colFilters"];
    pageSize: number;
  } | null;
  past: TableState["dirty"][];
  future: TableState["dirty"][];
  tabs: { schema: string; name: string }[];
  snapshots: Record<string, Omit<TableState, "tabs" | "snapshots">>;
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
  loading: false,
  error: null,
  pageSize: 200,
  lastQuery: null,
  past: [],
  future: [],
  tabs: [],
  snapshots: {},
};

export type TableAction =
  | { type: "OPEN_TABLE"; schema: string; name: string }
  | { type: "CLEAR_WORKSPACE" }
  | { type: "CLOSE_TAB"; schema: string; name: string }
  | { type: "QUERY_START"; query: NonNullable<TableState["lastQuery"]> }
  | { type: "QUERY_ERROR"; error: string }
  | { type: "QUERY_CANCEL" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | {
      type: "QUERY_SUCCESS";
      columns: Column[];
      pk: string[];
      rows: Record<string, Cell>[];
      offset: number;
      hasMore: boolean;
      ms: number;
      previewSql: string;
      sortCol: string | null;
      sortDir: "asc" | "desc";
      where: string;
      colFilters: TableState["colFilters"];
      pageSize: number;
    }
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

export function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case "OPEN_TABLE": {
      const { tabs, snapshots, ...snapshot } = state;
      const next = { ...snapshots };
      if (state.current)
        next[tableId(state.current.schema, state.current.name)] = { ...snapshot, loading: false };
      const id = tableId(action.schema, action.name);
      return {
        ...(next[id] ?? initialState),
        current: { schema: action.schema, name: action.name },
        loading: false,
        snapshots: next,
        tabs: tabs.some((t) => tableId(t.schema, t.name) === id)
          ? tabs
          : [...tabs, { schema: action.schema, name: action.name }],
      };
    }
    case "CLOSE_TAB": {
      const id = tableId(action.schema, action.name);
      const tabs = state.tabs.filter((t) => tableId(t.schema, t.name) !== id);
      const snapshots = { ...state.snapshots };
      delete snapshots[id];
      if (!state.current || tableId(state.current.schema, state.current.name) !== id)
        return { ...state, tabs, snapshots };
      const last = tabs.at(-1);
      return {
        ...(last ? (snapshots[tableId(last.schema, last.name)] ?? initialState) : initialState),
        current: last ?? null,
        loading: false,
        tabs,
        snapshots,
      };
    }
    case "QUERY_START":
      return { ...state, loading: true, error: null, lastQuery: action.query };
    case "QUERY_ERROR":
      return { ...state, loading: false, error: action.error };
    case "QUERY_CANCEL":
      return { ...state, loading: false };
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
        sortCol: action.sortCol,
        sortDir: action.sortDir,
        where: action.where,
        colFilters: action.colFilters,
        dirty: {},
        loading: false,
        error: null,
        pageSize: action.pageSize,
        past: [],
        future: [],
      };
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
      if (JSON.stringify(dirty) === JSON.stringify(state.dirty)) return state;
      return { ...state, dirty, past: [...state.past, state.dirty].slice(-100), future: [] };
    }
    case "REVERT_ALL":
      return { ...state, dirty: {}, past: [...state.past, state.dirty].slice(-100), future: [] };
    case "UNDO": {
      const dirty = state.past.at(-1);
      return dirty
        ? { ...state, dirty, past: state.past.slice(0, -1), future: [state.dirty, ...state.future] }
        : state;
    }
    case "REDO": {
      const dirty = state.future[0];
      return dirty
        ? { ...state, dirty, past: [...state.past, state.dirty], future: state.future.slice(1) }
        : state;
    }
    case "SAVE_SUCCESS":
      return { ...state, dirty: {}, past: [], future: [] };
    default:
      return state;
  }
}

const StateCtx = createContext<TableState | null>(null);
const DispatchCtx = createContext<Dispatch<TableAction> | null>(null);
const RequestsCtx = createContext<WorkspaceRequests | null>(null);

export function useWorkspaceRequests(): WorkspaceRequests {
  const requests = useContext(RequestsCtx);
  if (!requests) throw new Error("useWorkspaceRequests must be used within TableProvider");
  return requests;
}

export function TableProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tableReducer, initialState);
  const requests = useRef(new WorkspaceRequests()).current;
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>
        <RequestsCtx.Provider value={requests}>{children}</RequestsCtx.Provider>
      </DispatchCtx.Provider>
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

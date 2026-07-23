// Lazy tree: source -> schema -> table -> column. Click a source to connect
// (or expand/collapse if already connected — only one source is ever
// connected at a time); click a table to open it in the grid; click a
// table's chevron to expand/collapse its columns without opening it.
//
// `tables`/`expanded`/`columnsByTable`/`loadingCols` are local to this
// component on purpose — nothing outside the tree reads them, so keeping
// them out of the global Sources/Table contexts means expanding a node here
// never re-renders the grid or toolbar.

import { useEffect, useReducer } from "react";
import { useSourcesState } from "../../state/sourcesStore";
import { useSourceActions } from "../../hooks/useSourceActions";
import { useTableState } from "../../state/tableStore";
import { useToast } from "../../state/toastStore";
import { unwrapOr } from "../../hooks/useApi";
import { SourceRow } from "./SourceRow";
import { SchemaRow } from "./SchemaRow";
import { TableRow } from "./TableRow";
import { NavRow } from "./NavRow";
import { ColumnIcon } from "../common/icons";

const kSrc = (id: string) => "src:" + id;
const kSch = (s: string) => "sch:" + s;
const kTbl = (s: string, t: string) => "tbl:" + s + "." + t;

interface NavState {
  tables: TableInfo[];
  expanded: Set<string>;
  columnsByTable: Record<string, Column[]>;
  loadingCols: Set<string>;
}
const initialNav: NavState = {
  tables: [],
  expanded: new Set(),
  columnsByTable: {},
  loadingCols: new Set(),
};

type NavAction =
  | { type: "SET_TABLES"; tables: TableInfo[] }
  | { type: "RESET_FOR_CONNECT"; sourceId: string }
  | { type: "RESET_FOR_DISCONNECT" }
  | { type: "REFRESH_START" }
  | { type: "TOGGLE_KEY"; key: string }
  | { type: "EXPAND_KEY"; key: string }
  | { type: "COLLAPSE_KEY"; key: string }
  | { type: "COLUMNS_LOADING"; key: string }
  | { type: "COLUMNS_LOADED"; key: string; columns: Column[] }
  | { type: "COLUMNS_FAILED"; key: string };

function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case "SET_TABLES":
      return { ...state, tables: action.tables };
    case "RESET_FOR_CONNECT":
      return {
        tables: [],
        expanded: new Set([kSrc(action.sourceId)]),
        columnsByTable: {},
        loadingCols: new Set(),
      };
    case "RESET_FOR_DISCONNECT":
      return { tables: [], expanded: new Set(), columnsByTable: {}, loadingCols: new Set() };
    case "REFRESH_START":
      // A manual refresh clears the column cache and refetches tables, but —
      // matching the old renderer's refreshNav() — leaves `expanded` alone,
      // so already-open schemas/tables stay open.
      return { ...state, columnsByTable: {}, loadingCols: new Set() };
    case "TOGGLE_KEY": {
      const expanded = new Set(state.expanded);
      if (expanded.has(action.key)) expanded.delete(action.key);
      else expanded.add(action.key);
      return { ...state, expanded };
    }
    case "EXPAND_KEY": {
      const expanded = new Set(state.expanded);
      expanded.add(action.key);
      return { ...state, expanded };
    }
    case "COLLAPSE_KEY": {
      const expanded = new Set(state.expanded);
      expanded.delete(action.key);
      return { ...state, expanded };
    }
    case "COLUMNS_LOADING": {
      const loadingCols = new Set(state.loadingCols);
      loadingCols.add(action.key);
      return { ...state, loadingCols };
    }
    case "COLUMNS_LOADED": {
      const loadingCols = new Set(state.loadingCols);
      loadingCols.delete(action.key);
      return {
        ...state,
        loadingCols,
        columnsByTable: { ...state.columnsByTable, [action.key]: action.columns },
      };
    }
    case "COLUMNS_FAILED": {
      const loadingCols = new Set(state.loadingCols);
      loadingCols.delete(action.key);
      return { ...state, loadingCols };
    }
    default:
      return state;
  }
}

interface NavigatorTreeProps {
  filter: string;
  refreshSignal: number;
  onOpenTable: (schema: string, table: string) => void;
  onSourceContextMenu: (id: string, x: number, y: number) => void;
}

export function NavigatorTree({
  filter,
  refreshSignal,
  onOpenTable,
  onSourceContextMenu,
}: NavigatorTreeProps) {
  const { sources, connectedId, connectingId, errorId } = useSourcesState();
  const { connect } = useSourceActions();
  const { current } = useTableState();
  const { show: toast } = useToast();
  const [nav, dispatch] = useReducer(navReducer, initialNav);

  // Reset the tree and (re)fetch tables whenever the connected source
  // changes; auto-expand a lone schema, matching the old renderer.
  useEffect(() => {
    if (!connectedId) {
      dispatch({ type: "RESET_FOR_DISCONNECT" });
      return;
    }
    dispatch({ type: "RESET_FOR_CONNECT", sourceId: connectedId });
    let cancelled = false;
    (async () => {
      const tables = await unwrapOr(window.api.listTables(), []);
      if (cancelled) return;
      dispatch({ type: "SET_TABLES", tables });
      const schemas = new Set(tables.map((t) => t.schema));
      if (schemas.size === 1) {
        const [schema] = schemas;
        dispatch({ type: "EXPAND_KEY", key: kSch(schema) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectedId]);

  // "Refresh" from the source context menu: re-fetch tables + drop the
  // column cache without disturbing which nodes are expanded. Skipped on
  // mount (refreshSignal starts at 0, same as the connect effect above).
  useEffect(() => {
    if (!connectedId || refreshSignal === 0) return;
    dispatch({ type: "REFRESH_START" });
    let cancelled = false;
    (async () => {
      const tables = await unwrapOr(window.api.listTables(), []);
      if (!cancelled) dispatch({ type: "SET_TABLES", tables });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  async function toggleTable(schema: string, table: string): Promise<void> {
    const key = kTbl(schema, table);
    if (nav.expanded.has(key)) {
      dispatch({ type: "COLLAPSE_KEY", key });
      return;
    }
    dispatch({ type: "EXPAND_KEY", key });
    if (!nav.columnsByTable[key] && !nav.loadingCols.has(key)) {
      dispatch({ type: "COLUMNS_LOADING", key });
      const res = await window.api.tableColumns(schema, table);
      if (res.ok) {
        dispatch({ type: "COLUMNS_LOADED", key, columns: res.data.columns });
      } else {
        dispatch({ type: "COLUMNS_FAILED", key });
        toast(res.error, true);
      }
    }
  }

  const q = filter.toLowerCase();

  function groupTables(): Record<string, TableInfo[]> {
    const by: Record<string, TableInfo[]> = {};
    for (const t of nav.tables) {
      if (q && !t.name.toLowerCase().includes(q)) continue;
      (by[t.schema] = by[t.schema] || []).push(t);
    }
    return by;
  }

  function renderColumns(schema: string, table: string) {
    const key = kTbl(schema, table);
    const cols = nav.columnsByTable[key];
    if (!cols) {
      return (
        <div className="nloading" style={{ paddingLeft: 54 }}>
          loading…
        </div>
      );
    }
    return cols.map((c) => (
      <NavRow
        key={c.name}
        kind="column"
        depth={3}
        icon={<ColumnIcon size={14} />}
        label={c.name}
        leaf
        typeText={c.dataType}
        title={`${c.name}: ${c.dataType}`}
        pk={c.isPk}
      />
    ));
  }

  function renderTables(schema: string, tables: TableInfo[]) {
    return tables.map((t) => {
      const key = kTbl(schema, t.name);
      const open = nav.expanded.has(key);
      const active = !!current && current.schema === schema && current.name === t.name;
      return (
        <TableRow
          key={key}
          schema={schema}
          table={t}
          open={open}
          active={active}
          matchQuery={q}
          onOpenTable={() => onOpenTable(schema, t.name)}
          onToggleColumns={() => toggleTable(schema, t.name)}
        >
          {open && renderColumns(schema, t.name)}
        </TableRow>
      );
    });
  }

  function renderSchemas() {
    const by = groupTables();
    const schemas = Object.keys(by);
    if (!schemas.length) {
      return (
        <div className="nempty" style={{ paddingLeft: 36 }}>
          {q ? "no matches" : "no tables"}
        </div>
      );
    }
    return schemas.map((schema) => {
      const open = q ? true : nav.expanded.has(kSch(schema));
      return (
        <SchemaRow
          key={schema}
          schema={schema}
          open={open}
          onClick={() => dispatch({ type: "TOGGLE_KEY", key: kSch(schema) })}
        >
          {open && renderTables(schema, by[schema])}
        </SchemaRow>
      );
    });
  }

  return (
    <div className="tree">
      {!sources.length ? (
        <div className="tree-empty">No data sources yet. Click + to add one.</div>
      ) : (
        sources.map((src) => {
          const connected = connectedId === src.id;
          const open = connected && nav.expanded.has(kSrc(src.id));
          const status: "off" | "connecting" | "error" | "connected" =
            connectingId === src.id
              ? "connecting"
              : errorId === src.id
                ? "error"
                : connected
                  ? "connected"
                  : "off";
          return (
            <SourceRow
              key={src.id}
              source={src}
              status={status}
              open={open}
              onClick={() => {
                if (connected) dispatch({ type: "TOGGLE_KEY", key: kSrc(src.id) });
                else connect(src);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onSourceContextMenu(src.id, e.clientX, e.clientY);
              }}
            >
              {open && renderSchemas()}
            </SourceRow>
          );
        })
      )}
    </div>
  );
}

import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTableState, useTableDispatch, useWorkspaceRequests } from "../../state/tableStore";
import { useSourcesState } from "../../state/sourcesStore";
import { useTableActions } from "../../hooks/useTableActions";
import { displayRowKey, pkValsOf } from "../../lib/rowKey";
import { dirtyKey } from "../../lib/dirty";
import { describeValue, selectionBounds, toTsv, type GridPoint } from "../../lib/gridSelection";
import { useColumnLayout } from "../../hooks/useColumnLayout";
import { ColumnChooser } from "./ColumnChooser";
import { GridHeaderCell } from "./GridHeaderCell";
import { ColumnFilterPopover } from "./ColumnFilterPopover";
import { ContextMenu } from "../common/ContextMenu";
import { ColumnsIcon } from "../common/icons";
import { ValueInspector } from "./ValueInspector";
import { useToast } from "../../state/toastStore";

import { InlineCellEditor } from "./InlineCellEditor";

export function InteractiveGrid({
  rows,
  empty,
  status,
}: {
  rows: Record<string, Cell>[];
  // Rendered inside the data area (not above it) so the message sits where the
  // rows would be instead of shoving the grid chrome down the page.
  empty?: ReactNode;
  // Pager/page-size/count, which belong to the view, share the grid's status
  // bar rather than getting a second row of their own.
  status?: ReactNode;
}) {
  const state = useTableState();
  const { pk, dirty, offset, rows: allRows, current, loading } = state;
  const { connectedId } = useSourcesState();
  const requests = useWorkspaceRequests();
  const dispatch = useTableDispatch();
  const { setSort, applyColFilter } = useTableActions();
  const { show: toast } = useToast();
  const storageKey = `columns:${JSON.stringify([connectedId, current?.schema, current?.name])}`;
  const { layout, setLayout, resize, autoFit } = useColumnLayout(storageKey);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [anchor, setAnchor] = useState<GridPoint>({ row: 0, col: 0 });
  const [selected, setSelected] = useState<GridPoint>({ row: 0, col: 0 });
  const [editing, setEditing] = useState<GridPoint | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [funnel, setFunnel] = useState<{ col: string; anchor: HTMLElement } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const columns = state.columns
    .filter((c) => !layout.hidden.includes(c.name))
    .sort(
      (a, b) => Number(layout.pinned.includes(b.name)) - Number(layout.pinned.includes(a.name)),
    );
  const allHidden = state.columns.length > 0 && columns.length === 0;
  const bounds = selectionBounds(anchor, selected);
  const selectedCells = rows.length
    ? (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1)
    : 0;
  const selectedRow = rows[selected.row];
  const selectedColumn = columns[selected.col];
  const rowKeys = useMemo(
    () => new Map(allRows.map((row, index) => [row, displayRowKey(pk, row, index)])),
    [allRows, pk],
  );
  const keyOf = (row: Record<string, Cell>) => rowKeys.get(row)!;
  const valueOf = (row: Record<string, Cell>, col: string): Cell => {
    const edit = dirty[dirtyKey(keyOf(row), col)];
    return edit ? edit.val : row[col];
  };
  const editable = (col: Column) => pk.length > 0 && !col.isPk && !loading && !requests.busy;
  function focus() {
    tableRef.current?.focus({ preventScroll: true });
  }
  function move(point: GridPoint, extend = false) {
    const next = {
      row: Math.max(0, Math.min(rows.length - 1, point.row)),
      col: Math.max(0, Math.min(columns.length - 1, point.col)),
    };
    setSelected(next);
    if (!extend) setAnchor(next);
    requestAnimationFrame(() =>
      tableRef.current
        ?.querySelector(`[data-row="${next.row}"][data-col="${next.col}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    );
  }
  function advance(back: boolean) {
    const index = selected.row * columns.length + selected.col + (back ? -1 : 1);
    const next = Math.max(0, Math.min(rows.length * columns.length - 1, index));
    move({ row: Math.floor(next / columns.length), col: next % columns.length });
    focus();
  }
  function commit(point: GridPoint, value: Cell) {
    const row = rows[point.row],
      col = columns[point.col];
    if (!row || !col || !editable(col)) return;
    dispatch({
      type: "COMMIT_CELL",
      rowKey: keyOf(row),
      col: col.name,
      pkVals: pkValsOf(pk, row),
      orig: row[col.name],
      val: value,
    });
  }
  async function copy() {
    const values = rows
      .slice(bounds.top, bounds.bottom + 1)
      .map((row) =>
        columns.slice(bounds.left, bounds.right + 1).map((col) => valueOf(row, col.name)),
      );
    try {
      await navigator.clipboard.writeText(toTsv(values));
      toast("Copied selection as TSV");
    } catch {
      toast("Could not copy selection", true);
    }
  }
  function onKeyDown(e: KeyboardEvent<HTMLTableElement>) {
    if (
      (e.target as HTMLElement).tagName === "INPUT" ||
      (e.target as HTMLElement).closest("button")
    )
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      e.preventDefault();
      void copy();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setAnchor({ row: 0, col: 0 });
      setSelected({ row: rows.length - 1, col: columns.length - 1 });
      return;
    }
    if (!selectedRow || !selectedColumn) return;
    const steps: Record<string, GridPoint> = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 },
    };
    if (steps[e.key]) {
      e.preventDefault();
      move(
        { row: selected.row + steps[e.key].row, col: selected.col + steps[e.key].col },
        e.shiftKey,
      );
    } else if (e.key === "Tab") {
      e.preventDefault();
      advance(e.shiftKey);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (editable(selectedColumn)) setEditing(selected);
      else setInspecting(true);
    } else if (e.key === "Escape") {
      setEditing(null);
      setAnchor(selected);
    } else if (e.key === "F2") {
      e.preventDefault();
      setInspecting(true);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const rect = tableRef.current
        ?.querySelector(`[data-row="${selected.row}"][data-col="${selected.col}"]`)
        ?.getBoundingClientRect();
      if (rect) setMenu({ x: rect.left, y: rect.bottom });
    }
  }
  const tableStyle = Object.fromEntries(
    columns.map((c, i) => [`--col-w-${i}`, `${layout.widths[c.name] ?? 160}px`]),
  ) as CSSProperties;
  function pinnedStyle(index: number): CSSProperties {
    if (!layout.pinned.includes(columns[index].name)) return {};
    return {
      position: "sticky",
      left:
        40 + columns.slice(0, index).reduce((sum, c) => sum + (layout.widths[c.name] ?? 160), 0),
      zIndex: 2,
    };
  }
  return (
    <>
      <div className="grid-layout">
        <div className="grid-scroll" aria-busy={loading}>
          {columns.length > 0 && (
            <table
              ref={tableRef}
              className="interactive-grid"
              role="grid"
              aria-label="Table data"
              tabIndex={0}
              aria-rowcount={rows.length + 1}
              aria-colcount={columns.length + 1}
              aria-activedescendant={
                selectedRow && selectedColumn ? `cell-${selected.row}-${selected.col}` : undefined
              }
              style={tableStyle}
              onKeyDown={onKeyDown}
            >
              <thead>
                <tr>
                  <th className="gutter-h" aria-label="Row number" />
                  {columns.map((col, i) => (
                    <GridHeaderCell
                      key={col.name}
                      column={col}
                      index={i}
                      currentWidth={layout.widths[col.name] ?? 160}
                      sorted={state.sortCol === col.name}
                      sortDir={state.sortDir}
                      filtered={!!state.colFilters[col.name]}
                      onSortClick={() => {
                        if (!loading) void setSort(col.name);
                      }}
                      onFunnelClick={(anchor) => setFunnel({ col: col.name, anchor })}
                      onResizeStart={(event) => resize(event, col.name)}
                      onAutoFit={() =>
                        autoFit(
                          col.name,
                          rows.map((row) => describeValue(valueOf(row, col.name))),
                          getComputedStyle(tableRef.current!).font,
                        )
                      }
                      stickyStyle={pinnedStyle(i)}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, r) => (
                  <tr key={keyOf(row)}>
                    <td
                      className="gutter"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setAnchor({ row: r, col: 0 });
                        setSelected({ row: r, col: columns.length - 1 });
                        focus();
                      }}
                    >
                      {offset + allRows.indexOf(row) + 1}
                    </td>
                    {columns.map((col, c) => {
                      const value = valueOf(row, col.name),
                        point = { row: r, col: c };
                      const inRange =
                        r >= bounds.top &&
                        r <= bounds.bottom &&
                        c >= bounds.left &&
                        c <= bounds.right;
                      const isEditing = editing?.row === r && editing.col === c;
                      return (
                        <td
                          key={col.name}
                          id={`cell-${r}-${c}`}
                          data-row={r}
                          data-col={c}
                          role="gridcell"
                          aria-selected={inRange}
                          aria-readonly={!editable(col)}
                          title={describeValue(value)}
                          className={[
                            inRange ? "selected" : "",
                            r === selected.row && c === selected.col ? "focused" : "",
                            dirty[dirtyKey(keyOf(row), col.name)] ? "dirty" : "",
                            layout.pinned.includes(col.name) ? "pinned" : "",
                            /^(smallint|integer|bigint|numeric|real|double|decimal)/i.test(
                              col.dataType,
                            )
                              ? "num"
                              : "",
                          ].join(" ")}
                          style={{
                            width: layout.widths[col.name] ?? 160,
                            maxWidth: layout.widths[col.name] ?? 160,
                            ...pinnedStyle(c),
                          }}
                          onMouseDown={(e) => {
                            if (isEditing || e.button !== 0) return;
                            e.preventDefault();
                            move(point, e.shiftKey);
                            focus();
                          }}
                          onMouseEnter={(e) => {
                            if (e.buttons === 1 && !editing) move(point, true);
                          }}
                          onDoubleClick={() => {
                            if (editable(col)) setEditing(point);
                            else setInspecting(true);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (!inRange) move(point);
                            focus();
                            setMenu({ x: e.clientX, y: e.clientY });
                          }}
                        >
                          {isEditing ? (
                            <InlineCellEditor
                              value={value}
                              onCommit={(text) => {
                                commit(point, text);
                                setEditing(null);
                                focus();
                              }}
                              onCancel={() => {
                                setEditing(null);
                                focus();
                              }}
                              onAdvance={advance}
                            />
                          ) : (
                            <span
                              className={`cell ${value === null || value.trim() === "" ? "special-value" : ""}`}
                            >
                              {describeValue(value)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {allHidden ? (
            <div className="grid-empty">
              <strong>All columns are hidden</strong>
              <button className="btn ghost" onClick={() => setColumnsOpen(true)}>
                Choose columns
              </button>
            </div>
          ) : empty ? (
            <div className="grid-empty">{empty}</div>
          ) : null}
        </div>
        {inspecting && selectedRow && selectedColumn && (
          <ValueInspector
            key={JSON.stringify([
              keyOf(selectedRow),
              selectedColumn.name,
              valueOf(selectedRow, selectedColumn.name),
            ])}
            column={selectedColumn}
            value={valueOf(selectedRow, selectedColumn.name)}
            editable={editable(selectedColumn)}
            onApply={(value) => commit(selected, value)}
            onClose={() => {
              setInspecting(false);
              focus();
            }}
          />
        )}
      </div>
      {columnsOpen && (
        <ColumnChooser
          columns={state.columns}
          layout={layout}
          setLayout={setLayout}
          onChange={() => {
            setEditing(null);
            setSelected({ row: 0, col: 0 });
            setAnchor({ row: 0, col: 0 });
          }}
          onClose={() => setColumnsOpen(false)}
        />
      )}
      <footer className="table-status">
        {status}
        <span className="spacer" />
        {selectedCells > 1 && <span>{selectedCells} cells selected</span>}
        {state.columns.length > 0 && (
          <button
            className="btn ghost"
            aria-expanded={columnsOpen}
            title="Show, hide and pin columns"
            onClick={() => setColumnsOpen(!columnsOpen)}
          >
            <ColumnsIcon size={13} /> Columns
          </button>
        )}
      </footer>
      {funnel && (
        <ColumnFilterPopover
          column={funnel.col}
          anchor={funnel.anchor}
          current={state.colFilters[funnel.col]}
          onApply={(filter) => applyColFilter(funnel.col, filter)}
          onClose={() => setFunnel(null)}
        />
      )}
      {menu && selectedColumn && selectedRow && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <button
            onClick={() => {
              void copy();
              setMenu(null);
            }}
          >
            Copy selection <kbd>⌘/Ctrl C</kbd>
          </button>
          <button
            onClick={() => {
              setInspecting(true);
              setMenu(null);
            }}
          >
            Inspect value <kbd>F2</kbd>
          </button>
          <button
            disabled={!editable(selectedColumn) || selectedColumn.notNull}
            onClick={() => {
              commit(selected, null);
              setMenu(null);
            }}
          >
            Set NULL
          </button>
          <button
            disabled={!editable(selectedColumn)}
            onClick={() => {
              commit(selected, "");
              setMenu(null);
            }}
          >
            Set empty string
          </button>
          <button
            onClick={() => {
              const value = valueOf(selectedRow, selectedColumn.name);
              void applyColFilter(selectedColumn.name, {
                op: value === null ? "isnull" : "=",
                value: value ?? "",
              });
              setMenu(null);
            }}
          >
            Filter by this value
          </button>
        </ContextMenu>
      )}
    </>
  );
}

import {
  Fragment,
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
import { describeValue, selectionBounds, toTsv, type GridPoint } from "../../lib/gridSelection";
import { useColumnLayout } from "../../hooks/useColumnLayout";
import { useGridViewport } from "../../hooks/useGridViewport";
import { rowWindow, columnWindow, columnSlots } from "../../lib/gridWindow";
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
  const { scrollRef, viewport, syncScroll } = useGridViewport(
    tableRef,
    rows.length,
    state.columns.length,
  );
  const columns = useMemo(
    () =>
      state.columns
        .filter((c) => !layout.hidden.includes(c.name))
        .sort(
          (a, b) => Number(layout.pinned.includes(b.name)) - Number(layout.pinned.includes(a.name)),
        ),
    [state.columns, layout.hidden, layout.pinned],
  );
  const columnLayout = useMemo(() => {
    const offsets = [0];
    const styles: CSSProperties[] = [];
    const numeric: boolean[] = [];
    let pinnedCount = 0;
    for (const column of columns) {
      const width = layout.widths[column.name] ?? 160;
      const pinned = layout.pinned.includes(column.name);
      styles.push({
        width,
        maxWidth: width,
        ...(pinned
          ? ({ position: "sticky", left: 40 + offsets.at(-1)!, zIndex: 2 } as CSSProperties)
          : {}),
      });
      numeric.push(/^(smallint|integer|bigint|numeric|real|double|decimal)/i.test(column.dataType));
      if (pinned) pinnedCount++;
      offsets.push(offsets.at(-1)! + width);
    }
    return { offsets, styles, numeric, pinnedCount };
  }, [columns, layout.widths, layout.pinned]);
  const rowRange = rowWindow(
    rows.length,
    viewport.top,
    viewport.height,
    viewport.rowHeight,
    viewport.headerHeight,
  );
  const colRange = columnWindow(
    columnLayout.offsets,
    columnLayout.pinnedCount,
    viewport.left,
    viewport.width,
  );
  const slots = columnSlots(columnLayout.offsets, columnLayout.pinnedCount, colRange, [
    editing?.col ?? -1,
    funnel ? columns.findIndex((column) => column.name === funnel.col) : -1,
  ]);
  const mountedRows = Array.from(
    { length: Math.max(0, rowRange.end - rowRange.start) },
    (_, i) => rowRange.start + i,
  );
  if (editing && editing.row < rows.length && !mountedRows.includes(editing.row)) {
    mountedRows.push(editing.row);
    mountedRows.sort((a, b) => a - b);
  }
  const allHidden = state.columns.length > 0 && columns.length === 0;
  const bounds = selectionBounds(anchor, selected);
  const selectedCells = rows.length
    ? (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1)
    : 0;
  const selectedRow = rows[selected.row];
  const selectedColumn = columns[selected.col];
  const rowKeys = useMemo(
    () =>
      new Map(allRows.map((row, index) => [row, { key: displayRowKey(pk, row, index), index }])),
    [allRows, pk],
  );
  const keyOf = (row: Record<string, Cell>) => rowKeys.get(row)!.key;
  const editsByRow = useMemo(() => {
    const edits = new Map<string, Map<string, Cell>>();
    for (const entry of Object.values(dirty)) {
      let row = edits.get(entry.rowKey);
      if (!row) {
        row = new Map();
        edits.set(entry.rowKey, row);
      }
      row.set(entry.col, entry.val);
    }
    return edits;
  }, [dirty]);
  const valueOf = (row: Record<string, Cell>, col: string): Cell => {
    const edits = editsByRow.get(keyOf(row));
    return edits?.has(col) ? edits.get(col)! : row[col];
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
    setSelected((old) => (old.row === next.row && old.col === next.col ? old : next));
    if (!extend) setAnchor((old) => (old.row === next.row && old.col === next.col ? old : next));
    // Navigation uses logical positions, including cells not currently mounted.
    const scroll = scrollRef.current;
    if (scroll) {
      const top = next.row * viewport.rowHeight;
      const bottom = top + viewport.rowHeight;
      const height = scroll.clientHeight - viewport.headerHeight;
      if (top < scroll.scrollTop) scroll.scrollTop = top;
      else if (bottom > scroll.scrollTop + height) scroll.scrollTop = bottom - height;
      if (next.col >= columnLayout.pinnedCount) {
        const left = 40 + columnLayout.offsets[next.col];
        const right = 40 + columnLayout.offsets[next.col + 1];
        const pinned = 40 + columnLayout.offsets[columnLayout.pinnedCount];
        if (left < scroll.scrollLeft + pinned) scroll.scrollLeft = left - pinned;
        else if (right > scroll.scrollLeft + scroll.clientWidth)
          scroll.scrollLeft = right - scroll.clientWidth;
      }
      syncScroll();
    }
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
  const tableStyle = useMemo(
    () =>
      ({
        ...Object.fromEntries(
          columns.map((c, i) => [`--col-w-${i}`, `${layout.widths[c.name] ?? 160}px`]),
        ),
        width: 40 + columnLayout.offsets.at(-1)!,
      }) as CSSProperties,
    [columns, layout.widths, columnLayout.offsets],
  );
  const selectedMounted =
    mountedRows.includes(selected.row) &&
    slots.some((slot) => slot.kind === "column" && slot.index === selected.col);
  function rowSpace(height: number, key: string) {
    return height > 0 ? (
      <tr key={key} className="grid-row-space" aria-hidden="true" role="presentation">
        <td colSpan={slots.length + 1} style={{ height }} />
      </tr>
    ) : null;
  }
  return (
    <>
      <div className="grid-layout">
        <div ref={scrollRef} className="grid-scroll" aria-busy={loading}>
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
                selectedRow && selectedColumn && selectedMounted
                  ? `cell-${selected.row}-${selected.col}`
                  : undefined
              }
              style={tableStyle}
              onKeyDown={onKeyDown}
            >
              <colgroup>
                <col style={{ width: 40 }} />
                {slots.map((slot) => (
                  <col key={`${slot.kind}-${slot.index}`} style={{ width: slot.width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="gutter-h" aria-label="Row number" aria-colindex={1} />
                  {slots.map((slot) => {
                    if (slot.kind === "space")
                      return (
                        <th
                          key={`space-${slot.index}`}
                          className="grid-column-space"
                          aria-hidden="true"
                          role="presentation"
                        />
                      );
                    const i = slot.index,
                      col = columns[i];
                    return (
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
                        stickyStyle={columnLayout.styles[i]}
                      />
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {mountedRows.map((r, mountedIndex) => {
                  const row = rows[r];
                  const previous = mountedRows[mountedIndex - 1] ?? -1;
                  return (
                    <Fragment key={keyOf(row)}>
                      {rowSpace((r - previous - 1) * viewport.rowHeight, `space-${previous}`)}
                      <tr
                        className={`grid-data-row${r % 2 ? " even-row" : ""}`}
                        data-row={r}
                        aria-rowindex={r + 2}
                      >
                        <td
                          className="gutter"
                          role="rowheader"
                          aria-colindex={1}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setAnchor({ row: r, col: 0 });
                            setSelected({ row: r, col: columns.length - 1 });
                            focus();
                          }}
                        >
                          {offset + rowKeys.get(row)!.index + 1}
                        </td>
                        {slots.map((slot) => {
                          if (slot.kind === "space")
                            return (
                              <td
                                key={`space-${slot.index}`}
                                className="grid-column-space"
                                aria-hidden="true"
                                role="presentation"
                              />
                            );
                          const c = slot.index,
                            col = columns[c];
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
                              aria-colindex={c + 2}
                              aria-selected={inRange}
                              aria-readonly={!editable(col)}
                              title={describeValue(value)}
                              className={[
                                inRange ? "selected" : "",
                                r === selected.row && c === selected.col ? "focused" : "",
                                editsByRow.get(keyOf(row))?.has(col.name) ? "dirty" : "",
                                layout.pinned.includes(col.name) ? "pinned" : "",
                                columnLayout.numeric[c] ? "num" : "",
                              ].join(" ")}
                              style={columnLayout.styles[c]}
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
                    </Fragment>
                  );
                })}
                {rowSpace(
                  (rows.length - ((mountedRows.at(-1) ?? -1) + 1)) * viewport.rowHeight,
                  "space-end",
                )}
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

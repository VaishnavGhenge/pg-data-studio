// The parent is expected to remount this component (via a `key` derived from
// schema+name+offset+sort+where+filters) whenever the underlying result set
// changes — that's what resets cell selection/edit state and closes any open
// popover/menu, mirroring the old renderer's renderGrid() resetting
// selectedTd on every call, without having to enumerate every place that
// could trigger it.

import { useCallback, useState, type MouseEvent } from "react";
import { useTableState, useTableDispatch } from "../../state/tableStore";
import { useTableActions } from "../../hooks/useTableActions";
import { useCellEditing } from "../../hooks/useCellEditing";
import { rowKeyOf, pkValsOf } from "../../lib/rowKey";
import { computeCommitValue, dirtyKey } from "../../lib/dirty";
import { GridHeaderCell } from "./GridHeaderCell";
import { GridRow } from "./GridRow";
import { ColumnFilterPopover } from "./ColumnFilterPopover";
import { CellContextMenu } from "./CellContextMenu";
import { CellEditorModal } from "./CellEditorModal";

interface GridTableProps {
  // Already quick-filtered by the caller (TableView), which also needs the
  // filtered count for the toolbar's row counter — computing it once there
  // avoids duplicating the same filter pass in two places.
  rows: Record<string, Cell>[];
}

export function GridTable({ rows }: GridTableProps) {
  const { columns, pk, sortCol, sortDir, colFilters, dirty, offset } = useTableState();
  const dispatch = useTableDispatch();
  const { setSort, applyColFilter } = useTableActions();
  const { selected, editing, select, beginEdit, updateDraft, endEdit } = useCellEditing();

  const [funnelTarget, setFunnelTarget] = useState<{ col: string; anchor: HTMLElement } | null>(
    null
  );
  const [cellMenu, setCellMenu] = useState<{
    rowKey: string;
    col: string;
    x: number;
    y: number;
  } | null>(null);
  const [editorTarget, setEditorTarget] = useState<{ rowKey: string; col: string } | null>(null);

  const isEditableTable = pk.length > 0;

  function findRow(rowKey: string): Record<string, Cell> | undefined {
    return rows.find((r) => rowKeyOf(pk, r) === rowKey);
  }

  function cellIsEditable(colName: string): boolean {
    const meta = columns.find((c) => c.name === colName);
    return isEditableTable && !!meta && !meta.isPk;
  }

  // Stable across renders (only reference rows/pk/dispatch, none of which
  // change from a keystroke) — passed straight to every GridRow, so rows
  // uninvolved in the current edit see identical props and skip re-rendering
  // entirely instead of every row re-rendering on every keystroke.
  const setCellValue = useCallback(
    (rowKey: string, col: string, val: Cell) => {
      const row = rows.find((r) => rowKeyOf(pk, r) === rowKey);
      if (!row) return;
      dispatch({ type: "COMMIT_CELL", rowKey, col, pkVals: pkValsOf(pk, row), orig: row[col], val });
    },
    [rows, pk, dispatch]
  );

  const commitCellFromText = useCallback(
    (rowKey: string, col: string, text: string) => {
      setCellValue(rowKey, col, computeCommitValue(text));
    },
    [setCellValue]
  );

  const handleCellContextMenu = useCallback((rowKey: string, col: string, e: MouseEvent) => {
    e.preventDefault();
    setCellMenu({ rowKey, col, x: e.clientX, y: e.clientY });
  }, []);

  return (
    <>
      <table>
        <thead>
          <tr>
            <th className="gutter-h" />
            {columns.map((c) => (
              <GridHeaderCell
                key={c.name}
                column={c}
                sorted={sortCol === c.name}
                sortDir={sortDir}
                filtered={!!colFilters[c.name]}
                onSortClick={() => setSort(c.name)}
                onFunnelClick={(anchor) => setFunnelTarget({ col: c.name, anchor })}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const rk = rowKeyOf(pk, row);
            const isRowSelected = selected?.rowKey === rk;
            const isRowEditing = editing?.rowKey === rk;
            return (
              <GridRow
                key={rk}
                rowNum={offset + idx + 1}
                row={row}
                rowKey={rk}
                columns={columns}
                dirty={dirty}
                isEditableTable={isEditableTable}
                isRowSelected={isRowSelected}
                selectedCol={isRowSelected ? selected.col : null}
                isRowEditing={isRowEditing}
                editingCol={isRowEditing ? editing.col : null}
                editDraft={isRowEditing ? editing.draft : ""}
                onSelectCell={select}
                onBeginEdit={beginEdit}
                onDraftChange={updateDraft}
                onCommitCell={commitCellFromText}
                onEndEdit={endEdit}
                onCellContextMenu={handleCellContextMenu}
              />
            );
          })}
        </tbody>
      </table>

      {funnelTarget && (
        <ColumnFilterPopover
          column={funnelTarget.col}
          anchor={funnelTarget.anchor}
          current={colFilters[funnelTarget.col]}
          onApply={(filter) => applyColFilter(funnelTarget.col, filter)}
          onClose={() => setFunnelTarget(null)}
        />
      )}

      {cellMenu && (
        <CellContextMenu
          x={cellMenu.x}
          y={cellMenu.y}
          editable={cellIsEditable(cellMenu.col)}
          onClose={() => setCellMenu(null)}
          onEditInEditor={() => setEditorTarget({ rowKey: cellMenu.rowKey, col: cellMenu.col })}
          onSetNull={() => setCellValue(cellMenu.rowKey, cellMenu.col, null)}
        />
      )}

      {editorTarget &&
        (() => {
          const row = findRow(editorTarget.rowKey);
          const d = dirty[dirtyKey(editorTarget.rowKey, editorTarget.col)];
          const cur: Cell = row ? (d ? d.val : row[editorTarget.col]) : null;
          return (
            <CellEditorModal
              open
              col={editorTarget.col}
              editable={cellIsEditable(editorTarget.col)}
              initialValue={cur}
              onClose={() => setEditorTarget(null)}
              onSave={(val) => setCellValue(editorTarget.rowKey, editorTarget.col, val)}
            />
          );
        })()}
    </>
  );
}

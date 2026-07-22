// Memoized: `dirty` only changes reference at commit time (not per
// keystroke — the in-progress draft lives in GridTable's local
// useCellEditing state, outside this component's props), and the
// selected/editing flags passed down are per-row primitives, so a row not
// involved in the current selection/edit sees no prop changes and skips
// re-rendering entirely.

import { memo, type MouseEvent } from "react";
import { GridCell } from "./GridCell";
import { dirtyKey, type DirtyEntry } from "../../lib/dirty";

interface GridRowProps {
  rowNum: number;
  row: Record<string, Cell>;
  rowKey: string;
  columns: Column[];
  dirty: Record<string, DirtyEntry>;
  isEditableTable: boolean;
  isRowSelected: boolean;
  selectedCol: string | null;
  isRowEditing: boolean;
  editingCol: string | null;
  editDraft: string;
  // These are the same stable function references for every row (bound in
  // GridTable via useCallback), so they must accept rowKey explicitly rather
  // than each row's caller pre-binding it into a fresh closure — otherwise
  // every row would get a "new" prop every render and never skip re-rendering.
  onSelectCell: (rowKey: string, col: string) => void;
  onBeginEdit: (rowKey: string, col: string, initialText: string) => void;
  onDraftChange: (text: string) => void;
  onCommitCell: (rowKey: string, col: string, text: string) => void;
  onEndEdit: () => void;
  onCellContextMenu: (rowKey: string, col: string, e: MouseEvent) => void;
}

function GridRowImpl({
  rowNum,
  row,
  rowKey,
  columns,
  dirty,
  isEditableTable,
  isRowSelected,
  selectedCol,
  isRowEditing,
  editingCol,
  editDraft,
  onSelectCell,
  onBeginEdit,
  onDraftChange,
  onCommitCell,
  onEndEdit,
  onCellContextMenu,
}: GridRowProps) {
  const rowIsDirty = columns.some((c) => dirty[dirtyKey(rowKey, c.name)]);

  return (
    <tr className={rowIsDirty ? "dirty-row" : ""}>
      <td className="gutter">{rowNum}</td>
      {columns.map((c) => {
        const d = dirty[dirtyKey(rowKey, c.name)];
        const origValue = row[c.name];
        const displayValue = d ? d.val : origValue;
        return (
          <GridCell
            key={c.name}
            col={c}
            origValue={origValue}
            displayValue={displayValue}
            isDirty={!!d}
            isEditable={isEditableTable && !c.isPk}
            isSelected={isRowSelected && selectedCol === c.name}
            isEditing={isRowEditing && editingCol === c.name}
            editDraft={editDraft}
            onSelect={() => onSelectCell(rowKey, c.name)}
            onBeginEdit={(text) => onBeginEdit(rowKey, c.name, text)}
            onDraftChange={onDraftChange}
            onCommit={(text) => onCommitCell(rowKey, c.name, text)}
            onEndEdit={onEndEdit}
            onContextMenu={(e) => onCellContextMenu(rowKey, c.name, e)}
          />
        );
      })}
    </tr>
  );
}

export const GridRow = memo(GridRowImpl);

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
  onSelectCell: (col: string) => void;
  onBeginEdit: (col: string, initialText: string) => void;
  onDraftChange: (text: string) => void;
  onCommitCell: (col: string, text: string) => void;
  onEndEdit: () => void;
  onCellContextMenu: (col: string, e: MouseEvent) => void;
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
            onSelect={() => onSelectCell(c.name)}
            onBeginEdit={(text) => onBeginEdit(c.name, text)}
            onDraftChange={onDraftChange}
            onCommit={(text) => onCommitCell(c.name, text)}
            onEndEdit={onEndEdit}
            onContextMenu={(e) => onCellContextMenu(c.name, e)}
          />
        );
      })}
    </tr>
  );
}

export const GridRow = memo(GridRowImpl);

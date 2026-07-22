// Memoized so a keystroke in the one cell being edited doesn't re-render the
// other 199 rows: props are plain primitives per-cell (not whole
// selected/editing objects), so React.memo's shallow comparison bails out
// for every cell except the one actually changing.

import { memo, useLayoutEffect, useRef, type MouseEvent } from "react";

const NUMERIC_TYPE = /int|numeric|real|double|decimal|money|serial/i;

interface GridCellProps {
  col: Column;
  origValue: Cell;
  displayValue: Cell;
  isDirty: boolean;
  isEditable: boolean;
  isSelected: boolean;
  isEditing: boolean;
  editDraft: string;
  onSelect: () => void;
  onBeginEdit: (initialText: string) => void;
  onDraftChange: (text: string) => void;
  onCommit: (text: string) => void;
  onEndEdit: () => void;
  onContextMenu: (e: MouseEvent) => void;
}

function GridCellImpl({
  col,
  origValue,
  displayValue,
  isDirty,
  isEditable,
  isSelected,
  isEditing,
  editDraft,
  onSelect,
  onBeginEdit,
  onDraftChange,
  onCommit,
  onEndEdit,
  onContextMenu,
}: GridCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus + select-all exactly once when edit mode begins, not on every
  // keystroke. An inline ref callback (`ref={(el) => ...}`) is a new function
  // every render, which makes React detach/reattach it — and therefore
  // re-run focus()+select() — on every render, not just the first; that
  // re-selected the whole draft after each typed character, so the next
  // keystroke replaced everything instead of appending.
  useLayoutEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const isNum = NUMERIC_TYPE.test(col.dataType);
  const cls = [
    isNum ? "num" : "",
    col.isPk ? "pkcell" : isEditable ? "editable" : "",
    isDirty ? "dirty" : "",
    isSelected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <td className={cls} onContextMenu={onContextMenu}>
      {isEditing ? (
        <input
          className="cell cell-input"
          spellCheck={false}
          value={editDraft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCommit(origValue === null ? "" : String(origValue));
              onEndEdit();
            }
          }}
          onBlur={() => {
            onCommit(editDraft);
            onEndEdit();
          }}
          ref={inputRef}
        />
      ) : (
        <span
          className="cell"
          onMouseDown={isEditable ? onSelect : undefined}
          onDoubleClick={
            isEditable
              ? () => onBeginEdit(displayValue === null ? "" : String(displayValue))
              : undefined
          }
        >
          {displayValue === null ? <span className="nullv">NULL</span> : String(displayValue)}
        </span>
      )}
    </td>
  );
}

export const GridCell = memo(GridCellImpl);

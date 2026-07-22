// Grid cell selection/edit-in-progress state. Lives one level above
// individual cells (in GridTable) because "at most one cell selected or
// being edited" is a table-wide invariant, not a per-cell one.
//
// Unlike the old contenteditable-based renderer, non-editing cells here are
// plain (non-focusable) <span>s — only the single actively-edited cell is a
// real <input>. That sidesteps the old "blur whichever cell was mid-edit
// before selecting a new one" problem entirely: clicking a plain span is not
// a focusable target, so the browser's ordinary focus-shift naturally blurs
// whatever input was focused, which commits it via onBlur. No manual
// orchestration needed.
//
// Escape reverts by committing the *original* value directly (bypassing
// onBlur, whose closure would otherwise read a stale draft from before the
// revert) rather than toggling some "revert vs commit" mode — matching the
// old renderer's actual mechanism (revertCell rewrote the cell's content to
// the original value, then blur's unconditional commit became a no-op).

import { useState } from "react";

export interface CellPos {
  rowKey: string;
  col: string;
}

export function useCellEditing() {
  const [selected, setSelected] = useState<CellPos | null>(null);
  const [editing, setEditing] = useState<(CellPos & { draft: string }) | null>(null);

  function select(rowKey: string, col: string): void {
    setSelected({ rowKey, col });
  }

  function beginEdit(rowKey: string, col: string, initialText: string): void {
    setSelected({ rowKey, col });
    setEditing({ rowKey, col, draft: initialText });
  }

  function updateDraft(text: string): void {
    setEditing((e) => (e ? { ...e, draft: text } : e));
  }

  function endEdit(): void {
    setEditing(null);
  }

  return { selected, editing, select, beginEdit, updateDraft, endEdit };
}

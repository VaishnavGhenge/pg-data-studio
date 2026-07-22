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

import { useCallback, useState } from "react";

export interface CellPos {
  rowKey: string;
  col: string;
}

export function useCellEditing() {
  const [selected, setSelected] = useState<CellPos | null>(null);
  const [editing, setEditing] = useState<(CellPos & { draft: string }) | null>(null);

  // Stable across renders (setState setters never change identity) so
  // GridTable can hand these straight to every GridRow without creating a
  // fresh closure per row per render — otherwise GridRow's memo would never
  // bail out, and every row would re-render on every keystroke.
  const select = useCallback((rowKey: string, col: string): void => {
    setSelected({ rowKey, col });
  }, []);

  const beginEdit = useCallback((rowKey: string, col: string, initialText: string): void => {
    setSelected({ rowKey, col });
    setEditing({ rowKey, col, draft: initialText });
  }, []);

  const updateDraft = useCallback((text: string): void => {
    setEditing((e) => (e ? { ...e, draft: text } : e));
  }, []);

  const endEdit = useCallback((): void => {
    setEditing(null);
  }, []);

  return { selected, editing, select, beginEdit, updateDraft, endEdit };
}

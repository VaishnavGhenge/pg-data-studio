// Pending-edit bookkeeping — verbatim port of the commit/equality math from
// the pre-React renderer (app.ts). All three edit entry points (inline cell
// edit, the full-value editor modal, and "Set NULL") route through
// `isValueChanged` so the "is this actually a change?" rule can't drift
// between them.

export interface DirtyEntry {
  rowKey: string;
  pkVals: Record<string, Cell>;
  col: string;
  old: Cell;
  val: Cell;
}

// Keyed by rowKey+col with no separator — matches the original `rk + "" + col`
// (a no-op concatenation, i.e. just `rk + col`). Kept exactly as-is: purely an
// internal map key, never displayed, and changing the format would be an
// unforced behavior change during a rewrite meant to preserve it.
export function dirtyKey(rowKey: string, col: string): string {
  return rowKey + col;
}

// Inline editing derives a Cell from the raw text a user typed: empty (after
// trimming) means NULL; otherwise the *untrimmed* text is kept verbatim, so
// "  " -> NULL but " abc " saves with its surrounding spaces intact.
export function computeCommitValue(text: string): Cell {
  return text.trim() === "" ? null : text;
}

// Whether `val` actually differs from `orig` — false for both "identical
// value" and "stringifies the same as the original" (e.g. editing "" back to
// null-equivalent). Used to decide whether to record/clear a dirty entry.
export function isValueChanged(orig: Cell, val: Cell): boolean {
  const origStr = orig === null ? "" : String(orig);
  if (val === orig) return false;
  if (val !== null && String(val) === origStr) return false;
  return true;
}

// Batches the dirty map into one RowChange per row for `applyChanges`.
export function groupDirtyByRow(dirty: Record<string, DirtyEntry>): RowChange[] {
  const groups: Record<string, RowChange> = {};
  Object.values(dirty).forEach((d) => {
    const g = (groups[d.rowKey] = groups[d.rowKey] || { pk: d.pkVals, set: {} });
    g.set[d.col] = d.val;
  });
  return Object.values(groups);
}

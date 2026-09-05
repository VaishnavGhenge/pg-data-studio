// Pending edits are shared by the inline editor, inspector and context menu.
// NULL, empty strings and whitespace remain distinct values.

export interface DirtyEntry {
  rowKey: string;
  pkVals: Record<string, Cell>;
  col: string;
  old: Cell;
  val: Cell;
}

// Keep row and column boundaries explicit.
export function dirtyKey(rowKey: string, col: string): string {
  return JSON.stringify([rowKey, col]);
}

// Compare exact transport values; NULL is not an empty string.
export function isValueChanged(orig: Cell, val: Cell): boolean {
  return orig !== val;
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

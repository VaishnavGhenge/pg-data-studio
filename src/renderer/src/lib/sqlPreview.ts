import { groupDirtyByRow, type DirtyEntry } from "./dirty";
import { updateSql } from "../../../shared/updateSql";

function literal(v: Cell): string {
  if (v === null || v === undefined) return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// Human-readable preview of the UPDATE statements a Save would run, shown in
// the save-confirmation modal. Purely cosmetic — the actual write still goes
// through applyChanges' parameterized SQL in the main process; this never
// touches the database itself.
export function buildUpdatePreview(
  dirty: Record<string, DirtyEntry>,
  pk: string[],
  schema: string,
  table: string,
): string[] {
  return groupDirtyByRow(dirty).map((change) =>
    updateSql(schema, table, Object.keys(change.set), pk, change, literal),
  );
}

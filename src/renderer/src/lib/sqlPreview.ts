import { groupDirtyByRow, type DirtyEntry } from "./dirty";

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

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
  const ref = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  return groupDirtyByRow(dirty).map((change) => {
    const sets = Object.entries(change.set)
      .map(([col, val]) => `${quoteIdent(col)} = ${literal(val)}`)
      .join(", ");
    const where = pk.map((c) => `${quoteIdent(c)} = ${literal(change.pk[c])}`).join(" AND ");
    return `UPDATE ${ref} SET ${sets} WHERE ${where};`;
  });
}

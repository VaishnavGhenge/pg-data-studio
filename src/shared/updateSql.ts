export function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

// PostgreSQL's format %s uses the same type output function as the text wire
// protocol. This also works for types without equality operators, such as json.
function originalMatches(column: string, expected: string): string {
  return `(CASE WHEN ${column} IS DISTINCT FROM NULL THEN pg_catalog.format('%s', ${column}) END) COLLATE pg_catalog."C" IS NOT DISTINCT FROM ${expected}`;
}

export function updateSql(
  schema: string,
  table: string,
  columns: string[],
  pk: string[],
  change: RowChange,
  renderValue: (value: Cell) => string,
): string {
  const ref = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const set = columns.map((c) => `${quoteIdent(c)} = ${renderValue(change.set[c])}`);
  const keys = pk.map((c) => `${quoteIdent(c)} = ${renderValue(change.pk[c])}`);
  const original = columns.map((c) =>
    originalMatches(quoteIdent(c), renderValue(change.original[c])),
  );
  return `UPDATE ${ref} SET ${set.join(", ")} WHERE ${[...keys, ...original].join(" AND ")};`;
}

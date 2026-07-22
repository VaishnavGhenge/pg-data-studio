// A row's stable identity across sorts/refetches, derived from its primary
// key values — verbatim port of the logic in the pre-React renderer.

export function rowKeyOf(pk: string[], row: Record<string, Cell>): string {
  return pk.map((c) => String(row[c])).join("");
}

export function pkValsOf(pk: string[], row: Record<string, Cell>): Record<string, Cell> {
  const o: Record<string, Cell> = {};
  pk.forEach((c) => (o[c] = row[c]));
  return o;
}

// Encode tuple boundaries, including column names, without ambiguous concatenation.

export function rowKeyOf(pk: string[], row: Record<string, Cell>): string {
  return JSON.stringify(pk.map((c) => [c, row[c]]));
}

// Keyless rows are read-only; identify each occurrence in the unfiltered page.
export function displayRowKey(pk: string[], row: Record<string, Cell>, index: number): string {
  return pk.length ? rowKeyOf(pk, row) : `row:${index}`;
}

export function pkValsOf(pk: string[], row: Record<string, Cell>): Record<string, Cell> {
  const o: Record<string, Cell> = {};
  pk.forEach((c) => (o[c] = row[c]));
  return o;
}

export interface GridPoint {
  row: number;
  col: number;
}
export function selectionBounds(a: GridPoint, b: GridPoint) {
  return {
    top: Math.min(a.row, b.row),
    bottom: Math.max(a.row, b.row),
    left: Math.min(a.col, b.col),
    right: Math.max(a.col, b.col),
  };
}
export function toTsv(rows: Cell[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = value ?? "";
          return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join("\t"),
    )
    .join("\n");
}
export function describeValue(value: Cell): string {
  if (value === null) return "NULL";
  if (value === "") return "(empty string)";
  if (value.trim() === "") return `(whitespace: ${value.length} characters)`;
  return value;
}

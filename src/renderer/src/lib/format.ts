// Row-count formatter for the navigator tree (e.g. 2.4k, 1.2M).
export function fmtCount(n: number): string {
  if (n < 0) return "?";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

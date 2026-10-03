// Keep logical grid coordinates independent of the cells mounted in the DOM.
export function rowWindow(
  count: number,
  scrollTop: number,
  height: number,
  rowHeight: number,
  headerHeight: number,
  overscan = 8,
): { start: number; end: number } {
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const last = Math.ceil((Math.max(0, scrollTop) + Math.max(0, height - headerHeight)) / rowHeight);
  return {
    start: Math.max(0, Math.min(count, first - overscan)),
    end: Math.min(count, last + overscan),
  };
}

export function columnWindow(
  offsets: number[],
  pinnedCount: number,
  scrollLeft: number,
  width: number,
  overscan = 2,
): { start: number; end: number } {
  const count = offsets.length - 1;
  let first = pinnedCount;
  const left = Math.max(0, scrollLeft) + offsets[pinnedCount];
  const right = Math.max(0, scrollLeft) + width - 40;
  while (first < count && offsets[first + 1] <= left) first++;
  let last = first;
  while (last < count && offsets[last] < right) last++;
  return { start: Math.max(pinnedCount, first - overscan), end: Math.min(count, last + overscan) };
}

export type ColumnSlot =
  | { kind: "column"; index: number; width: number }
  | { kind: "space"; index: number; width: number };

// Spacer columns retain the exact scroll width. Keep an active editor or filter
// anchor mounted even when it moves outside the normal visible window.
export function columnSlots(
  offsets: number[],
  pinnedCount: number,
  range: { start: number; end: number },
  keep: number[] = [],
): ColumnSlot[] {
  const count = offsets.length - 1;
  const indices = new Set<number>(keep.filter((i) => i >= 0 && i < count));
  for (let i = 0; i < pinnedCount; i++) indices.add(i);
  for (let i = range.start; i < range.end; i++) indices.add(i);
  const slots: ColumnSlot[] = [];
  let next = 0;
  for (const index of [...indices].sort((a, b) => a - b)) {
    if (index > next)
      slots.push({ kind: "space", index: next, width: offsets[index] - offsets[next] });
    slots.push({ kind: "column", index, width: offsets[index + 1] - offsets[index] });
    next = index + 1;
  }
  if (next < count)
    slots.push({ kind: "space", index: next, width: offsets[count] - offsets[next] });
  return slots;
}

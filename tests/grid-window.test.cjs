const test = require("node:test");
const assert = require("node:assert/strict");
const { loader } = require("./load.cjs");
const { rowWindow, columnWindow, columnSlots } = loader()("src/renderer/src/lib/gridWindow.ts");

test("row windows cover the viewport and clamp the first and last pages", () => {
  assert.deepEqual(rowWindow(1000, 0, 600, 28, 40, 0), { start: 0, end: 20 });
  assert.deepEqual(rowWindow(1000, 14000, 600, 28, 40, 2), { start: 498, end: 522 });
  assert.deepEqual(rowWindow(1000, 27900, 600, 28, 40, 8), { start: 988, end: 1000 });
  assert.deepEqual(rowWindow(0, 0, 600, 28, 40), { start: 0, end: 0 });
  assert.deepEqual(rowWindow(30, 390, 430, 39, 40, 0), { start: 10, end: 20 });
});

test("column windows account for the gutter, pinned widths and variable columns", () => {
  const offsets = [0, 100, 300, 350, 500, 800];
  assert.deepEqual(columnWindow(offsets, 0, 0, 340, 0), { start: 0, end: 2 });
  assert.deepEqual(columnWindow(offsets, 1, 200, 340, 0), { start: 2, end: 4 });
  assert.deepEqual(columnWindow(offsets, 2, 50, 340, 0), { start: 3, end: 3 });
  assert.deepEqual(columnWindow(offsets, 5, 0, 340), { start: 5, end: 5 });
  assert.deepEqual(columnWindow([0], 0, 0, 100), { start: 0, end: 0 });
});

test("column spacers preserve total width and keep pinned cells and offscreen editors", () => {
  const offsets = [0, 100, 200, 300, 400, 500, 600, 700];
  const slots = columnSlots(offsets, 1, { start: 3, end: 5 }, [6, -1, 10]);
  assert.deepEqual(slots, [
    { kind: "column", index: 0, width: 100 },
    { kind: "space", index: 1, width: 200 },
    { kind: "column", index: 3, width: 100 },
    { kind: "column", index: 4, width: 100 },
    { kind: "space", index: 5, width: 100 },
    { kind: "column", index: 6, width: 100 },
  ]);
  assert.equal(
    slots.reduce((sum, slot) => sum + slot.width, 0),
    700,
  );
  assert.deepEqual(columnSlots([0], 0, { start: 0, end: 0 }), []);
});

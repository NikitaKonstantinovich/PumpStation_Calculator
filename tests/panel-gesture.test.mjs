import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { panelGeometryAt } = await loadTs(new URL("../app/panel-gesture.ts", import.meta.url));
const gesture = (patch = {}) => ({ mode: "drag", origin: { x: 100, y: 80, w: 400, h: 300 }, pointerX: 200, pointerY: 150,
  scale: 1, canvasWidth: 1200, canvasHeight: 800, minWidth: 280, minHeight: 220, ...patch });

test("drag follows pointer distance at each workspace zoom without cumulative drift", () => {
  for (const scale of [0.5, 1, 1.5]) {
    const start = gesture({ scale });
    assert.deepEqual(panelGeometryAt(start, 200 + 60 * scale, 150 + 40 * scale), { x: 160, y: 120, w: 400, h: 300 });
    assert.deepEqual(panelGeometryAt(start, 200, 150), start.origin);
  }
});

test("saved windows outside a smaller viewport do not jump on the first movement", () => {
  const start = gesture({ origin: { x: 1114, y: 426, w: 540, h: 650 }, canvasWidth: 1280, canvasHeight: 480 });
  assert.deepEqual(panelGeometryAt(start, 200, 150), start.origin);
  assert.deepEqual(panelGeometryAt(start, 195, 145), { x: 1109, y: 421, w: 540, h: 650 });
  assert.deepEqual(panelGeometryAt(start, -2000, -2000), { x: 0, y: 0, w: 540, h: 650 });
});

test("snapping is only applied at release and uses screen pixels at zoom", () => {
  const start = gesture({ origin: { x: 100, y: 100, w: 400, h: 300 }, scale: 0.5 });
  assert.equal(panelGeometryAt(start, 170, 150).x, 40);
  assert.equal(panelGeometryAt(start, 170, 150, true).x, 0);
  const outside = gesture({ origin: { x: 1100, y: 80, w: 500, h: 300 } });
  assert.equal(panelGeometryAt(outside, 190, 150, true).x, 1090, "do not snap a distant saved window to the visible edge");
});

test("resizing respects actual tool minimums and preserves oversized windows", () => {
  const start = gesture({ mode: "resize", origin: { x: 900, y: 400, w: 540, h: 650 }, canvasWidth: 1280, canvasHeight: 480, minWidth: 500, minHeight: 400 });
  assert.deepEqual(panelGeometryAt(start, 200, 150), start.origin);
  assert.deepEqual(panelGeometryAt(start, 190, 140), { x: 900, y: 400, w: 530, h: 640 });
  assert.deepEqual(panelGeometryAt(start, -2000, -2000), { x: 900, y: 400, w: 500, h: 400 });
  const fitting = gesture({ mode: "resize", scale: 1.5 });
  assert.deepEqual(panelGeometryAt(fitting, 260, 180), { x: 100, y: 80, w: 440, h: 320 });
});

test("all eight resize handles follow the pointer at every zoom and anchor opposite edges", () => {
  const expected = {
    n: { x: 100, y: 100, w: 400, h: 280 },
    e: { x: 100, y: 80, w: 440, h: 300 },
    s: { x: 100, y: 80, w: 400, h: 320 },
    w: { x: 140, y: 80, w: 360, h: 300 },
    ne: { x: 100, y: 100, w: 440, h: 280 },
    se: { x: 100, y: 80, w: 440, h: 320 },
    sw: { x: 140, y: 80, w: 360, h: 320 },
    nw: { x: 140, y: 100, w: 360, h: 280 },
  };
  for (const scale of [0.5, 1, 1.5]) for (const [resizeDirection, geometry] of Object.entries(expected)) {
    const start = gesture({ mode: "resize", resizeDirection, scale });
    assert.deepEqual(panelGeometryAt(start, 200 + 40 * scale, 150 + 20 * scale), geometry, `${resizeDirection} at ${scale}`);
    assert.deepEqual(panelGeometryAt(start, 200, 150), start.origin, "returning to the start restores original geometry");
  }
});

test("top and left resizing stops at minimum dimensions and the canvas boundary without drifting", () => {
  const start = gesture({ mode: "resize", resizeDirection: "nw" });
  assert.deepEqual(panelGeometryAt(start, 2000, 2000), { x: 220, y: 160, w: 280, h: 220 });
  assert.deepEqual(panelGeometryAt(start, -2000, -2000), { x: 0, y: 0, w: 500, h: 380 });
  const outside = gesture({ mode: "resize", resizeDirection: "nw", origin: { x: 1114, y: 426, w: 540, h: 650 }, canvasHeight: 480 });
  assert.deepEqual(panelGeometryAt(outside, 200, 150), outside.origin);
  assert.deepEqual(panelGeometryAt(outside, 190, 140), { x: 1104, y: 416, w: 550, h: 660 });
  const southeast = gesture({ mode: "resize", resizeDirection: "se" });
  assert.deepEqual(panelGeometryAt(southeast, 2000, 2000), { x: 100, y: 80, w: 1100, h: 720 });
});

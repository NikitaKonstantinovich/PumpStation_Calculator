import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { interpolateCurve, pumpCurvePath, operatingPoint } = await loadTs(new URL("../app/pump-catalog.ts", import.meta.url));
const close = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("PCHIP on uneven intervals matches independently calculated Hermite values", () => {
  const points = [[0, 10], [1, 9], [3, 5], [6, 4]];
  // Fritsch–Butland tangents: -2/3, -9/7, -3/5, 0.
  close(interpolateCurve(points, 0.5), 9.577380952380953);
  close(interpolateCurve(points, 2), 6.828571428571429);
  close(interpolateCurve(points, 4.5), 4.275);
  for (const [q, h] of points) assert.equal(interpolateCurve(points, q), h);
  assert.equal(interpolateCurve(points, -0.001), null);
  assert.equal(interpolateCurve(points, 6.001), null);
});

test("two points stay linear; plateaus, extrema and steep endpoints have no overshoot", () => {
  close(interpolateCurve([[2, 20], [6, 12]], 3), 18);
  const fixtures = [
    [[0, 5], [1, 4], [2, 20]], // Endpoint slope must be limited to 3 * secant.
    [[0, 20], [1, 4], [2, 5]],
    [[0, 10], [0.1, 10], [2, 3], [5, 3], [9, 8]],
    [[0, 1], [1, 10], [3, 0], [4, 8]],
    [[0, 5], [1, 5], [3, 5]],
  ];
  close(interpolateCurve(fixtures[0], 0.5), 4.125);
  close(interpolateCurve(fixtures[1], 1.5), 4.125);
  for (const points of fixtures) {
    const original = structuredClone(points);
    for (let i = 1; i < points.length; i++) {
      const [q0, h0] = points[i - 1], [q1, h1] = points[i];
      let previous = h0;
      for (let j = 1; j <= 100; j++) {
        const h = interpolateCurve(points, q0 + (q1 - q0) * j / 100);
        assert.ok(h >= Math.min(h0, h1) - 1e-10 && h <= Math.max(h0, h1) + 1e-10);
        assert.ok((h - previous) * Math.sign(h1 - h0) >= -1e-10);
        previous = h;
      }
    }
    for (const [q, h] of points.slice(1, -1)) {
      const step = 1e-7;
      close((h - interpolateCurve(points, q - step)) / step,
        (interpolateCurve(points, q + step) - h) / step, 1e-4);
    }
    assert.deepEqual(points, original);
  }
});

test("invalid or insufficient input never produces a curve or operating point", () => {
  for (const curve of [[], [[1, 2]], [[0, 1], [0, 2]], [[2, 1], [1, 2]], [[0, 1], [2, NaN]]]) {
    assert.equal(interpolateCurve(curve, 1), null);
    assert.equal(pumpCurvePath({curve}, 1, 10, 10), "");
    assert.equal(operatingPoint({curve}, 1, {flowRate: 1, head: 1, staticHead: 0}), null);
  }
  assert.equal(interpolateCurve([[0, 1], [2, 0]], NaN), null);
  assert.equal(pumpCurvePath({curve: [[0, 1], [2, 0]]}, Infinity, 10, 10), "");
});

test("SVG Bézier coordinates match hydraulic interpolation for one and multiple pumps", () => {
  const curve = [[0, 10], [1, 9], [3, 5], [6, 4]];
  const maxQ = 30, maxH = 12;
  const bezier = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
  for (const count of [1, 2, 4]) {
    const commands = pumpCurvePath({curve}, count, maxQ, maxH).match(/[MC][^MC]+/g);
    assert.equal(commands.length, curve.length);
    let [x0, y0] = commands[0].slice(1).trim().split(/\s+/).map(Number);
    for (let i = 1; i < commands.length; i++) {
      const [x1, y1, x2, y2, x3, y3] = commands[i].slice(1).trim().split(/\s+/).map(Number);
      for (const t of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
        const flow = curve[i - 1][0] + (curve[i][0] - curve[i - 1][0]) * t;
        close(bezier(x0, x1, x2, x3, t), 45 + flow * count / maxQ * 435);
        close(bezier(y0, y1, y2, y3, t), 210 - interpolateCurve(curve, flow) / maxH * 190);
      }
      [x0, y0] = [x3, y3];
    }
  }
});

test("operating point finds cubic tangencies and the first of two internal crossings", () => {
  const pump = {curve: [[0, 1], [2, 5], [3, 5]]};
  // On [0, 2]: H(Q) = 1 + 10Q/3 - Q²/3 - Q³/6.
  // System 11/4 + 13Q²/12 touches it at Q=1.
  for (const count of [1, 2, 4]) {
    const tangent = operatingPoint(pump, count, {flowRate: count, head: 23 / 6, staticHead: 11 / 4});
    assert.ok(tangent);
    close(tangent.flow, count);
    close(tangent.head, 23 / 6);
    const crossing = operatingPoint(pump, count, {flowRate: count, head: 43 / 12, staticHead: 2.5});
    assert.ok(crossing && crossing.flow > 0 && crossing.flow < count);
    close(crossing.head, interpolateCurve(pump.curve, crossing.flow / count));
    close(crossing.head, 2.5 + 13 / 12 * (crossing.flow / count) ** 2);
    assert.equal(operatingPoint(pump, count, {flowRate: count, head: 10, staticHead: 9}), null);
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { buildPumpSelection, evaluatePumpCandidates, comparePumpCandidates, preferredOperatingPoint, OPERATING_POINT_PERCENT_EPSILON, headReserveClass } =
  await loadTs(new URL("../app/pump-selection.ts", import.meta.url));
const { operatingPoint, selectionHeadAtFlow, usablePump } = await loadTs(new URL("../app/pump-catalog.ts", import.meta.url));
const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const { collectProjectIssues } = await loadTs(new URL("../app/diagnostics.ts", import.meta.url));
const settings = { usdRate: 85, cnyRate: 13, manufacturerDiscounts: { cnp: 45, aquastrong: 55 } };
const input = { flowRate: 100, head: 50, staticHead: 10, workingPumpCount: 1, reservePumpCount: 1, medium: "water" };
const pump = (id, overrides = {}) => ({
  id, manufacturer: "Test", series: "Series", group: "Test", model: id, type: "end_suction", medium: "water",
  curve: [[0, 60], [100, 50], [200, 40]], price: 100, priceCurrency: "RUB", power: 3,
  ...overrides,
});
const select = (catalogue, mode = "distance", overrides = {}, filters = {}) => buildPumpSelection(catalogue, { ...input, ...overrides }, settings, filters, mode);
const ids = result => result.candidates.map(candidate => candidate.pump.id);
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test("exact match has zero distance and records station flow and head reserve separately", () => {
  const result = select([pump("exact")]);
  const candidate = result.candidates[0];
  assert.deepEqual(candidate.point, { flow: 100, head: 50, deltaQPercent: 0, deltaHPercent: 0, pointDistance: 0 });
  assert.equal(candidate.headReservePercent, 0);
  assert.equal(candidate.headAtRequestedFlow, 50);
  assert.equal(candidate.preferredByOperatingPoint, true);
  assert.equal(result.selectedPumpId, "exact");
});

test("actual point distance reverses a head-reserve-only ranking on different curve slopes", () => {
  const result = select([
    pump("A", { curve: [[0, 61], [100, 51], [200, 41]] }),
    pump("B", { curve: [[0, 251.5], [100, 51.5], [125, 1.5]] }),
  ]);
  assert.deepEqual(ids(result), ["B", "A"]);
  const [b, a] = result.candidates;
  assert.equal(a.headReservePercent, 2);
  assert.equal(b.headReservePercent, 3);
  close(a.point.pointDistance, 2.094488459232892);
  close(b.point.pointDistance, 1.0119560054613173);
});

test("price priority requires both signed deviations to meet inclusive bounds before rounding", () => {
  for (const values of [[-2, 0], [15, 0], [0, -2], [0, 15], [-2, 15], [10, 15]]) {
    assert.equal(preferredOperatingPoint(...values), true, String(values));
  }
  assert.ok(Math.hypot(10, 15) > 15);
  for (const values of [[-2.000001, 0], [15.000001, 0], [0, -2.000001], [0, 15.000001], [NaN, 0], [0, Infinity]]) {
    assert.equal(preferredOperatingPoint(...values), false, String(values));
  }
  const epsilon = OPERATING_POINT_PERCENT_EPSILON;
  assert.equal(preferredOperatingPoint(-2 - epsilon / 2, 15 + epsilon / 2), true);
  assert.equal(preferredOperatingPoint(-2 - epsilon * 2, 0), false);
  assert.equal(preferredOperatingPoint(0, 15 + epsilon * 2), false);
});

test("price sorting prioritizes the operating-point group, then price before distance", () => {
  const catalogue = [
    pump("cheap-outside", { price: 1, curve: [[0, 100], [100, 90], [200, 80]] }),
    pump("exact", { price: 200 }),
    pump("near-cheaper", { price: 100, curve: [[0, 62], [100, 52], [200, 42]] }),
  ];
  const priced = select(catalogue, "price");
  assert.deepEqual(ids(priced), ["near-cheaper", "exact", "cheap-outside"]);
  assert.deepEqual(priced.candidates.map(p => p.preferredByOperatingPoint), [true, true, false]);
  assert.equal(priced.selectedPumpId, "near-cheaper");
  assert.deepEqual(ids(select(catalogue)), ["exact", "near-cheaper", "cheap-outside"]);
});

test("unknown prices stay after known prices within their own priority group, including zero", () => {
  const catalogue = [pump("b-unknown", { price: null }), pump("a-unknown", { price: NaN }),
    pump("free", { price: 0 }), pump("known", { price: 10 }), pump("c-unknown", { price: Infinity }),
    pump("outside", { price: 1, curve: [[0, 100], [100, 90], [200, 80]] })];
  for (const mode of ["distance", "price"]) {
    const result = select(catalogue, mode);
    assert.deepEqual(ids(result), ["free", "known", "a-unknown", "b-unknown", "c-unknown", "outside"]);
    for (const a of result.candidates) for (const b of result.candidates) {
      const forward = comparePumpCandidates(a, b, mode), backward = comparePumpCandidates(b, a, mode);
      assert.ok(Number.isFinite(forward));
      assert.equal(Math.sign(forward) + Math.sign(backward), 0);
    }
  }
});

test("ties use distance then stable ID in price mode and price then ID in distance mode", () => {
  const catalogue = [pump("z", { price: 100 }), pump("a", { price: 100 }),
    pump("near", { price: 100, curve: [[0, 62], [100, 52], [200, 42]] }), pump("free", { price: 0 })];
  for (const mode of ["distance", "price"]) {
    assert.deepEqual(ids(select(catalogue, mode)), ["free", "a", "z", "near"]);
    assert.deepEqual(ids(select([...catalogue].reverse(), mode)), ["free", "a", "z", "near"]);
  }
});

test("ruble purchase prices use rates and discounts and preserve net snapshots", () => {
  const result = select([
    pump("usd", { manufacturer: "CNP", price: 100, priceCurrency: "USD" }),
    pump("cny", { manufacturer: "Aquastrong", price: 1000, priceCurrency: "CNY" }),
    pump("rub", { manufacturer: "CNP", price: 10000 }),
    pump("net", { manufacturer: "CNP", price: 300, priceKind: "net" }),
  ], "price");
  assert.deepEqual(ids(result), ["net", "usd", "rub", "cny"]);
  assert.deepEqual(result.candidates.map(candidate => candidate.purchasePriceRub), [300, 4675, 5500, 5850]);
  const invalidRate = buildPumpSelection([pump("usd", { priceCurrency: "USD" })], input, { ...settings, usdRate: Infinity });
  assert.equal(invalidRate.candidates[0].purchasePriceRub, null);
});

test("missing intersections and actual flows outside selectionFlowRange stay visible last and are not auto-selected", () => {
  const noCrossing = pump("no-crossing", { curve: [[80, 200], [120, 180]], price: 0 });
  const outOfRange = pump("out-of-range", { curve: [[0, 110], [100, 100], [200, 90]], selectionFlowRange: [90, 110], price: 0 });
  for (const mode of ["distance", "price"]) {
    const result = select([noCrossing, outOfRange, pump("available")], mode);
    assert.deepEqual(ids(result), ["available", "no-crossing", "out-of-range"]);
    assert.equal(result.selectedPumpId, "available");
    for (const candidate of result.candidates.slice(1)) {
      assert.equal(candidate.point, null);
      assert.equal(candidate.preferredByOperatingPoint, false);
    }
    assert.match(result.candidates[1].pointIssue, /Пересечение/);
    assert.match(result.candidates[2].pointIssue, /вне рабочего диапазона/);
    const unavailableOnly = select([noCrossing, outOfRange], mode);
    assert.equal(unavailableOnly.selectedPumpId, undefined);
    assert.equal(unavailableOnly.candidates.length, 2);
  }
});

test("non-finite hydraulic results cannot produce a distance or price priority", () => {
  const result = select([pump("underflow", { curve: [[0, 60], [1e-200, 50], [2e-200, 40]] })], "price", { flowRate: 1e-200 });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].point, null);
  assert.match(result.candidates[0].pointIssue, /числовую оценку/);
  assert.equal(result.selectedPumpId, undefined);
});

test("selection preserves the existing first intersection even when a later root would be in range", () => {
  const overrides = { flowRate: 1, head: 43 / 12, staticHead: 2.5 };
  const model = pump("multiple-roots", { curve: [[0, 1], [2, 5], [3, 5]] });
  const expected = operatingPoint(model, 1, { ...input, ...overrides });
  assert.ok(expected.flow < 1);
  const candidate = select([model], "distance", overrides).candidates[0];
  close(candidate.point.flow, expected.flow);
  const limited = select([{ ...model, selectionFlowRange: [expected.flow + 0.01, 3] }], "price", overrides).candidates[0];
  assert.equal(limited.point, null);
  assert.match(limited.pointIssue, /вне рабочего диапазона/);
});

test("requested flow range, -5% head reserve, eligibility and all catalogue filters are preserved", () => {
  const catalogue = [pump("valid"), pump("boundary", { curve: [[0, 57.5], [100, 47.5], [200, 37.5]] }),
    pump("too-low", { curve: [[0, 57.499], [100, 47.499], [200, 37.499]] }),
    pump("inactive", { active: false }), pump("unselectable", { selectable: false }),
    pump("sewage", { medium: "wastewater" }), pump("invalid", { curve: [[0, 60], [0, 50]] }),
    pump("requested-outside", { selectionFlowRange: [110, 200] }),
    pump("source-outside", { curve: [[0, 60], [90, 51]] }),
    pump("other", { manufacturer: "Other", series: "Other", type: "inline" })];
  assert.deepEqual(new Set(ids(select(catalogue))), new Set(["valid", "boundary", "other"]));
  assert.equal(select(catalogue).candidates.find(p => p.pump.id === "boundary").headReservePercent, -5);
  assert.deepEqual(ids(select(catalogue, "price", {}, { manufacturer: "Other", series: "Other", type: "inline" })), ["other"]);
  assert.deepEqual(ids(select(catalogue, "price", { medium: "wastewater" })), ["sewage"]);
  for (const filters of [{ manufacturer: "missing" }, { series: "missing" }, { type: "submersible" }]) {
    assert.deepEqual(select(catalogue, "price", {}, filters).candidates, []);
  }
});

test("candidate set matches the old eligibility rule on the real catalogue for both media", async () => {
  const catalogue = JSON.parse(await readFile(new URL("../public/pumps.json", import.meta.url), "utf8"));
  for (const medium of ["water", "wastewater"]) {
    const request = { ...input, medium };
    const expected = catalogue.filter(p => {
      if (!usablePump(p, medium)) return false;
      const head = selectionHeadAtFlow(p, request.flowRate / request.workingPumpCount);
      const reserve = head === null ? -Infinity : (head - request.head) / request.head * 100;
      return Number.isFinite(reserve) && reserve >= -5;
    }).map(p => p.id).sort();
    assert.deepEqual(evaluatePumpCandidates(catalogue, request, settings).map(p => p.pump.id).sort(), expected);
  }
});

test("parallel pumps use station flow and reserve pump count does not change hydraulic ranking", () => {
  const catalogue = [pump("A", { curve: [[0, 61], [100, 51], [200, 41]] }),
    pump("B", { curve: [[0, 251.5], [100, 51.5], [125, 1.5]] })];
  const reference = select(catalogue);
  for (const count of [1, 2, 4, 6]) for (const reservePumpCount of [0, 1, 3]) {
    const result = select(catalogue, "distance", { workingPumpCount: count, reservePumpCount, flowRate: 100 * count });
    assert.deepEqual(ids(result), ["B", "A"]);
    for (let i = 0; i < result.candidates.length; i++) {
      const actual = result.candidates[i].point, expected = reference.candidates[i].point;
      close(actual.flow / count, expected.flow);
      close(actual.head, expected.head);
      close(actual.deltaQPercent, expected.deltaQPercent);
      close(actual.deltaHPercent, expected.deltaHPercent);
      close(actual.pointDistance, expected.pointDistance);
      close(actual.head, 10 + 40 * (actual.flow / (100 * count)) ** 2);
    }
  }
});

test("zero static head and a horizontal system curve retain valid point metrics", () => {
  const zeroStatic = select([pump("exact")], "distance", { staticHead: 0 }).candidates[0];
  assert.equal(zeroStatic.point.pointDistance, 0);
  const horizontal = select([pump("horizontal", { curve: [[0, 70], [100, 50], [200, 30]] })], "price",
    { flowRate: 90, staticHead: 50 }).candidates[0];
  close(horizontal.point.flow, 100);
  assert.equal(horizontal.point.head, 50);
  close(horizontal.point.deltaQPercent, 100 / 9);
  assert.equal(horizontal.point.deltaHPercent, 0);
  assert.equal(horizontal.preferredByOperatingPoint, true);
});

test("invalid input produces no candidates and leaves auto-selection empty", () => {
  for (const overrides of [{ flowRate: 0 }, { flowRate: Infinity }, { head: 0 }, { head: NaN }, { staticHead: -1 },
    { staticHead: 51 }, { workingPumpCount: 0 }, { workingPumpCount: 1.5 }, { workingPumpCount: 7 }]) {
    assert.deepEqual(select([pump("valid")], "price", overrides), { candidates: [], selectedPumpId: undefined });
  }
});

test("limit is applied after full ranking and neither the catalogue nor saved manual choice is mutated", () => {
  const catalogue = Array.from({ length: 120 }, (_, i) => pump(`pump-${i}`, { price: 120 - i }));
  const snapshot = structuredClone(catalogue);
  const request = { ...input, selectedPumpId: "pump-0" };
  const result = buildPumpSelection(catalogue, request, settings, {}, "price");
  assert.equal(result.candidates.length, 100);
  assert.equal(result.selectedPumpId, "pump-119");
  assert.equal(result.selectedPumpId, result.candidates[0].pump.id);
  assert.equal(result.candidates.at(-1).pump.id, "pump-20");
  assert.deepEqual(catalogue, snapshot);
  assert.equal(request.selectedPumpId, "pump-0");
});

test("both project circuits select independently for combined and fire/jockey stations and round-trip existing projects", () => {
  const catalogue = [pump("small", { curve: [[0, 60], [50, 50], [100, 40]], price: 100 }),
    pump("large", { curve: [[0, 110], [100, 100], [200, 90]], price: 1 })];
  for (const stationType of ["combined", "fire"]) {
    const project = createProject();
    Object.assign(project.entities["station-settings"], settings, { stationType, jockeyPump: true });
    Object.assign(project.entities["system-input"], input, { flowRate: 200, head: 100, workingPumpCount: 2, selectedPumpId: "manual-primary", calculated: true });
    Object.assign(project.entities["system-input-2"], input, { flowRate: 50, reservePumpCount: 0, selectedPumpId: "manual-secondary", calculated: true });
    const loaded = parseProjectConfig(JSON.parse(JSON.stringify(project)));
    const snapshot = structuredClone(loaded);
    for (const mode of ["distance", "price"]) {
      for (const [entityId, expected] of [["system-input", "large"], ["system-input-2", "small"]]) {
        const result = buildPumpSelection(catalogue, loaded.entities[entityId], loaded.entities["station-settings"], {}, mode);
        assert.equal(result.selectedPumpId, expected);
        assert.equal(result.selectedPumpId, result.candidates.find(candidate => candidate.point !== null).pump.id);
      }
    }
    assert.deepEqual(loaded, snapshot);
  }
});

test("price priority keeps excessive head reserve as a warning in both circuits", () => {
  const model = pump("steep", { curve: [[0, 260], [100, 60], [130, 0]] });
  const candidate = select([model], "price").candidates[0];
  assert.equal(candidate.preferredByOperatingPoint, true);
  assert.equal(candidate.headReservePercent, 20);
  const project = createProject();
  project.entities["station-settings"].stationType = "combined";
  for (const entityId of ["system-input", "system-input-2"]) {
    Object.assign(project.entities[entityId], input, { calculated: true, selectedPumpId: model.id });
  }
  const issues = collectProjectIssues(project, [model], null, []);
  for (const tool of ["input", "input2"]) {
    assert.equal(issues.find(issue => issue.id === `${tool}/selection/reserve`).severity, "warning");
  }
});

test("row colors and diagnostics agree: negative reserve is red, above 15 percent is yellow", () => {
  for (const [reserve, expectedClass, expectedSeverity] of [
    [-5, "danger", "error"], [-0.01, "danger", "error"],
    [0, "good", undefined], [5, "good", undefined], [5.1, "good", undefined],
    [10, "good", undefined], [10.1, "good", undefined], [15, "good", undefined],
    [15.001, "warning", "warning"], [20, "warning", "warning"], [100, "warning", "warning"],
  ]) {
    assert.equal(headReserveClass(reserve), expectedClass, `${reserve}% row color`);
    const head = 100 + reserve;
    const model = pump("reserve-fixture", { curve: [[0, head + 20], [100, head], [200, head - 20]] });
    const project = createProject();
    project.entities["station-settings"].stationType = "combined";
    for (const entityId of ["system-input", "system-input-2"]) {
      Object.assign(project.entities[entityId], input, { head: 100, calculated: true, selectedPumpId: model.id });
    }
    const issues = collectProjectIssues(project, [model], null, []);
    for (const tool of ["input", "input2"]) {
      const warning = issues.find(issue => issue.id === `${tool}/selection/reserve`);
      assert.equal(warning?.severity, expectedSeverity, `${tool}: ${reserve}% diagnostic`);
      if (expectedSeverity === "warning") assert.match(warning.message, /превышает рекомендуемые 15%/);
      if (expectedSeverity === "error") assert.match(warning.message, /заданный напор не обеспечен/);
    }
  }
});

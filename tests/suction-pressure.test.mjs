import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./load-ts.mjs";

const { checkInletPressure, inletPressureBar, suctionHydraulics } = await loadTs(new URL("../app/dn-defaults.ts", import.meta.url));
const { componentPressureLimit, withInletPressureChecks } = await loadTs(new URL("../app/suction-pressure.ts", import.meta.url));
const { checkSuctionSpecPressure } = await loadTs(new URL("../app/suction-spec.ts", import.meta.url));
const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const { synchronizeCollectors } = await loadTs(new URL("../app/collector-project.ts", import.meta.url));
const { collectorPressureChecks } = await loadTs(new URL("../app/collector-calculations.ts", import.meta.url));
const component = (id, fields = { PN: 16 }, family = id) => ({ id, family, catalogId: "test", fields: Object.entries(fields).map(([label, value]) => ({ column: label, headerPath: [label], value })), prices: [{ label: "Цена", amount: 125, currency: "RUB" }] });
const row = (id, patch = {}) => ({ position: "03.10", name: id, equipmentId: id, section: "suction", details: "Выбрано пользователем", price: 125, quantity: 2, status: "selected", description: "Существующее описание", ...patch });
function project(head = 200, pn = 16) {
  const p = createProject();
  p.entities["station-settings"].inletHead = head;
  Object.assign(p.entities["system-input"], { flowRate: 50, head: 30, staticHead: 999, workingPumpCount: 1, reservePumpCount: 1, selectedPumpId: "test-pump", calculated: true });
  p.entities["station-dn"].pn = pn;
  return synchronizeCollectors(p);
}

test("200 m is 19.6133 bar: PN16 exceeded, PN25 within limit; comparison uses unrounded pressure", () => {
  assert.equal(inletPressureBar(200), 19.6133);
  const exceeded = checkInletPressure(200, "Всасывающий коллектор", 16, "PN16");
  assert.equal(exceeded.status, "exceeded");
  assert.match(exceeded.message, /200 м.*19,6 бар.*превышает PN16.*Всасывающий коллектор/);
  assert.equal(checkInletPressure(200, "Фланец", 25, "PN25").status, "within-limit");
  assert.equal(checkInletPressure(16 / .0980665, "Фланец", 16).status, "within-limit");
  assert.equal(checkInletPressure(16.001 / .0980665, "Фланец", 16).status, "exceeded");
});

test("missing head, missing limit and nonpositive head never claim a successful positive-pressure check", () => {
  for (const head of [null, undefined, NaN, Infinity]) {
    assert.equal(checkInletPressure(head, "Элемент", 16).status, "missing-head");
    assert.match(checkInletPressure(head, "Элемент", 16).message, /не выполнена/);
  }
  for (const limit of [null, undefined, NaN, Infinity, 0, -1]) {
    assert.equal(checkInletPressure(200, "Элемент", limit).status, "unknown-limit");
    assert.match(checkInletPressure(200, "Элемент", limit).message, /данных для проверки недостаточно/);
  }
  for (const head of [0, -3]) assert.equal(checkInletPressure(head, "Элемент", 16).status, "nonpositive");
});

test("catalogue rating uses explicit PN and pressure with units, not measurement ranges or mating compatibility", () => {
  assert.deepEqual(componentPressureLimit(component("valve", {}, "Затвор PN10/16")), { bar: 16, label: "PN16" });
  assert.deepEqual(componentPressureLimit(component("flange", { PN: "PN25" })), { bar: 25, label: "PN25" });
  assert.equal(componentPressureLimit(component("limit", { "Допустимое давление, МПа": 1.6 })).bar, 16);
  assert.equal(componentPressureLimit(component("limit", { PN: 25, "Максимальное рабочее давление, бар": 16 })).bar, 16);
  assert.equal(componentPressureLimit(component("gauge", { "Давление, МПа": "0…2,5" })), null);
  assert.equal(componentPressureLimit(component("unknown", { "Давление": 25 })), null);
  assert.equal(componentPressureLimit(component("unknown", { "Совместимые PN": "10/16/25/40" })), null);
  assert.equal(componentPressureLimit(component("bad", { PN: -16 })), null);
});

test("PN25 collector does not hide a PN16 valve, flange, adapter or seal; head does not change PN", () => {
  const p = project(200, 25);
  const db = { items: [component("Арматура"), component("Фланец"), component("Переход"), component("Уплотнение"), component("PN25", { PN: 25 }), component("Неизвестно", {})] };
  const items = [p.entities["station-spec"].items.find(i => i.option === "suctionCollector"), ...db.items.map(c => row(c.id))];
  const checked = checkSuctionSpecPressure(p, items, db);
  assert.equal(checked[0].inletPressureCheck.checks[0].status, "within-limit");
  for (const item of checked.slice(1, 5)) {
    assert.equal(item.status, "confirmation");
    assert.equal(item.inletPressureCheck.checks[0].status, "exceeded");
    assert.ok(item.inletPressureCheck.checks[0].message.includes(item.name));
    assert.equal(item.price, 125);
  }
  assert.equal(checked[5].inletPressureCheck.checks[0].status, "within-limit");
  assert.equal(checked[6].inletPressureCheck.checks[0].status, "unknown-limit");
  assert.equal(p.entities["station-dn"].pn, 25);
  assert.equal(p.entities["station-collectors"].suction.configuration.pn, 25);
  p.entities["station-settings"].inletHead = 0;
  assert.equal(checkSuctionSpecPressure(p, items, db)[1].inletPressureCheck.checks[0].status, "nonpositive");
  assert.equal(p.entities["system-input"].staticHead, 999);
});

test("lowering inlet head clears only the pressure warning, with prices, other warnings and statuses preserved", () => {
  for (const baseStatus of ["selected", "confirmation", "clarify"]) {
    const original = row("Фланец", { status: baseStatus, description: "Предупреждение: проверить монтажные размеры" });
    const high = withInletPressureChecks(original, [checkInletPressure(200, original.name, 16)]);
    assert.equal(high.status, "confirmation");
    const low = withInletPressureChecks(high, [checkInletPressure(30, original.name, 16)]);
    assert.equal(low.status, baseStatus);
    assert.equal(low.price, original.price);
    assert.equal(low.description, original.description);
    assert.equal(low.details, original.details);
    assert.equal(low.inletPressureCheck.checks[0].status, "within-limit");
    assert.doesNotMatch(low.inletPressureCheck.checks[0].message, /превышает/);
  }
});

test("pump inlet rating is explicit and persists; general max pressure never substitutes for it", () => {
  let p = project(200, 25);
  const dn = p.entities["station-dn"];
  dn.pumpSuctionPort = { pumpId: "test-pump", dn: 50, connection: "flanged", maxPressure: 16, source: "fixture" };
  const pump = row("test-pump", { name: "Насос тестовый", section: "pump" });
  assert.equal(checkSuctionSpecPressure(p, [pump])[0].inletPressureCheck.checks[0].status, "unknown-limit");
  assert.equal(suctionHydraulics(dn, p.entities["system-input"], p.entities["station-settings"]).errors.length, 0);
  dn.pumpSuctionPort.maxInletPressure = 10;
  p = parseProjectConfig(JSON.parse(JSON.stringify(p)));
  assert.equal(p.entities["station-dn"].pumpSuctionPort.maxInletPressure, 10);
  assert.equal(checkSuctionSpecPressure(p, [pump])[0].inletPressureCheck.checks[0].status, "exceeded");
  p.entities["station-dn"].pumpSuctionPort.maxInletPressure = 25;
  assert.equal(checkSuctionSpecPressure(p, [pump])[0].inletPressureCheck.checks[0].status, "within-limit");
});

test("collector BOM checks actual component ratings and reports missing ratings", () => {
  const c = project(200, 25).entities["station-collectors"].suction.configuration;
  const checks = collectorPressureChecks(c, 200, { version: "fixture", bolts: [], components: [] });
  assert.equal(checks[0].status, "within-limit");
  assert.ok(checks.slice(1).length > 0);
  assert.ok(checks.slice(1).every(check => check.status === "unknown-limit"));
});

test("collector pressure warning preserves a database price and is removed after lowering head", () => {
  let p = project(200, 16);
  const state = p.entities["station-collectors"].suction;
  state.database = { id: "saved-collector", code: state.code, price: 12345 };
  state.databaseStatus = "found";
  p = synchronizeCollectors(p);
  const high = p.entities["station-spec"].items.find(item => item.option === "suctionCollector");
  assert.equal(high.status, "confirmation");
  assert.equal(high.price, 12345);
  assert.equal(high.inletPressureCheck.checks[0].status, "exceeded");
  p.entities["station-settings"].inletHead = 30;
  p = synchronizeCollectors(p);
  const low = p.entities["station-spec"].items.find(item => item.option === "suctionCollector");
  assert.equal(low.status, "selected");
  assert.equal(low.price, 12345);
  assert.equal(low.inletPressureCheck.checks[0].status, "within-limit");
});

test("actual specification render keeps technical descriptions and warnings behind the button", async () => {
  const pageUrl = new URL("../app/page.tsx", import.meta.url);
  const page = await readFile(pageUrl, "utf8");
  const source = [
    `import { useRef, useState } from ${JSON.stringify(import.meta.resolve("react"))};`,
    'import { specificationItemPresentation, specificationIssueId, specificationSection, visibleSpecificationItems } from "./specification-presentation";',
    'const IssueNavigationMessage=()=>null; const IssueMessages=()=>null;',
    'const normalizeSpecificationItems=items=>items; const isSecondaryEnabled=()=>false; const pumpPriceRub=()=>0;',
    page.slice(page.indexOf("const SPEC_GROUPS:"), page.indexOf("\n];", page.indexOf("const SPEC_GROUPS:")) + 3),
    page.slice(page.indexOf("function Specification("), page.indexOf("function PumpSketchView(")),
    'export {Specification};',
  ].join("\n");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
  const { Specification } = await loadTs(pageUrl, { [pageUrl.href]: compiled });
  const item = withInletPressureChecks(row("Фланец", { details: "DN100 · PN16 · Ст20", description: "Предупреждение: проверить размеры" }), [checkInletPressure(200, "Фланец", 16, "PN16")]);
  const html = renderToStaticMarkup(createElement(Specification, { entity: { items: [item] }, settings: project().entities["station-settings"], catalogue: [] }));
  assert.match(html, /spec-table__row--warning/);
  assert.match(html, /spec-table__cell--price[^>]*>125</);
  assert.match(html, /<button[^>]*aria-label="Ошибка: Фланец"/);
  assert.match(html, /spec-table__cell--description">DN100 · PN16 · Ст20<\/span>/);
  assert.doesNotMatch(html, /проверить размеры|200 м|19,6 бар|превышает PN16/);
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.spec-table__row--warning\s*\{\s*background:var\(--theme-surface-warning, #fff8df\)/);
});

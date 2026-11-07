import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./load-ts.mjs";

const { DETAIL_OPERATIONS, detailNodeTypes, executeDetailOperation, buildPumpDetailData, safePumpDetailAssetUrl } = await loadTs(new URL("../app/node-tools/pump-detail-data.ts", import.meta.url));
const cardModule = new URL("../app/node-tools/pump-detail-card.tsx", import.meta.url);
const { PumpDetailCard } = await loadTs(cardModule, { [cardModule.href]: (await readFile(cardModule, "utf8")).replace('from "react"', `from ${JSON.stringify(import.meta.resolve("react"))}`) });
const types = detailNodeTypes();
function fixture() {
  const item = {
    modelId: "exact-model", variantId: "exact-variant", curveSetId: "curve-60", frequencyHz: 60, issues: ["Проверить данные источника"],
    provenance: { curveSet: { id: "curve-60", model_id: "exact-model", frequency_hz: 60 }, sources: [{ id: "source-1", archivePath: "archive/evidence.json.gz", jsonPointer: "/exact/variant", sha256: "f".repeat(64) }], additionalEvidence: { preserved: true } },
    pump: { id: "exact-variant", manufacturer: "Fixture", series: "EX", group: "EX10", model: "Exact pump", execution: "Exact pump 60Hz", article: "SKU-60", type: "vertical_multistage", medium: "water", power: 3, nominalFlow: 10, ratedHead: null, efficiency: null, minFlow: 0, maxFlow: 20, minHead: 10, maxHead: 30, frequencyHz: 60, speedRpm: null, inletDn: 50, outletDn: null, weightKg: null, price: 0, priceCurrency: "RUB", priceKind: "net", discountPercent: 0, priceSource: "source-price", source: "source-1", drawing: null, curve: [[0, 30], [10, 20], [20, 10]], efficiencyCurve: [[0, 0], [10, 65]], powerCurve: [[0, 1], [10, 3]], npshCurve: [[0, 0], [10, 2]], electric: { voltageV: 380, currentA: null, phaseCount: 3 }, materials: { components: [{ component: "body", material: "AISI316", state: "source_value" }, { component: "shaft", material: null, state: "unknown" }] }, mounting: { hasSensors: false }, inlet: { dn: 50, pn_nominal_bar: 16 }, fluid: { maxWorkingPressureBar: null }, selectable: true, active: true }
  };
  const selection = { bindingKey: "selectedPump", node: "pump/select", variantId: item.variantId, modelId: item.modelId, curveSetId: item.curveSetId, snapshotId: "a".repeat(64), requestKey: "request-exact", valid: true, stale: false, message: "Подтверждено" };
  const context = { values: {}, defaults: {}, role: "admin", resources: { pump_catalog_v2: { id: selection.snapshotId, items: [item] } } };
  return { item, selection, context };
}
function run(operation, values, context) {
  const type = types.find(type => type.operation === operation);
  return executeDetailOperation({ id: "card/" + operation, operation, fields: type.fields, values: {}, links: [], expressions: {} }, values, context);
}
function render(data) { return renderToStaticMarkup(createElement(PumpDetailCard, { view: { kind: "pump-detail", label: "Карточка насоса", node: "card/ui", detail: data } })); }

test("detail nodes preserve exact source identity, all source attributes and every curve without mutation", () => {
  assert.deepEqual(types.map(type => type.operation), [...DETAIL_OPERATIONS]);
  const { item, selection, context } = fixture(), before = JSON.stringify(item), result = run("pump.detailData", { item, selection }, context), data = result.value;
  assert.equal(data.status, "ready");assert.deepEqual(data.identity, { variantId: item.variantId, modelId: item.modelId, curveSetId: item.curveSetId, snapshotId: selection.snapshotId, frequencyHz: 60 });
  assert.deepEqual(data.curves.map(curve => curve.points), [item.pump.curve, item.pump.efficiencyCurve, item.pump.powerCurve, item.pump.npshCurve]);
  assert.equal(data.record.provenance.additionalEvidence.preserved, true);assert.equal(data.record.pump.mounting.hasSensors, false);assert.equal(JSON.stringify(item), before);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
  const view = run("ui.pumpDetail", { data }, context).value;
  assert.equal(view.kind, "pump-detail");assert.strictEqual(view.detail, data);
  const html = render(data);
  for (const label of ["Двигатель и электрика", "Материалы", "Подключения и монтаж", "Условия эксплуатации", "Габариты и масса", "Цена и наличие", "Источники и идентификаторы", "Происхождение и применимость данных", "Расход — напор", "КПД", "Мощность по кривой", "Кавитационный запас"]) assert(html.includes(label), label);
  assert(html.includes("SKU-60"));assert(html.includes("AISI316"));assert(html.includes("Ток, А"));assert(html.includes("Номинальное PN, бар"));assert(html.includes(selection.snapshotId));
});

test("stale, mismatched or missing selections never expose a replacement pump or source curves", () => {
  const { item, selection, context } = fixture();
  for (const changed of [null, { ...selection, valid: false }, { ...selection, stale: true }, { ...selection, variantId: "another" }, { ...selection, modelId: "another" }, { ...selection, curveSetId: "curve-50" }, { ...selection, snapshotId: "b".repeat(64) }, { ...selection, requestKey: "" }]) {
    const data = buildPumpDetailData(item, changed, context);
    assert.notEqual(data.status, "ready");assert.equal(data.record, undefined);assert.deepEqual(data.curves, []);assert(!render(data).includes("SKU-60"));
  }
  assert.equal(buildPumpDetailData(null, selection, context).status, "stale");
  assert.equal(buildPumpDetailData({ ...item, pump: { ...item.pump, id: "wrong" } }, selection, context).status, "stale");
  assert.equal(buildPumpDetailData(item, selection, { ...context, resources: { pump_catalog_v2: { id: selection.snapshotId, items: [] } } }).status, "stale");
});

test("frequency and curve provenance must agree and the pinned source supplies canonical pump values", () => {
  const { item, selection, context } = fixture();
  for (const changed of [
    { ...item, frequencyHz: 50 },
    { ...item, pump: { ...item.pump, frequencyHz: 50 } },
    { ...item, provenance: { curveSet: { id: "other" } } },
    { ...item, provenance: { curveSet: { frequency_hz: 50 } } },
    { ...item, provenance: { curveSet: { model_id: "other" } } }
  ]) assert.equal(buildPumpDetailData(changed, selection, context).status, "stale");
  const modified = { ...item, pump: { ...item.pump, power: 999, materials: { body: "forged" } } }, data = buildPumpDetailData(modified, selection, context);
  assert.equal(data.status, "ready");assert.equal(data.record.pump.power, 3);assert(!JSON.stringify(data).includes("forged"));
});

test("unknowns, zero and false remain distinct and no legacy card supplement or family drawing is used", () => {
  const { item, selection, context } = fixture();
  // Legacy ID 1 and a known CNP designation deliberately exercise the former implicit fallback paths.
  item.variantId = "1";item.pump = { ...item.pump, id: "1", manufacturer: "CNP", model: "CDM1-2", execution: undefined, ratedHead: null, weightKg: null, inletDn: null, outletDn: null, inlet: {}, efficiencyCurve: undefined, powerCurve: undefined, npshCurve: undefined };
  selection.variantId = "1";
  const data = buildPumpDetailData(item, selection, context), html = render(data), rows = data.sections.flatMap(section => section.rows);
  assert.equal(data.status, "ready");assert.deepEqual(data.assets, []);
  assert.equal(rows.find(row => row.label === "Масса, кг").value, "Не указано в источнике");
  assert.equal(rows.find(row => row.label === "DN всасывающего патрубка").value, "Не указано в источнике");
  assert.equal(rows.find(row => row.label === "Закупочная цена из каталога").value, "0");
  assert.equal(rows.find(row => row.label === "Монтаж · Датчики").value, "Нет");
  assert.equal(rows.find(row => row.label === "Частота вращения, об/мин").value, "Не указано в источнике");
  assert.equal(data.curves[1].points.length, 0);assert(html.includes("Подтверждённый чертёж не указан"));assert(!html.includes("cnp-drawings"));assert(!html.includes("Принято 50"));
  item.frequencyHz = null;item.pump.frequencyHz = null;item.provenance.curveSet.frequency_hz = null;
  assert.equal(buildPumpDetailData(item, selection, context).identity.frequencyHz, null);
});

test("asset links allow explicit local files and reject executable, external, traversal and filesystem URLs", () => {
  const { item, selection, context } = fixture(), file = "/api/pumps/files/12345678-1234-1234-1234-123456789abc";
  for (const value of ["javascript:alert(1)", "data:image/svg+xml,<svg/>", "https://other.test/pump.png", "//other.test/pump.png", "C:\\Equipment\\pump.pdf", "/../pump.png", "/drawings/%2e%2e/pump.png", "/drawings/%252e%252e/pump.png", "/drawings/%5cother.png", "/api/logout", "/api/logout.png", "/drawings/pump.html", "/drawings/pump.svg", "/drawings/pump.png?redirect=elsewhere", "/drawings/pump.png#fragment"]) assert.equal(safePumpDetailAssetUrl(value), null, value);
  assert.equal(safePumpDetailAssetUrl(file), file);assert.equal(safePumpDetailAssetUrl("/drawings/exact-pump.png"), "/drawings/exact-pump.png");
  item.pump.assets = { files: { drawing: { id: "file", url: file, name: "Чертёж.pdf", contentType: "application/pdf" } }, modelPath: "C:/Equipment/pump.step", imagePath: "javascript:alert(1)" };
  const data = buildPumpDetailData(item, selection, context), html = render(data);
  assert.equal(data.assets.length, 1);assert.equal(data.assets[0].image, false);assert(html.includes(`href="${file}"`));assert(!html.includes('href="javascript:'));
  // The renderer checks links again, including data composed manually through object nodes.
  const forged = { ...data, assets: [{ kind: "drawing", name: "fake", url: "javascript:alert(1)", image: true }] };
  assert(!render(forged).includes('src="javascript:'));assert(!render(forged).includes('href="javascript:'));
});

test("large point arrays remain complete while the card initially renders only the first page", () => {
  const { item, selection, context } = fixture();
  item.pump.curve = Array.from({ length: 137 }, (_, q) => [q, 200 - q]);
  const data = buildPumpDetailData(item, selection, context), html = render(data);
  assert.equal(data.curves[0].points.length, 137);assert.deepEqual(data.curves[0].points[136], [136, 64]);
  assert(html.includes("Показано 50 из 137"));assert(html.includes("Показать ещё 50 точек"));
  assert.equal(data.record.pump.curve.length, 137);assert.equal(data.curves.length, 4);
});

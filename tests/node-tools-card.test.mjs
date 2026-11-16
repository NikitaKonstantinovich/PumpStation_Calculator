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

test("both circuit cards show verified PDF pages and preserve the original download and scope", () => {
  const original="/api/pumps/catalog-drawings/"+"c".repeat(64)+".pdf", preview="/api/pumps/catalog-drawings/"+"d".repeat(64)+".png";
  for (const circuit of ["primary","secondary"]) {
    const {item,selection,context}=fixture();selection.node=circuit+"/selection";
    item.pump.drawings=[{url:original,previewUrl:preview,name:"Размерный лист.pdf",contentType:"application/pdf",scope:"model_reference",note:"Справочная схема модели",page:56}];
    const data=buildPumpDetailData(item,selection,context),html=render(data);
    assert.equal(data.assets[0].url,original);assert.equal(data.assets[0].previewUrl,preview);
    for (const text of [preview,original,"страница PDF 56","Скачать оригинал","Справочная схема модели","Увеличить чертёж"]) assert(html.includes(text),text);
    const forged=structuredClone(data);forged.assets[0].previewUrl="https://untrusted.invalid/a.png";assert(!render(forged).includes("untrusted.invalid"));
    const stale=structuredClone(selection);stale.snapshotId="b".repeat(64);assert.equal(buildPumpDetailData(item,stale,context).status,"stale");
  }
});

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
  for (const label of ["Двигатель и электрика", "Материалы", "Присоединения", "Условия эксплуатации", "Габариты и масса", "Цена за один насос", "Источники и применимость", "Расход — напор", "КПД", "Мощность по кривой", "NPSHr"]) assert(html.includes(label), label);
  assert(html.includes("SKU-60")); assert(html.includes("AISI316")); assert(html.includes("PN 16"));
  for (const hidden of [selection.snapshotId, "archive/evidence", "jsonPointer", "SHA-256", "additionalEvidence", "Компоненты ·"]) assert(!html.includes(hidden), hidden);
  assert.equal((html.match(/Мощность двигателя/g) ?? []).length, 1);
  assert(!html.includes('nt-card-details" open'));
  assert(html.includes("Корпус")); assert(html.includes("Вал"));

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
  assert.equal(rows.find(row => row.key === "mass").value, "Нет данных");
  assert.equal(data.sections.find(s => s.id === "connections").table.rows[0][1], "Нет данных");
  assert.equal(rows.find(row => row.key === "price").value, "0 RUB");
  assert.equal(rows.find(row => row.key === "sensors").value, "Нет");
  assert.equal(rows.find(row => row.key === "rpm").value, "Нет данных");
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

test("legacy card settings cannot restore working-point or collector-spacing sections", () => {
  const { item, selection, context } = fixture(), data = buildPumpDetailData(item, selection, context);
  const legacy = { sectionOrder: ["point", "spacing", "electric"], hiddenSections: [], showPoint: true };
  const view = { kind: "pump-detail", node: "card/ui", detail: data, cardPresentation: legacy };
  const check = () => {
    for (const html of [render(data), renderToStaticMarkup(createElement(PumpDetailCard, { view }))]) {
      for (const removed of ["Рабочая точка по расчёту", "Межосевое расстояние в текущей компоновке", "Подключите результат инструмента", "Подключите результат конструктора", "Расчётный расход группы", "Расчётный шаг насосов"]) assert(!html.includes(removed), removed);
      assert(html.includes("Двигатель и электрика")); assert(html.includes("Число фаз"));
    }
  };
  check();
  data.sections.find(s => s.id === "point").rows.push({ key: "actualFlow", label: "Расчётный расход группы", value: "12 м³/ч" });
  data.sections.find(s => s.id === "spacing").rows.push({ key: "suction", label: "Расчётный шаг насосов", value: "750 мм" });
  check();
});

test("large point arrays remain complete while the card initially renders only the first page", () => {
  const { item, selection, context } = fixture();
  item.pump.curve = Array.from({ length: 137 }, (_, q) => [q, 200 - q]);
  const data = buildPumpDetailData(item, selection, context), html = render(data);
  assert.equal(data.curves[0].points.length, 137);assert.deepEqual(data.curves[0].points[136], [136, 64]);
  assert(html.includes("Показано 50 из 137"));assert(html.includes("Показать ещё 50 точек"));
  assert.equal(data.record.pump.curve.length, 137);assert.equal(data.curves.length, 4);
});

test("card presentation hides and orders sections without discarding inspector data or inherited origin controls", () => {
  const { item, selection, context } = fixture(), data = buildPumpDetailData(item, selection, context);
  const v = run("ui.pumpDetail", { data, sectionOrder: ["price", "connections"], hiddenSections: ["materials"], mainFields: ["power"], showPassport: false, showPoint: false, showOrigin: false }, context).value;
  const html = renderToStaticMarkup(createElement(PumpDetailCard, { view: v }));
  assert(html.indexOf("Цена за один насос") < html.indexOf("Присоединения"));
  assert(!html.includes("AISI316")); assert(!html.includes("Паспортные характеристики модели")); assert(!html.includes("Рабочая точка по расчёту")); assert(!html.includes('class="nt-origin"'));
  assert.equal(v.detail.record.pump.materials.components[0].material, "AISI316");
  const inherited = renderToStaticMarkup(createElement(PumpDetailCard, { view: run("ui.pumpDetail", { data }, context).value, showOrigin: false }));
  assert(!inherited.includes('class="nt-origin"'));
});

test("connection designations and dimension applicability survive compact formatting", () => {
  const { item, selection, context } = fixture();
  item.pump.inlet = { dn: 25, thread_designation: 'G 1', connection_type: "thread", pn_designation: "PN 16" };
  item.pump.dimensions = { scope: "model_reference", overall_width: 201.25, sourceValues: [{ symbol: "D2", valueMm: 99, mappingStatus: "symbol_only" }] };
  const data = buildPumpDetailData(item, selection, context), html = render(data);
  assert(html.includes("G 1")); assert(html.includes("Резьбовое")); assert(!html.includes("DN 25 мм"));
  assert(html.includes("исполнение не подтверждено")); assert(html.includes("201,3 мм")); assert(!data.sections.find(s=>s.id==="dimensions").rows.some(r=>r.label.includes("D2"))); assert(data.sections.find(s=>s.id==="dimensionSymbols").additional);
  assert.equal(data.record.pump.dimensions.sourceValues[0].symbol, "D2");
});


test("engineering materials accept catalogue Russian names and retain conflicts", () => {
  const {item,selection,context}=fixture();
  item.pump.materials={scope:'catalog_model_default',components:[{component:'корпус',material:'Чугун',state:'source_value'},{component:'рабочее колесо',material:'AISI 304',state:'source_value'},{component:'pump_shaft_material',material:'AISI 304',state:'conflict'},{component:'торцевое уплотнение',material:'Карбид / графит',state:'source_value'}]};
  item.pump.fluid={operatingLimits:{liquid_min_c:-15,liquid_standard_max_c:70,liquid_high_temperature_option_max_c:120}};
  const data=buildPumpDetailData(item,selection,context),rows=data.sections.find(s=>s.id==='materials').rows;
  assert.deepEqual(rows.map(r=>r.label),['Корпус','Рабочее колесо','Вал','Уплотнение']);
  assert.match(rows[2].value,/Конфликт источников/);
  assert.match(data.sections.find(s=>s.id==='fluid').note,/специального исполнения/);
  assert.equal(data.sections.find(s=>s.id==='fluid').rows.find(r=>r.key==='liquid_standard_max_c').value,'70 °C');
});


test("voltage appears once and stays paired with current for multiple modes", () => {
  const {item,selection,context}=fixture();
  item.pump.electric={ratings:[{voltageV:380,currentA:4.5,phaseCount:3,connectionScheme:'star'}]};
  let html=render(buildPumpDetailData(item,selection,context));
  assert.equal((html.match(/380/g)||[]).length,1);
  item.pump.electric.ratings=[{voltageV:230,currentA:8,phaseCount:3,connectionScheme:'delta'},{voltageV:400,currentA:4.6,phaseCount:3,connectionScheme:'star'}];
  html=render(buildPumpDetailData(item,selection,context));
  assert.equal((html.match(/230/g)||[]).length,1); assert.equal((html.match(/400/g)||[]).length,1);
  assert.match(html,/230<\/td><td>8/); assert.match(html,/400<\/td><td>4,6/);
});

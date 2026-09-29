import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./load-ts.mjs";
import { pumpCardSupplement } from "../scripts/build-pump-card-supplement.mjs";

const { pumpCardSections, pumpCardCurves, pumpCardPhysicalData } = await loadTs(new URL("../app/pump-card-data.ts", import.meta.url));
const pumps = JSON.parse(await readFile(new URL("../public/pumps.json", import.meta.url), "utf8"));
const toModule = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText).toString("base64")}`;
const supplementJson = await readFile(new URL("../app/pump-card-supplement.json", import.meta.url), "utf8");
const helperUrl = toModule((await readFile(new URL("../app/pump-card-data.ts", import.meta.url), "utf8"))
  .replace('import supplement from "./pump-card-supplement.json";', `const supplement = ${supplementJson};`));
const componentSource = (await readFile(new URL("../app/pump-card.tsx", import.meta.url), "utf8"))
  .replace('from "./pump-card-data"', `from "${helperUrl}"`);
const componentUrl = toModule(componentSource);
const componentJs = Buffer.from(componentUrl.split(",")[1], "base64").toString()
  .replaceAll('from "react/jsx-runtime"', `from "${import.meta.resolve("react/jsx-runtime")}"`);
const { PumpCard } = await import(`data:text/javascript;base64,${Buffer.from(componentJs).toString("base64")}`);

test("CNP cards show verified nozzle sizes, net mass and traceable sources", () => {
  const model = name => pumps.find(p => p.manufacturer === "CNP" && p.model === name);
  const chlf = model("CHLF2-20");
  assert.equal(pumpCardPhysicalData(chlf).weight, "9");
  assert.equal(pumpCardPhysicalData(chlf).inlet, "G1");
  assert.equal(pumpCardPhysicalData(chlf).outlet, "G1");
  const nis = model("NIS100-65-200/18.5");
  assert.equal(pumpCardPhysicalData(nis).inlet, "DN 100");
  assert.equal(pumpCardPhysicalData(nis).outlet, "DN 65");
  assert.equal(pumpCardPhysicalData(nis).weight, "222");
  assert.equal(pumpCardPhysicalData(model("TD32-33G/2")).weight, "52");
  assert.equal(pumpCardPhysicalData(model("100WQ100-22-11H(I)")).weight, "270");
  assert.equal(pumpCardPhysicalData(model("100WQ100-22-11H(I)")).inlet, "Не указано в базе");
  for (const p of pumps.filter(p => p.manufacturer === "CNP" && ["CDM", "CHLF", "NIS"].includes(p.series))) {
    const physical = pumpCardPhysicalData(p);
    assert.notEqual(physical.weight, "Не указано в базе", p.model);
    assert.notEqual(physical.inlet, "Не указано в базе", p.model);
    assert.notEqual(physical.outlet, "Не указано в базе", p.model);
  }
  const html = renderToStaticMarkup(createElement(PumpCard, {pump: nis}));
  assert.match(html, /NIS_NISO_20062025.pdf, стр. 98/);
  assert.match(renderToStaticMarkup(createElement(PumpCard, {pump: model("CDM125-6")})), /только в исполнении CDMF/);
  // No copying across generations, or from another nominal head.
  assert.equal(pumpCardPhysicalData(model("40WQ10-7-0.55(II)")).weight, "Не указано в базе");
  assert.equal(pumpCardPhysicalData(model("TD100-11/2")).weight, "Не указано в базе");
});

test("renders characteristics before the drawing and keeps them when the drawing is absent", () => {
  const pump = pumps.find(p => p.id === "1");
  const html = renderToStaticMarkup(createElement(PumpCard, { pump }, createElement("img", { src: "/drawing.png", alt: "Размеры насоса" })));
  assert.ok(html.indexOf("Гидравлические характеристики") < html.indexOf("Эскиз с габаритами"));
  assert.ok(html.indexOf("Габаритная высота, мм") < html.indexOf('src="/drawing.png"'));
  assert.match(html, /482/);
  assert.match(html, /CDM1-2FSWPC/);
  assert.match(html, /Всасывающий патрубок · DN/);
  assert.match(html, /Точки характеристик/);
  const withoutDrawing = renderToStaticMarkup(createElement(PumpCard, { pump }));
  assert.match(withoutDrawing, /Чертёж не найден/);
  assert.match(withoutDrawing, /Мощность двигателя, кВт/);
  assert.match(withoutDrawing, /CDM1-2/);
});

test("preserves zero values, missing values, nested source parameters and warnings", () => {
  const pump = {
    ...pumps[0], nominalFlow: null, minFlow: 0, efficiency: null, price: 0, discountPercent: 0,
    electric: { voltage_v: 380, Защита: { "Датчик утечки": false } },
    dimensions: { "Размер из каталога, мм": 0 }, materials: { impeller: "AISI304", base: null },
    selectable: false, dataWarnings: ["Проверить кривую <Q–H>"],
  };
  const rows = pumpCardSections(pump).flatMap(s => s.rows);
  assert.equal(rows.find(r => r.label === "Минимальный расход по кривой, м³/ч").value, "0");
  assert.equal(rows.find(r => r.label === "Номинальный расход, м³/ч").value, "—");
  assert.equal(rows.find(r => r.label === "Скидка в источнике, %").value, "0");
  assert.equal(rows.find(r => r.label === "Защита · Датчик утечки").value, "Нет");
  assert.equal(rows.find(r => r.label === "Размер из каталога, мм").value, "0");
  assert.equal(rows.find(r => r.label === "Рабочее колесо").value, "AISI304");
  const html = renderToStaticMarkup(createElement(PumpCard, { pump }));
  assert.match(html, /Модель недоступна для подбора/);
  assert.match(html, /Проверить кривую &lt;Q–H&gt;/);
  assert.doesNotMatch(html, /NaN|undefined|\[object Object\]/);
});

test("supports every catalog record and preserves each hydraulic curve independently", () => {
  for (const pump of pumps) {
    const sections = pumpCardSections(pump);
    assert.ok(sections.every(s => s.rows.every(r => typeof r.value === "string" && r.value.length > 0)), pump.model);
    const curves = pumpCardCurves(pump);
    assert.deepEqual(curves.map(c => c.points), [pump.curve, pump.efficiencyCurve, pump.powerCurve, pump.npshCurve].filter(c => c?.length), pump.model);
  }
});

test("shows diameters and mass from nested data and archived model facts", () => {
  const cnp = pumpCardPhysicalData(pumps.find(p => p.id === "1"));
  assert.equal(cnp.inlet, "DN 25");
  assert.equal(cnp.outlet, "DN 25");
  assert.equal(cnp.weight, "23");
  assert.equal(pumpCardPhysicalData(pumps.find(p => p.id === "706")).weight, "20,7");
  assert.equal(pumpCardPhysicalData(pumps.find(p => p.id === "500")).weight, "230");
  const fixture = { ...pumps[0], id: "fixture", connectionSourceValue: { inlet: "G1½", outlet: "DN 25 / DN 32" }, dimensions: { "Нетто, кг": 14, "Брутто, кг": 20 } };
  const values = pumpCardPhysicalData(fixture);
  assert.equal(values.inlet, "G1½");
  assert.equal(values.outlet, "DN 25 / DN 32");
  assert.equal(values.weight, "14");
  const empty = pumpCardPhysicalData({ ...pumps[0], id: "empty", dimensions: { "Брутто, кг": 20 } });
  assert.equal(empty.weight, "Не указано в базе");
  assert.equal(empty.inlet, "Не указано в базе");
  assert.equal(empty.outlet, "Не указано в базе");
  const sewage = pumpCardPhysicalData({ ...pumps[0], id: "sewage", mounting: { "Напорный патрубок": "DN 80" } });
  assert.equal(sewage.outlet, "DN 80");
  assert.equal(sewage.inlet, "Не указано в базе");
});

test("supplement never substitutes another execution or confuses alternative connections with inlet/outlet", () => {
  const evidence = { sources: [{ record: { variants: [
    { designation: "A", weight_kg: 10, connection_designation: "DN25" },
    { designation: "B", weight_kg: 20, connection_designation: "G1" },
  ] } }] };
  assert.deepEqual(pumpCardSupplement({ execution: "C" }, evidence), {});
  assert.equal(pumpCardSupplement({ execution: "B" }, evidence).weightKg, 20);
  const unspecified = pumpCardSupplement({}, evidence);
  assert.equal(unspecified.weightKg, undefined);
  assert.equal(unspecified.weightVariants.length, 2);
  assert.equal(unspecified.inletDn, undefined);
  assert.deepEqual(unspecified.connectionVariants, ["DN25", "G1"]);
  assert.equal(pumpCardSupplement({ weightKg: 30 }, evidence).weightKg, undefined);
});

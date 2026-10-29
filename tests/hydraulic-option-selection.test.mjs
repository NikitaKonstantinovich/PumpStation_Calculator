import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";

const { hydraulicProductKind, hydraulicProductFacts, selectHydraulicProduct, hydraulicProductPrice, hydraulicThread } = await loadTs(new URL("../app/hydraulic-option-selection.ts", import.meta.url));
const binding = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const tankNeed = { kind: "tank", volumeLitres: 8, pressureBar: 5 };
// Synthetic explicit characteristics exercise validation, not catalogue coverage.
const component = (id, family, catalogId, values, amount = 100) => ({ id, family, catalogId,
  fields: Object.entries(values).map(([label, value]) => ({ column: label, headerPath: [label], value })),
  prices: amount == null ? [] : [{ label: "Цена, ₽", currency: "RUB", amount }] });
const tank = (id = "tank", amount = 100) => component(id, "Мембранный бак", "мембранный-бак", {
  "Наименование": "Бак испытательной фикстуры", "Объём, л": 8, "Допустимое рабочее давление, бар": 10,
  "Резьба": "G3/4", "Исполнение резьбы": "НР",
}, amount);
const transducer = (id = "sensor") => component(id, "Преобразователь давления — тест", "кипиа", {
  "Давление, МПа": "0…1,0", "Допустимое рабочее давление, бар": 10, "Резьба": "G1/2",
  "Исполнение резьбы": "НР", "Выходной сигнал": "4–20 мА", "Питание, В": "10–30 В DC",
  "Давление перегрузки, бар": 20,
});
const sensorNeed = { kind: "transducer", pressureBar: 8, range: { min: 0, max: .8 }, signal: "4-20 mA", supplyVoltage: 24, overloadBar: 16 };

test("real tank catalogue distinguishes four tanks from two hoses and exposes missing ratings", () => {
  assert.equal(binding.items.filter(i => hydraulicProductKind(i) === "tank").length, 4);
  const result = selectHydraulicProduct(binding.items, tankNeed);
  assert.equal(result.selected.item.id, "мембранный-бак-001-r0004");
  assert.equal(result.selected.technicalStatus, "unverified");
  assert.match(result.explanation, /допустимое рабочее давление/);
  assert.equal(hydraulicProductPrice(result.selected.item, tankNeed), 2347.28);
  assert.equal(selectHydraulicProduct(binding.items, { ...tankNeed, volumeLitres: 200 }).selected, undefined);
});
test("tank volume, pressure, thread standard and gender must match independently", () => {
  assert.equal(selectHydraulicProduct([tank()], tankNeed).selected.technicalStatus, "ready");
  for (const patch of [{ volumeLitres: 50 }, { pressureBar: 16 }, { thread: "R3/4" }, { threadGender: "female" }]) {
    assert.equal(selectHydraulicProduct([tank()], { ...tankNeed, ...patch }).selected, undefined);
  }
  assert.equal(hydraulicThread('3/4"'), null);
  assert.equal(hydraulicThread('G 3/4"'), "G3/4");
  assert.equal(hydraulicThread("M20×1,5"), "M20x1.5");
});
test("selection is deterministic and retains the same suitable product without price", () => {
  const a = tank("a", null), b = tank("b", 10);
  assert.equal(selectHydraulicProduct([b, a], tankNeed).selected.item.id, "a");
  assert.equal(selectHydraulicProduct([a, b], tankNeed).selected.item.id, "a");
  assert.equal(hydraulicProductPrice(a, tankNeed), null);
});
test("explicit incompatible or missing selection is not silently replaced", () => {
  const item = tank();
  const result = selectHydraulicProduct([item], { ...tankNeed, pressureBar: 16 }, item.id);
  assert.equal(result.selected.item.id, item.id);
  assert.equal(result.selected.technicalStatus, "error");
  assert.equal(selectHydraulicProduct([item], tankNeed, "removed").selected, undefined);
  assert.equal(selectHydraulicProduct([item], tankNeed, "removed").missingSelection, true);
});
test("transducer range does not replace pressure, supply, signal and overload checks", () => {
  assert.equal(selectHydraulicProduct([transducer()], sensorNeed).selected.technicalStatus, "ready");
  for (const patch of [{ supplyVoltage: 48 }, { signal: "0-10 V" }, { pressureBar: 16 }, { overloadBar: 25 }, { range: { min: -.1, max: .8 } }]) {
    assert.equal(selectHydraulicProduct([transducer()], { ...sensorNeed, ...patch }).selected, undefined);
  }
  const real = selectHydraulicProduct(binding.items, sensorNeed);
  assert.equal(real.selected.technicalStatus, "unverified");
  assert.equal(hydraulicProductFacts(real.selected.item).pressureBar, null);
  assert.match(real.explanation, /питания/);
  assert.match(real.explanation, /сигнал/);
});
test("missing or invalid requirements cannot certify a product", () => {
  for (const pressureBar of [null, NaN, -1]) assert.equal(selectHydraulicProduct([tank()], { ...tankNeed, pressureBar }).selected?.technicalStatus, "unverified");
  assert.equal(selectHydraulicProduct([transducer()], { ...sensorNeed, range: undefined, supplyVoltage: undefined }).selected.technicalStatus, "unverified");
});
test("valve variant prices are independent and missing handle price is not replaced by bare stem price", () => {
  const valve = binding.items.find(i => i.id === "затворы-001-r0012");
  assert.equal(hydraulicProductPrice(valve, { kind: "isolating-valve", actuator: "handle" }), 4300);
  assert.equal(hydraulicProductPrice(valve, { kind: "isolating-valve", actuator: "bare" }), 3600);
  assert.equal(hydraulicProductPrice(valve, { kind: "isolating-valve", actuator: "gear" }), null);
  assert.equal(hydraulicProductPrice(valve, { kind: "isolating-valve" }), null);
});

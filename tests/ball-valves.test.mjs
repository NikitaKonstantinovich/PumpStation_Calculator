import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

// Exercise the actual selection and specification functions without mounting
// the workspace or triggering its project persistence effects.
const url = new URL("../app/page.tsx", import.meta.url);
const page = await readFile(url, "utf8");
const source = [
  page.match(/^const componentFieldLabel=.*$/m)[0],
  page.slice(page.indexOf("const componentDn="), page.indexOf("function DnCalculator(")),
  page.slice(page.indexOf("const valveSpecItem="), page.indexOf("const buildValveSpecItems=")),
  "export { selectValveComponent, valveSpecItem };",
].join("\n");
const { selectValveComponent: select, valveSpecItem: specItem } = await loadTs(url, { [url.href]: source });
const { items } = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));

test("ball valves always use brass lever series for both colours and collector materials", () => {
  for (const dn of [25, 32, 40, 50]) for (const color of ["red", "blue"]) for (const material of ["st20", "aisi304"]) {
    const selected = select(items, "ball", dn, "threaded", 16, color, material);
    const expected = items.find(item => item.family === "Кран шаровой латунный ВР · ручка-рычаг" && item.fields.some(field => field.value === `DN${dn}`));
    assert.equal(selected?.item.id, expected.id);
    assert.equal(selected.price.amount, expected.prices[0].amount);
    assert.equal(selected.material, "Латунь");
    const row = specItem(selected, "ball", { connection: "threaded", pn: 16, color, title: "Контур 2", totalPumpCount: 3 }, dn, "discharge", "04.02", "secondaryDischargeValve", material);
    assert.equal(row.equipmentId, expected.id);
    assert.equal(row.quantity, 3);
    assert.equal(row.status, "selected");
    assert.match(row.details, /Латунь/);
    assert.match(row.details, /Ручка-рычаг/);
    assert.doesNotMatch(row.details, /Красное|Синее|AISI|Чугун/);
  }
});

test("missing brass lever size or price does not fall back to butterfly-handle or other valves", () => {
  assert.equal(select(items, "ball", 65, "threaded", 16, "red", "aisi304"), null);
  const noLever = items.filter(item => !/ручка-рычаг/.test(item.family));
  assert.equal(select(noLever, "ball", 25, "threaded", 16, "blue", "st20"), null);
  const unpriced = items.map(item => /ручка-рычаг/.test(item.family) ? { ...item, prices: [] } : item);
  assert.equal(select(unpriced, "ball", 25, "threaded", 16, "blue", "st20"), null);
});

test("ball-valve exception preserves explicit PN and connection constraints", () => {
  const rated = items.map(item => ({ ...item, family: `${item.family} PN16` }));
  assert.equal(select(rated, "ball", 25, "threaded", 25, "red", "aisi304"), null);
  assert.equal(select(items, "ball", 25, "flanged", 16, "blue", "aisi304"), null);
});

test("butterfly and check valve selection retain colour and material rules", () => {
  const butterfly = select(items, "butterfly", 50, "flanged", 16, "red", "aisi304");
  assert.match(butterfly.item.family, /Красный/);
  const check = select(items, "check", 50, "flanged", 16, "red", "aisi304");
  assert.match(check.item.family, /Красный/);
  assert.match(check.price.label, /Нержавеющая сталь/);
});

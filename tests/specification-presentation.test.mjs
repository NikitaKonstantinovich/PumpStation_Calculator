import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { specificationItemPresentation } = await loadTs(new URL("../app/specification-presentation.ts", import.meta.url));
const item = patch => ({ position: "01", name: "Комплектующее", details: "DN100 · PN16 · Ст20", quantity: 1, status: "selected", ...patch });

test("technical description excludes selection and both pressure warnings without changing the saved row", () => {
  const source = item({
    status: "confirmation", description: "Предупреждение: проверить размеры",
    inletPressureCheck: { baseStatus: "selected", checks: [{ status: "unknown-limit", message: "Допустимое давление на входе неизвестно" }] },
    dischargePressureCheck: { baseStatus: "selected", checks: [{ status: "exceeded", message: "Давление на выходе превышает PN16" }] },
  });
  const saved = structuredClone(source);
  const view = specificationItemPresentation(source);
  assert.equal(view.description, "DN100 · PN16 · Ст20");
  assert.equal(view.hasWarning, true);
  assert.match(view.warningText, /проверить размеры/);
  assert.match(view.warningText, /на входе неизвестно/);
  assert.match(view.warningText, /на выходе превышает PN16/);
  assert.deepEqual(source, saved);
});

test("embedded gasket warning moves to the dialog while selected PN remains visible", () => {
  const warning = "Предупреждение: требуется PN16, выбрана прокладка PN10. Проверьте размеры.";
  const view = specificationItemPresentation(item({
    details: `DN100 · соединение PN16 · паронит · PN прокладки 10 · ⚠ ${warning}`,
    description: warning, status: "confirmation",
  }));
  assert.equal(view.details, "DN100 · соединение PN16 · паронит · PN прокладки 10");
  assert.equal(view.description, view.details);
  assert.equal(view.warningText, warning);
  assert.equal(view.hasWarning, true);
});

test("missing technical data stays in the dialog and retains an accessible warning button", () => {
  const view = specificationItemPresentation(item({ details: "Не заданы параметры коллектора", description: "Коллектор отсутствует в базе", status: "clarify" }));
  assert.equal(view.description, "");
  assert.equal(view.hasWarning, true);
  assert.match(view.warningText, /Не заданы параметры коллектора/);
  assert.match(view.warningText, /отсутствует в базе/);
  const partial = specificationItemPresentation(item({ details: "BP · 3 нас. × мощность не указана", status: "clarify" }));
  assert.equal(partial.description, "BP");
  assert.match(partial.warningText, /мощность не указана/);
});

test("a normal selected component shows its technical data without a warning", () => {
  const view = specificationItemPresentation(item({ description: "Рабочие и резервные насосы", details: "55 кВт · MBL (2026) · 2 раб. + 1 рез." }));
  assert.equal(view.description, "55 кВт · MBL (2026) · 2 раб. + 1 рез.");
  assert.equal(view.hasWarning, false);
});

test("pressure warnings remain available even when the row has selected or clarify status", () => {
  for (const status of ["selected", "clarify"]) {
    const view = specificationItemPresentation(item({ status, dischargePressureCheck: { baseStatus: status, checks: [{ status: "unknown-limit", message: "Недостаточно данных для проверки" }] } }));
    assert.equal(view.hasWarning, true);
    assert.equal(view.description, "DN100 · PN16 · Ст20");
    assert.match(view.warningText, /Недостаточно данных/);
  }
  const normal = specificationItemPresentation(item({ inletPressureCheck: { baseStatus: "selected", checks: [{ status: "within-limit", message: "PN16 не превышен" }] } }));
  assert.equal(normal.hasWarning, false);
});

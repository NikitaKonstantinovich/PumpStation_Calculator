import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { loadTs } from "./load-ts.mjs";

const exportUrl = new URL("../app/specification-export.ts", import.meta.url);
const source = (await readFile(exportUrl, "utf8")).replace('import("exceljs")', `import(${JSON.stringify(import.meta.resolve("exceljs"))})`);
const { specificationExportRows, specificationCsv, specificationExportBlob } = await loadTs(exportUrl, { [exportUrl.href]: source });
const groups = [
  { title: "Насосы", sections: [{ id: "pump" }] },
  { title: "Сборочный комплект гидравлики", sections: [{ id: "suction", title: "Всасывающая линия" }, { id: "discharge", title: "Напорная линия" }] },
];
const item = patch => ({ position: "01", name: "Насос", section: "pump", details: "22 кВт", quantity: 3, unit: "шт.", price: 123.45, status: "selected", ...patch });
const sample = () => [
  item({ position: "04.02", name: "Коллектор", section: "discharge", quantity: 1, price: null, details: "DN100 · PN16", status: "clarify", description: "Цена не указана" }),
  item({ position: "03.01", name: "Затвор", section: "suction", quantity: 2, price: 10.25, details: "DN50 · PN16" }),
  item({}),
];

test("exports displayed section order, current prices, units and warnings without changing items", () => {
  const items = sample(), saved = structuredClone(items);
  const rows = specificationExportRows(items, groups);
  assert.deepEqual(rows.filter(row => row.kind === "item").map(row => row.cells[0]), ["01", "03.01", "04.02"]);
  const pump = rows.find(row => row.kind === "item" && row.cells[0] === "01");
  assert.deepEqual(pump.cells, ["01", "Насос", 3, "шт.", 123.45, 370.35, "22 кВт", ""]);
  const missing = rows.find(row => row.kind === "item" && row.cells[0] === "04.02");
  assert.deepEqual(missing.cells.slice(4, 7), [null, null, "DN100 · PN16"]);
  assert.match(missing.cells[7], /Цена не указана/);
  assert.equal(rows.find(row => row.kind === "group" && row.cells[1] === "Сборочный комплект гидравлики").cells[5], 20.5);
  assert.deepEqual(rows.at(-1).cells, [null, "Итоговая стоимость", null, null, null, 390.85, null, "По заполненным ценам"]);
  assert.deepEqual(items, saved);
});

test("zero prices and decimal quantities remain numeric; an empty specification has a zero total", () => {
  const rows = specificationExportRows([item({ quantity: 1.5, price: 0, unit: "м" })], groups);
  assert.deepEqual(rows.find(row => row.kind === "item").cells.slice(2, 6), [1.5, "м", 0, 0]);
  assert.equal(rows.at(-1).cells[7], "");
  assert.equal(specificationExportRows([], groups).at(-1).cells[5], 0);
});

test("CSV keeps Cyrillic, quotes, separators and line breaks, and neutralizes formula-like text", async () => {
  const rows = specificationExportRows([item({ name: 'Насос; "А"\nвторая строка', details: '=HYPERLINK("bad")', quantity: 1.5 })], groups);
  const blob = await specificationExportBlob(rows, "csv");
  assert.equal(blob.type, "text/csv;charset=utf-8");
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const csv = specificationCsv(rows);
  assert.ok(csv.startsWith('\uFEFF"№";"Наименование";'));
  assert.ok(csv.includes('"Насос; ""А""\nвторая строка";1,5;"шт.";123,45;185,175;'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.endsWith("\r\n"));
  for (const text of ["+SUM(1)", "-1+1", "@SUM(1)", " \t=1+1"]) {
    assert.ok(specificationCsv([{ kind: "item", cells: [text] }]).includes(`"'${text}"`));
  }
});

test("XLSX is a readable workbook with text position identifiers, numbers, totals and warning notes", async () => {
  const rows = specificationExportRows(sample(), groups);
  const blob = await specificationExportBlob(rows, "xlsx");
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  assert.equal(workbook.worksheets.length, 1);
  const sheet = workbook.getWorksheet("Спецификация");
  assert.equal(sheet.rowCount, rows.length);
  assert.equal(sheet.views[0].ySplit, 1);
  assert.equal(sheet.getRow(1).getCell(1).value, "№");
  assert.equal(sheet.getRow(1).getCell(1).font.bold, true);
  for (let index = 0; index < rows.length; index++) {
    rows[index].cells.forEach((value, column) => assert.equal(sheet.getRow(index + 1).getCell(column + 1).value ?? null, value));
  }
  const pumpIndex = rows.findIndex(row => row.kind === "item" && row.cells[0] === "01") + 1;
  assert.equal(sheet.getRow(pumpIndex).getCell(1).type, ExcelJS.ValueType.String);
  assert.equal(sheet.getRow(pumpIndex).getCell(3).type, ExcelJS.ValueType.Number);
  assert.equal(sheet.getRow(pumpIndex).getCell(5).numFmt, "#,##0.00");
  const missingIndex = rows.findIndex(row => row.kind === "item" && row.cells[0] === "04.02") + 1;
  assert.equal(sheet.getRow(missingIndex).getCell(5).value, null);
  assert.equal(sheet.getRow(missingIndex).getCell(6).value, null);
  assert.match(sheet.getRow(missingIndex).getCell(8).value, /Цена не указана/);
});

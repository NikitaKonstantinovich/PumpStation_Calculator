import { readFile, writeFile } from "node:fs/promises";

// Keep the authoritative workbook values and provenance without shipping formula
// dependency graphs in the server bundle. D1 remains authoritative when imported.
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const ids = new Set(["трубы", "переходы", "фланцы", "воротники", "сгоны-резьба", "метизы", "затворы", "работы", "резьбовые-фитинги", "заглушки", "ответные-части"]);
const data = {
  source: source.source,
  collectorReference: source.collectorReference,
  items: source.items.filter(item => ids.has(item.catalogId)).map(({ id, catalogId, tableId, family, sourceSheet, sourceRow, fields, prices }) => ({
    id, catalogId, tableId, family, sourceSheet, sourceRow,
    fields: fields.map(({ column, headerPath, value }) => ({ column, headerPath, value })),
    prices,
  })),
};
await writeFile(new URL("../public/component-insert-source.json", import.meta.url), `${JSON.stringify(data)}\n`);

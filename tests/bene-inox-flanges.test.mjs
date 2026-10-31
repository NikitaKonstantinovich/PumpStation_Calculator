import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = async path => JSON.parse(await readFile(new URL("../" + path, import.meta.url), "utf8"));
test("retired Bene Inox evidence is retained but not offered in shipped catalogues", async () => {
  const reference = await read("data/bene-inox-flanges.json");
  assert.equal(reference.rows.length, 5);
  assert.equal(reference.rows.find(r => r.dn === 350).price, null);
  for (const path of ["public/binding-components.json", "public/component-insert-source.json"]) {
    const source = await read(path);
    assert.ok(!source.items.some(r => r.tableId === reference.id));
  }
  const collector = await read("public/collector-catalog.json");
  assert.ok(!collector.components.some(r => r.id.startsWith("bene-inox-5714:")));
});

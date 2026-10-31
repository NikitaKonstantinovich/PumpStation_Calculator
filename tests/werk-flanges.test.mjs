import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("retired WERK flanges are absent from all shipped active catalogues", async () => {
  for (const path of ["binding-components", "collector-catalog", "component-insert-source"]) {
    const text = await readFile(new URL("../public/" + path + ".json", import.meta.url), "utf8");
    assert.ok(!text.includes("werk-iso-pn16:"), path);
  }
});

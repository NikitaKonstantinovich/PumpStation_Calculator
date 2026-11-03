import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const manual = await loadTs(new URL("../app/manual-pump.ts", import.meta.url));
const { usablePump } = await loadTs(new URL("../app/pump-catalog.ts", import.meta.url));
const { mergePumpCatalog } = await loadTs(new URL("../app/pump-catalog-client.ts", import.meta.url));
const { buildPumpSelection } = await loadTs(new URL("../app/pump-selection.ts", import.meta.url));

test("a pump needs only its model and incomplete characteristics stay unknown", () => {
  const pump = manual.parseManualPump({ model: "  Ручной насос 10  " }, "manual-test");
  assert.equal(pump.model, "Ручной насос 10");
  assert.equal(pump.type, "unknown"); assert.equal(pump.medium, "water");
  assert.equal(pump.manualEntry, true);
  for (const key of ["power", "price", "priceCurrency", "nominalFlow", "minFlow", "maxHead", "efficiency", "ratedHead", "weightKg"]) assert.equal(pump[key], null, key);
  assert.deepEqual(pump.curve, []); assert.equal(usablePump(pump), false);
  assert.throws(() => manual.parseManualPump({}, "id"), /Укажите модель/);
  assert.throws(() => manual.parseManualPump({ model: "  " }, "id"), /Укажите модель/);
});

test("numeric data, nested characteristics and all file paths survive save and edit round trips", () => {
  const data = { ...manual.manualPumpDraft(), model: "Sample 10", manufacturer: "Brand", series: "VM", article: "000123", type: "vertical_multistage", medium: "water",
    power: "2,5", voltage: "3×380", current: "5.4", nominalFlow: "10", efficiency: "72", inletDn: "40", outletDn: "32", inletType: "flange", inletPn: "16", outletType: "threaded", outletThread: 'G 1¼',
    bodyMaterial: "AISI304", overallLength: "320", baseWidth: "160", weightKg: "29.2", price: "0", priceCurrency: "RUB", discountPercent: "0", priceKind: "net",
    imagePath: "E:\\Каталог насосов\\Sample\\photo.png", drawingPath: "\\\\server\\drawings\\Sample.pdf", modelPath: "E:\\Модели\\Sample.STEP", active: false, selectable: false,
    curve: "20; 35\n0; 60\n10; 50", efficiencyCurve: "10; 72\n20; 70", powerCurve: "10; 2,5", npshCurve: "10; 2",
  };
  const pump = manual.parseManualPump(data, "manual-fixture");
  assert.equal(pump.power, 2.5); assert.equal(pump.article, "000123");
  assert.equal(pump.electric.current_a, 5.4); assert.equal(pump.dimensions.overall_length, 320);
  assert.equal(pump.inlet.pressure_class, 16); assert.equal(pump.inlet.type, "flange");
  assert.equal(pump.assets.imagePath, data.imagePath); assert.equal(pump.assets.drawingPath, data.drawingPath); assert.equal(pump.assets.modelPath, data.modelPath);
  assert.equal(pump.drawing, null); assert.equal(pump.price, 0); assert.equal(pump.discountPercent, 0);
  assert.deepEqual(pump.curve, [[0, 60], [10, 50], [20, 35]]);
  const reloaded = manual.parseManualPump(manual.manualPumpDraft(JSON.parse(JSON.stringify(pump))), pump.id);
  assert.deepEqual(reloaded, pump);
});

test("only browser paths become a drawing URL, and unsafe asset schemes are rejected", () => {
  for (const path of ["/drawings/pump.png", "https://example.test/pump.png"]) {
    const pump = manual.parseManualPump({ model: "Pump", drawingPath: path }, "manual-path");
    assert.equal(pump.drawing, path); assert.equal(pump.drawingSource, "Ручное заполнение");
  }
  for (const path of ["javascript:alert(1)", "data:image/svg+xml,test", "vbscript:test"]) assert.throws(() => manual.parseManualPump({ model: "Pump", imagePath: path }, "manual-path"), /путь к файлу/);
  for (const path of ["//example.test/x", "E:\\x.png", "file:///E:/x.png", "javascript:alert(1)", "https://user:password@example.test/x"]) assert.equal(manual.browserAssetPath(path), null, path);
});

test("supplied values must be valid but omitted fields and a single complete curve point can be saved", () => {
  for (const bad of [{ power: "no" }, { power: "-1" }, { efficiency: "101" }, { price: "-1" }, { type: "bad" }, { active: "true" }, { minFlow: "20", maxFlow: "10" }, { minHead: "20", maxHead: "10" },
    { curve: "10;" }, { curve: "10; NaN" }, { curve: "10; -5" }, { curve: "10; 20\n10; 25" }, { efficiencyCurve: "10; 101" }]) {
    assert.throws(() => manual.parseManualPump({ model: "Pump", ...bad }, "id"), manual.ManualPumpError, JSON.stringify(bad));
  }
  const partial = manual.parseManualPump({ model: "Pump", curve: "10; 50", maxFlow: "20" }, "id");
  assert.equal(partial.maxFlow, 20); assert.equal(partial.minFlow, null); assert.equal(usablePump(partial), false);
});

test("completing a manual pump makes it selectable in the merged catalogue without changing imported pumps", () => {
  const pump = manual.parseManualPump({ model: "Manual", curve: "0; 60\n100; 50\n200; 40", power: "3" }, "manual-new");
  const imported = [{ ...pump, id: "bundled", model: "Imported" }], snapshot = structuredClone(imported);
  const merged = mergePumpCatalog(imported, [pump, { ...pump, id: "bundled", model: "Should not overwrite" }]);
  assert.deepEqual(merged.map(pump => pump.model), ["Imported", "Manual"]); assert.deepEqual(imported, snapshot);
  const result = buildPumpSelection(merged, { flowRate: 100, head: 50, staticHead: 10, workingPumpCount: 1, medium: "water" }, { usdRate: 85, cnyRate: 13, manufacturerDiscounts: { cnp: 0, aquastrong: 0 } });
  assert.equal(result.candidates.length, 2); assert.equal(result.candidates.some(row => row.pump.id === pump.id), true);
});

test("manual pump API persists partial entries, enforces admin writes and handles duplicates and revision conflicts", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const database = { prepare(sql) { let args = []; return {
    bind(...values) { args = values; return this; }, async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { success: true, results: sqlite.prepare(sql).all(...args) }; },
    async run() { const result = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
  }; }, async batch(statements) { sqlite.exec("BEGIN"); try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec("COMMIT"); return result; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } };
  globalThis.__manualPumpTest = { database, user: null };
  const replacements = { [new URL("../app/auth-server.ts", import.meta.url).href]: 'export const db=()=>globalThis.__manualPumpTest.database; export const currentUser=async()=>globalThis.__manualPumpTest.user; export const json=(body,status=200,headers)=>Response.json(body,{status,headers});' };
  const route = await loadTs(new URL("../app/api/pumps/route.ts", import.meta.url), replacements);
  const get = (query = "") => route.GET(new Request(`http://local/api/pumps${query}`));
  const send = (method, data, headers = {}) => route[method](new Request("http://local/api/pumps", { method, headers, body: JSON.stringify(data) }));
  try {
    for (const method of ["POST", "PATCH"]) assert.equal((await send(method, {})).status, 401);
    assert.equal((await get()).status, 401);
    for (const role of ["base", "plus", "pro"]) {
      globalThis.__manualPumpTest.user = { id: role, role };
      assert.equal((await get()).status, 200);
      assert.equal((await get("?manage=1")).status, 403);
      for (const method of ["POST", "PATCH"]) assert.equal((await send(method, {})).status, 403);
    }
    globalThis.__manualPumpTest.user = { id: "admin", role: "admin" };
    assert.equal((await send("POST", { data: { model: "Pump" } }, { origin: "https://other.example" })).status, 403);
    assert.equal((await send("POST", { data: { model: "Pump" } }, { "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await send("POST", { data: {} })).status, 400);
    assert.equal((await send("POST", { data: { model: "x".repeat(256001) } })).status, 413);
    const createdResponse = await send("POST", { data: { model: "Manual A", manufacturer: "Brand", modelPath: "E:\\Pumps\\a.step" } });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).record;
    assert.equal(created.revision, 1); assert.match(created.pump.id, /^manual-/);
    assert.equal(created.pump.assets.modelPath, "E:\\Pumps\\a.step");
    assert.equal((await send("POST", { data: { model: " manual  A ", manufacturer: "brand" } })).status, 409);
    const stored = (await (await get("?manage=1")).json()).records;
    assert.deepEqual(stored, [created]);
    const data = { ...manual.manualPumpDraft(created.pump), power: "3", curve: "0; 60\n100; 50\n200; 40" };
    const patched = await send("PATCH", { id: created.pump.id, revision: 1, data });
    assert.equal(patched.status, 200);
    const updated = (await patched.json()).record; assert.equal(updated.revision, 2); assert.equal(usablePump(updated.pump), true);
    assert.equal((await send("PATCH", { id: created.pump.id, revision: 1, data: { model: "Stale" } })).status, 409);
    assert.deepEqual((await (await get("?manage=1")).json()).records, [updated]);
    globalThis.__manualPumpTest.user = { id: "base", role: "base" };
    const publicData = await (await get()).json();
    assert.deepEqual(publicData, { pumps: [updated.pump] });
    assert.equal(JSON.stringify(publicData).includes("created_by"), false);
    sqlite.exec(await readFile(new URL("../drizzle/0012_manual_pumps.sql", import.meta.url), "utf8"));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM manual_pumps").get().count, 1);
  } finally { sqlite.close(); delete globalThis.__manualPumpTest; }
});

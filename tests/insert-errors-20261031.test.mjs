import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";
import { mergeReducerDimensions, reducerReferenceMaps } from "../scripts/reducer-dimensions-supplement.mjs";
import { mergeThreadEnds } from "../scripts/thread-ends.mjs";
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const source = await json("../public/binding-components.json");
const standards = await json("../data/component-insert-standards.json");
const policy = await json("../data/flange-boring-policy.json");
const { makeInsertCatalog } = await loadTs(new URL("../app/component-insert-catalog.ts", import.meta.url));
const { generateInsertCalculations, generateInsertCandidates } = await loadTs(new URL("../app/component-insert-calculations.ts", import.meta.url));
const { planFlangeBoring } = await loadTs(new URL("../app/component-flange-boring.ts", import.meta.url));
const catalog = makeInsertCatalog(source);
const rows = generateInsertCalculations({ dnFrom:50, dnTo:400, materials:["aisi304"], withSensorNipple:true, includeEccentric:true }, catalog);

test("DN32 and DN40 select matching weld diameters in compact thread/collar inserts", () => {
  const calculated = generateInsertCalculations({
    dnFrom:32, dnTo:40, materials:["aisi304"], withSensorNipple:false, includeEccentric:false,
  }, catalog);
  for (const [dn, diameter, article, length] of [[32,42.4,17410,65], [40,48.3,17411,67]]) {
    for (const pn of [10,16]) {
      const row = calculated.find(r => r.dnLarge === dn && r.dnSmall === dn && r.pn === pn &&
        r.leftConnection === "threaded" && r.rightConnection === "collar");
      assert.ok(row?.complete, JSON.stringify(row?.warnings));
      const base = catalog.parts.find(p => p.id === row.bom.find(b => b.role === "base").componentId);
      const collar = catalog.parts.find(p => p.id === row.bom.find(b => b.role === "right-collar").componentId);
      assert.equal(base.id, `thread-end:dnru-d270-${article}`);
      assert.equal(base.outerDiameter, diameter);
      assert.equal(collar.outerDiameter, diameter);
      assert.ok(row.bom.some(b => b.role === "right-looseFlange"));
      assert.equal(row.totalLengthMm, length);
      assert.equal(row.weldLengthMm, 2 * Math.PI * diameter);
      assert.ok(row.price > 0);
    }
    assert.ok(!calculated.some(r => r.dnLarge === dn && r.pn === 25 && r.leftConnection === "threaded"));
  }
});

test("weld diameter tolerance applies below 4 mm and preserves the source diameters", () => {
  const input = { dnFrom:40, dnTo:40, materials:["aisi304"], withSensorNipple:false, includeEccentric:false };
  const id = "thread-end:newkey-nk-ne40-4";
  for (const [outerDiameter,difference,complete] of [[48,0.3,true], [44.301,3.999,true], [44.3,4,false], [44.2,4.1,false]]) {
    const parts = catalog.parts.map(part => part.id === id ? {...part,outerDiameter} : part);
    const result = generateInsertCandidates(input,{...catalog,parts}).find(row => row.pn===16 &&
      row.leftConnection==="threaded" && row.rightConnection==="collar" &&
      row.bom.some(part=>part.role==="base" && part.componentId===id));
    assert.ok(result);
    assert.equal(result.complete,complete,result.warnings.join(" "));
    assert.equal(JSON.parse(result.configuration.base)[6],outerDiameter);
    assert.equal(JSON.parse(result.configuration.right.part)[6],48.3);
    if (complete) assert.equal(result.welds[0].acceptedDiameterDifferenceMm,difference);
    else assert.ok(result.warnings.some(w=>w.includes("должна быть меньше 4 мм")));
  }
});

test("DN50 thread/collar uses a real OD60.3 ready end, retains price and excludes PN25", () => {
  for (const pn of [10,16]) {
    const row = rows.find(r=>r.dnLarge===50 && r.dnSmall===50 && r.pn===pn && r.leftConnection==="threaded" && r.rightConnection==="collar");
    assert.ok(row?.complete); assert.equal(row.totalLengthMm,73);
    assert.ok(row.bom.some(p=>p.componentId==="thread-end:dnru-d270-17412" && p.unitPrice===915));
  }
  assert.equal(catalog.parts.find(p=>p.id==="thread-end:newkey-nk-ne50-4").outerDiameter,60,"source dimensions are not forged to match");
  assert.ok(!rows.some(r=>r.pn===25 && r.bom.some(p=>p.componentId==="thread-end:dnru-d270-17412")));
});

test("nominal fit is a scoped, sourced assumption; undersize and explicit clearance remain blocking", () => {
  const input={side:"left",flangeId:"fixture",dn:250,pn:16,material:"aisi304",originalBoreMm:273,baseOuterDiameterMm:273,originalSource:"fixture",baseSource:"fixture"};
  const result=planFlangeBoring(input,policy,[]);
  assert.equal(result.operation,null); assert.deepEqual(result.warnings,[]); assert.match(result.assumptions[0].message,/проверить при сборке/);
  for (const patch of [{originalBoreMm:272.9},{dn:300},{material:"st20"},{pn:40}]) assert.ok(planFlangeBoring({...input,...patch},policy,[]).warnings.length);
  assert.ok(planFlangeBoring(input,{...policy,diametralClearanceMm:0.5,clearanceSource:"fixture"},[]).warnings.length);
  assert.ok(planFlangeBoring(input,{...policy,nominalFit:{...policy.nominalFit,source:""}},[]).warnings.length);
});

test("DN250-125 and DN300-150 calculate both reducer geometries for each PN; pressure exception stays visible", () => {
  for (const dn of [250,300]) for (const pn of [10,16,25]) for (const geometry of ["concentric","eccentric"]) {
    const row=rows.find(r=>r.dnLarge===dn && r.dnSmall===(dn===250?125:150) && r.pn===pn && r.geometry===geometry);
    assert.ok(row?.complete,JSON.stringify(row?.warnings)); assert.ok(row.price>0);
    if (dn===300) { assert.equal(row.baseLengthMm,203); assert.ok(row.assumptions.some(a=>a.code==="reducer-analogue-length")); }
    if (pn===25) assert.ok(row.assumptions.some(a=>a.code==="sensor-pn25-pressure"));
  }
  const large=rows.filter(r=>r.dnLarge===400 && r.dnSmall===300);
  assert.ok(large.length); assert.ok(large.every(r=>r.baseLengthMm===356));
  assert.ok(large.filter(r=>r.pn===10).every(r=>!r.complete && r.warnings.some(w=>/426/.test(w))),"a flange for OD426 cannot be silently applied to OD406.4");
  const iso = large.filter(r=>r.pn===16);
  assert.ok(iso.length);
  assert.ok(iso.every(r=>r.complete && r.bom.some(b=>b.componentId==="fginox-iso-pn16:2PAS16400")), "PN16 uses the sourced ISO execution for OD406.4");
});

test("adopted analogue lengths are limited to the approved physical records and do not change prices", () => {
  const result=mergeReducerDimensions(source,standards);
  for (const rule of standards.reducerAnalogueLengthPolicy.rows) {
    const before=source.items.find(p=>p.id===rule.componentId),after=result.items.find(p=>p.id===rule.componentId);
    assert.deepEqual(after.prices,before.prices);
    assert.equal(after.fields.find(f=>f.column==="CALC_INSERT_LENGTH_MM").value,rule.lengthMm);
  }
  assert.deepEqual(mergeReducerDimensions(result,standards),result);
  for (const key of ["wallThickness","outerDiameterSmall","lengthMm"]) {
    const changed=structuredClone(standards);changed.reducerLengths.find(r=>r.basis==="project-analogue-length")[key]+=1;
    assert.throws(()=>reducerReferenceMaps(changed),/project analogue/);
  }
  const changed=structuredClone(source),id=standards.reducerAnalogueLengthPolicy.rows[0].componentId;
  changed.items.find(p=>p.id===id).fields.find(f=>f.headerPath.at(-1)==="Толщина 1, мм").value=100;
  assert.equal(makeInsertCatalog(changed).parts.find(p=>p.id===id).lengthMm,null);
});

test("adding a thread end updates the existing table index without resetting user edits", async () => {
  const reference=await json("../data/thread-ends.json"),input=structuredClone(source),id="thread-end:dnru-d270-17412";
  input.items=input.items.filter(p=>p.id!==id);
  const table=input.catalogs.find(c=>c.id==="сгоны-резьба").tables.find(t=>t.id==="ready-thread-ends-aisi304-20261030");
  table.recordIds=table.recordIds.filter(x=>x!==id);
  input.items.find(p=>p.id==="thread-end:newkey-nk-ne50-4").prices[0].amount=999;
  const output=mergeThreadEnds(input,reference);
  assert.ok(output.catalogs.find(c=>c.id==="сгоны-резьба").tables.find(t=>t.id===table.id).recordIds.includes(id));
  assert.equal(output.items.find(p=>p.id==="thread-end:newkey-nk-ne50-4").prices[0].amount,999);
  assert.deepEqual(mergeThreadEnds(output,reference),output);
});

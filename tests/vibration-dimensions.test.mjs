import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadTs } from "./load-ts.mjs";
const json = async path => JSON.parse(await readFile(new URL(path,import.meta.url),"utf8"));
const binding = await json("../public/binding-components.json"), reference = await json("../data/vibration-dimensions.json");
const { mergeVibrationDimensions, vibrationExecutions, vibrationExecution } = await loadTs(new URL("../app/vibration-dimensions.ts",import.meta.url));
const { lineGeometry } = await loadTs(new URL("../app/line-geometry-catalog.ts",import.meta.url));
const model = await loadTs(new URL("../app/model-editor/model.ts",import.meta.url));
const { componentPressureLimit } = await loadTs(new URL("../app/suction-pressure.ts",import.meta.url));
const item = dn => binding.items.find(item=>item.catalogId==="компенсаторы" && item.fields.some(f=>f.headerPath.at(-1)==="DN" && f.value===`DN${dn}`));
const expected = {40:95,50:105,65:115,80:135,100:150,125:165,150:180,200:205,250:230,300:245,500:265,700:265};

test("sourced KMS lengths persist per exact PN, preserve price rows and survive repeated build merges", () => {
  const merged=mergeVibrationDimensions(binding,reference);
  assert.deepEqual(mergeVibrationDimensions(merged,reference),merged);
  assert.equal(merged.items.length,binding.items.length);
  for (const before of binding.items) assert.deepEqual(merged.items.find(item=>item.id===before.id).prices,before.prices);
  for (const [dn,length] of Object.entries(expected)) for (const pn of [10,16]) {
    const row=vibrationExecution(item(Number(dn)),pn);
    assert.equal(row.status,"confirmed");assert.equal(row.lengthMm,length);
    assert.match(row.source,/dendor\.ru\/re\/kms\.pdf/);
    assert.equal(item(Number(dn)).fields.find(f=>f.column===`KMS_MOUNTING_PN${pn}_L`).value,length);
  }
  assert.equal(reference.rows.flatMap(row=>row.executions).filter(e=>e.status==="confirmed").length,24);
  assert.ok(binding.items.filter(item=>item.catalogId==="компенсаторы").every(item=>!item.fields.some(f=>/^(?:Строительная длина|Длина|L), мм$/i.test(f.headerPath.at(-1)??""))));
});

test("alternative L values are not mistaken for pressure columns; PN25 and mismatching identities stay unresolved", () => {
  assert.equal(vibrationExecution(item(200),16).lengthMm,205,"both PN executions match the documented 205 mm STEP, not an invented PN16=210 rule");
  for (const dn of [350,400,600,800]) for (const pn of [10,16]) {
    const row=vibrationExecution(item(dn),pn);
    assert.equal(row.status,"ambiguous");assert.equal(row.lengthMm,undefined);assert.equal(row.cad,undefined);
  }
  for (const row of binding.items.filter(item=>item.catalogId==="компенсаторы")) assert.equal(vibrationExecution(row,25).lengthMm,undefined);
  const changed=structuredClone(item(65));changed.fields.find(f=>f.headerPath.at(-1)==="DN").value="DN80";
  assert.deepEqual(vibrationExecutions(changed),[]);
  changed.family="Другой компенсатор";assert.deepEqual(vibrationExecutions(changed),[]);
  const other=structuredClone(binding);other.source.sha256="f".repeat(64);assert.deepEqual(mergeVibrationDimensions(other,reference),other);
  const onlyReview=structuredClone(item(80));onlyReview.fields=onlyReview.fields.filter(f=>f.column.startsWith("KMS_MOUNTING_") || f.headerPath.at(-1)==="DN");
  assert.equal(componentPressureLimit(onlyReview),null,"mentioning unverified PN25 in dimensional metadata must not create a pressure rating");
});

test("reviewed KMS STEP meshes use the outer elastomer faces and full L without stretching or extra flange length", () => {
  for (const row of reference.rows) for (const e of row.executions.filter(e=>e.cad)) {
    const g=lineGeometry(item(row.dn),{parts:[],version:"test"},{flanges:{},models:{}}).vibrationModels.find(m=>m.pn===e.pn);
    assert.equal(g.length,e.lengthMm);assert.equal(g.fidelity,"cad");assert.equal(g.shape.kind,"mesh");
    const left=model.add(model.rotate([e.cad.planesMm[0],0,0],g.shape.modelRotation),g.shape.modelPosition);
    const right=model.add(model.rotate([e.cad.planesMm[1],0,0],g.shape.modelRotation),g.shape.modelPosition);
    assert.deepEqual(left,[0,0,0]);assert.deepEqual(right,[e.lengthMm,0,0]);
    assert.ok(e.cad.matingAreasMm2.every(area=>area>row.dn*row.dn*.1));
    assert.equal(e.separateGasket,false);
  }
  const mismatch=lineGeometry(item(500),{parts:[],version:"test"},{flanges:{},models:{}}).vibrationModels.find(m=>m.pn===16);
  assert.equal(mismatch.length,265);assert.equal(mismatch.shape.kind,"marker");assert.equal(mismatch.shape.lengthMm,265);
  assert.ok(mismatch.issues.some(i=>/245/.test(i)),"a shorter CAD must not be stretched to the documented length");
  assert.equal(lineGeometry(item(80),{parts:[],version:"test"},{flanges:{},models:{}}).length,null,"the common response must wait for PN selection");
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { makeCollectorCatalog } = await loadTs(new URL("../app/collector-catalog.ts", import.meta.url));
const { calculateCollector } = await loadTs(new URL("../app/collector-calculations.ts", import.meta.url));
const { selectJointFasteners } = await loadTs(new URL("../app/line-spec-parts.ts", import.meta.url));
const { createProject } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const { synchronizeCollectors } = await loadTs(new URL("../app/collector-project.ts", import.meta.url));
const source = JSON.parse(await readFile(new URL("../public/binding-components.json", import.meta.url), "utf8"));
const config = (material = "st20", pn = 16, dn = 80) => ({ type:"discharge", dn:100, pn, material, connection:"flanged", eccentric:false, stationType:"utility", simultaneous:false, jockey:false,
  primary:{flow:60,working:2,reserve:1,dn,connection:"flanged",spacing:500,pn}, secondary:null });

test("collector references use the same full standard 017W bolts as station hardware for every material, DN and PN", () => {
  const catalog = makeCollectorCatalog(source);
  assert.equal(catalog.valveBolts.length, 120);
  for (const ref of catalog.valveBolts) {
    const selected = selectJointFasteners(source, ref.material, ref.dn, ref.pn, true);
    assert.equal(ref.length, selected.standardLength);
    assert.equal(ref.minimumLengthMm, selected.length);
    assert.equal(ref.componentId, selected.bolt?.id ?? null);
    assert.match(ref.source, /017W/);
  }
  for (const material of ["st20", "aisi304"]) for (const pn of [10,16,25]) for (const dn of [32,40,50,65,80,100]) {
    const c = config(material,pn,dn), r = calculateCollector(c,catalog), selected = selectJointFasteners(source,material,dn,pn,true);
    const main = catalog.components.find(part => part.kind === "pipe" && part.material === material && part.dn === 100 && part.pn === pn);
    assert.equal(r.branchLengthsMm[0], selected.warnings.length ? null : main.outerDiameter/2 + 1.1*selected.standardLength);
  }
});

test("both circuits use their own valve DN/PN; old flange bolts never size the branches", () => {
  const catalog = makeCollectorCatalog(source), c = config(); c.stationType="combined";
  c.secondary={...c.primary,dn:50,pn:10,working:1,reserve:0};
  for (const old of catalog.bolts) old.length=9999;
  const result=calculateCollector(c,catalog);
  assert.deepEqual(result.branchBoltReferences.map(ref=>[ref.dn,ref.pn,ref.length]),[[80,16,120],[50,10,105]]);
  assert.deepEqual(result.branchLengthsMm,[186,169.5]);
  assert.deepEqual(calculateCollector({...c,type:"suction"},catalog).branchLengthsMm,result.branchLengthsMm);
  assert.ok(result.bom.every(part=>!["bolt","nut","washer"].includes(part.kind)));
  const oldOnly={...catalog};delete oldOnly.valveBolts;
  assert.deepEqual(calculateCollector(c,oldOnly).branchLengthsMm,[null,null]);
});

test("missing valve body, hardware or flange dimensions cannot fall back to flange-pair bolts or minimum lengths", () => {
  for (const mutate of [
    data => { data.items=data.items.filter(item=>!item.fields.some(field=>field.headerPath.at(-1)==="Наименование" && /^Болт /.test(String(field.value)))); },
    data => { data.items=data.items.filter(item=>!item.fields.some(field=>field.headerPath.at(-1)==="Наименование" && /^Гайка /.test(String(field.value)))); },
    data => { for(const item of data.items.filter(item=>item.catalogId==="фланцы")) item.fields=item.fields.filter(field=>field.column!=="CALC_FLANGE_B"); },
  ]) {
    const data=structuredClone(source);mutate(data);const r=calculateCollector(config(),makeCollectorCatalog(data));
    assert.equal(r.branchLengthsMm[0],null);assert.equal(r.price,null);assert.equal(r.complete,false);
    assert.ok(r.warnings.some(reason=>/Контур 1/.test(reason)));
  }
  const r=calculateCollector(config("st20",16,25),makeCollectorCatalog(source));
  assert.equal(r.branchLengthsMm[0],null);assert.match(r.warnings.join("; "),/отсутствует длина корпуса затвора/);
});

test("old saved calculations remain available for refresh but cannot supply a ready price", () => {
  let p=createProject();Object.assign(p.entities["system-input"],{flowRate:60,workingPumpCount:2,reservePumpCount:1});
  Object.assign(p.entities["station-dn"],{suctionCollectorDn:100,dischargeCollectorDn:100,suctionValveDn:80,dischargeValveDn:80,pn:16,connectionType:"flanged",collectorMaterial:"st20"});
  p=synchronizeCollectors(p);const card=p.entities["station-collectors"].discharge;
  card.calculation=calculateCollector(card.configuration,makeCollectorCatalog(source));delete card.calculation.branchLengthRule;
  card.calculationSourceFingerprint=card.sourceFingerprint;
  card.database={id:"legacy",code:card.code,price:1,calculation:card.calculation};card.databaseStatus="found";
  p=synchronizeCollectors(p);assert.equal(p.entities["station-collectors"].discharge.status,"stale");
  assert.equal(p.entities["station-collectors"].discharge.database.id,"legacy");
  assert.equal(p.entities["station-spec"].items.find(row=>row.option==="dischargeCollector").price,null);
});

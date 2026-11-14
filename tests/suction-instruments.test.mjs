import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const {selectSuctionInstruments:select,selectDischargeInstruments,pressureRange}=await loadTs(new URL("../app/suction-instruments.ts",import.meta.url));
const {items}=JSON.parse(await readFile(new URL("../public/binding-components.json",import.meta.url),"utf8"));
const synthetic=(family,range,id="test")=>({id,family,fields:[{headerPath:["Давление, МПа"],value:range}],prices:[]});

test("signed catalogue ranges preserve zero, commas and vacuum",()=>{
  assert.deepEqual(pressureRange(synthetic("Мановакуумметр","−0,1…0,15")),{min:-.1,max:.15});
  assert.deepEqual(pressureRange(synthetic("Манометр","0...0,6")),{min:0,max:.6});
  assert.equal(pressureRange(synthetic("Манометр","0,6")),null);
  assert.equal(pressureRange(synthetic("Манометр","1…0")),null);
  assert.deepEqual(pressureRange(items.find(x=>x.id==="кипиа-002-r0015")),{min:.1,max:1});
});

test("suction selects the gauge and switch with the lowest available upper limits", () => {
  const [gauge, relay] = select(items);
  assert.equal(gauge.item.id, "кипиа-001-r0005");
  assert.match(gauge.details, /0…0,6 МПа/);
  assert.equal(relay.item.id, "кипиа-002-r0013");
  assert.match(relay.details, /-0,05…0,3 МПа/);
  assert.equal(gauge.warning, undefined);
  assert.equal(relay.warning, undefined);
});

test("equal upper limits favor a lower lower limit, independent of catalogue order", () => {
  const candidates = [
    synthetic("Манометр", "0…0,15", "positive"),
    synthetic("Мановакуумметр", "-0,1…0,15", "vacuum"),
    synthetic("Мановакуумметр", "-0,2…0,16", "higher-upper"),
    synthetic("Реле давления", "0…0,15", "positive-relay"),
    synthetic("Реле давления", "-0,05…0,15", "vacuum-relay"),
    synthetic("Преобразователь давления", "0…0,01", "not-a-gauge-or-switch"),
  ];
  for (const catalogue of [candidates, [...candidates].reverse()]) {
    assert.deepEqual(select(catalogue).map(result => result.item.id), ["vacuum", "vacuum-relay"]);
  }
});

test("a device with an invalid range does not replace a missing suction instrument", () => {
  const [gauge, relay] = select([synthetic("Манометр", "0,6", "invalid"), synthetic("Реле давления", "0…0,6", "valid-relay")]);
  assert.equal(gauge.item, undefined);
  assert.equal(relay.item.id, "valid-relay");
  assert(select([]).every(result => result.item === undefined));
});

test("the nearest discharge gauge only warns about an undersized scale with pressure checks enabled", () => {
  const [checked] = selectDischargeInstruments(items, 300);
  const [unchecked] = selectDischargeInstruments(items, 300, undefined, false);
  assert.equal(checked.item.id, "кипиа-001-r0008");
  assert.match(checked.warning, /выходное давление вне шкалы/);
  assert.equal(unchecked.item.id, checked.item.id);
  assert.equal(unchecked.warning, undefined);
  assert.doesNotMatch(`${unchecked.details} ${unchecked.description}`, /Предупреждение|выходное давление вне шкалы/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
const { defaultPumpFrequencySettings, nominalPumpFrequency, pumpFrequencyState, frequencyAdjustedPump } = await loadTs(new URL("../app/pump-frequency.ts", import.meta.url));
const { operatingPoint, interpolateCurve } = await loadTs(new URL("../app/pump-catalog.ts", import.meta.url));
const pump = { id: "test", frequencyHz: 50, curve: [[0,100],[10,80],[20,40]], power: 10, speedRpm: 3000, nominalFlow: 10, minFlow: 2, maxFlow: 20, minHead: 40, maxHead: 100, ratedHead: 80, efficiency: 75, selectionFlowRange: [2,18], efficiencyCurve: [[5,65],[10,75]], powerCurve: [[5,8],[10,10]], npshCurve: [[5,2],[10,3]] };
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

test("frequency is disabled by default; separate controls and catalogue frequencies stay independent", () => {
  const first = defaultPumpFrequencySettings(), second = defaultPumpFrequencySettings();
  first.enabled = true; first.frequencyHz = 40;
  assert.equal(second.enabled,false);
  assert.equal(pumpFrequencyState(pump,first).frequencyHz,40);
  assert.equal(pumpFrequencyState(pump,second).frequencyHz,50);
  assert.equal(nominalPumpFrequency({frequencyHz:60}),60);
  assert.equal(pumpFrequencyState({frequencyHz:null},second).assumedNominal,true);
  assert.equal(nominalPumpFrequency({frequencyHz:NaN}),50);
  assert.equal(pumpFrequencyState(pump,{...first,enabled:false}).ratio,1);
});

test("nominal overrides and allowable reduction are normalized without overspeed", () => {
  const settings = {...defaultPumpFrequencySettings(),enabled:true,nominalHz:60,frequencyHz:48};
  close(pumpFrequencyState(pump,settings).ratio,.8);
  assert.equal(pumpFrequencyState(pump,{...settings,frequencyHz:100}).frequencyHz,60);
  assert.equal(pumpFrequencyState(pump,{...settings,frequencyHz:.01}).frequencyHz,.6);
  assert.equal(pumpFrequencyState(pump,{...settings,frequencyHz:NaN}).frequencyHz,60);
  assert.equal(pumpFrequencyState({frequencyHz:null},settings).assumedNominal,false);
});

test("affinity transformation scales Q, H, power and speed, preserves efficiency and original data", () => {
  const original = structuredClone(pump), adjusted = frequencyAdjustedPump(pump,40);
  for (let i=0;i<pump.curve.length;i++) {close(adjusted.curve[i][0],pump.curve[i][0]*.8);close(adjusted.curve[i][1],pump.curve[i][1]*.64);}
  close(adjusted.power,5.12);close(adjusted.speedRpm,2400);close(adjusted.ratedHead,51.2);
  assert.deepEqual(adjusted.selectionFlowRange,[1.6,14.4]);
  assert.deepEqual(adjusted.efficiencyCurve,[[4,65],[8,75]]);
  close(adjusted.powerCurve[1][1],5.12);
  assert.equal(adjusted.efficiency,75);assert.equal(adjusted.npshCurve,undefined);
  assert.deepEqual(pump,original);
  assert.equal(frequencyAdjustedPump(pump,50),pump);
  assert.equal(frequencyAdjustedPump(pump,60,60).frequencyHz,60);
  const incomplete = frequencyAdjustedPump({...pump,power:null,speedRpm:null,nominalFlow:null},40);
  assert.equal(incomplete.power,null);assert.equal(incomplete.speedRpm,null);assert.equal(incomplete.nominalFlow,null);
});

test("new operating point intersects the unchanged system for each method and 1–10 working pumps", () => {
  const adjusted = frequencyAdjustedPump(pump,40);
  for (const count of [1,2,6,10]) for (const method of ["linear","pchip","polynomial"]) {
    const input = {flowRate:10*count,head:80,staticHead:20};
    const point = operatingPoint(adjusted,count,input,method);
    assert.ok(point);close(point.head,input.staticHead+(input.head-input.staticHead)*(point.flow/input.flowRate)**2);
    close(point.head,interpolateCurve(adjusted.curve,point.flow/count,method));
    const nominal = operatingPoint(pump,count,input,method);
    assert.ok(point.flow<nominal.flow);
    assert.ok(Math.abs(point.flow-nominal.flow*.8)>.01,"static head prevents simply scaling the original operating point");
  }
  assert.equal(operatingPoint(frequencyAdjustedPump(pump,20),10,{flowRate:100,head:80,staticHead:20}),null);
});

test("invalid frequencies are rejected instead of producing invalid geometry", () => {
  for (const [actual,nominal] of [[0,50],[-1,50],[NaN,50],[Infinity,50],[51,50],[40,0],[40,NaN]]) assert.throws(()=>frequencyAdjustedPump(pump,actual,nominal),RangeError);
});

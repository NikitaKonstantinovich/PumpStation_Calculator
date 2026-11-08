import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const runtime = await loadTs(new URL("../app/node-tools/dn-runtime.ts", import.meta.url));
const { dnNodeTypes } = await loadTs(new URL("../app/node-tools/dn-nodes.ts", import.meta.url));
const { coreGetCircuitDnConfig } = await loadTs(new URL("../app/station-hydraulic-calculation.ts", import.meta.url));
const { legacyBaseSnapshot } = await loadTs(new URL("../app/base-values.ts", import.meta.url));
const item = { variantId: "fixture:exact", modelId: "fixture:model", curveSetId: "curve", frequencyHz: 50, issues: [], provenance: {}, pump: { id: "fixture:exact", manufacturer: "Fixture", series: "F", group: "F", model: "F10", type: "vertical_multistage", power: 3, efficiency: null, nominalFlow: 10, minFlow: 0, maxFlow: 20, minHead: 10, maxHead: 30, price: null, priceCurrency: null, priceSource: null, source: "Exact fixture", drawing: null, curve: [[0,30],[10,20],[20,10]], medium: "water", selectable: true, active: true, frequencyHz: 50, inlet: { dn: 40, type: "flange", pressure_class: "PN25", maxInletPressure: 2 }, outlet: { dn: 32, type: "flange", pressure_class: "PN25" } } };
const snapshot = { id: "a".repeat(64), sourceId: "pump_catalog_v2", schemaVersion: "fixture/v1", status: "ready", sourceStatus: "draft", created: "2026-11-08T00:00:00Z", items: [item], issues: [] };
const context = { role: "admin", values: {}, defaults: {}, resources: { pump_catalog_v2: snapshot } };
const selection = { valid: true, stale: false, variantId: item.variantId, modelId: item.modelId, curveSetId: item.curveSetId, snapshotId: snapshot.id, requestKey: "confirmed", message: "Подтверждено" };
const main = { flowRate: 20, head: 25, workingPumpCount: 2, reservePumpCount: 1, medium: "water" };
const settings = { stationType: "utility", main, secondary: null, inletHead: 10, usdRate: 85, cnyRate: 13, discount_cnp: 45, discount_aquastrong: 55 };
const request = { flowRate: 20, head: 25, workingPumpCount: 2, medium: "water", staticHead: 4 };
const baseSettings = legacyBaseSnapshot();
const values = { settings, request, item, selection, overrides: {}, baseSettings };
const types = new Map(dnNodeTypes().map(type => [type.operation,type]));
function run(operation, input) { const type = types.get(operation); return runtime.executeDnOperation({ id: operation, operation, fields: type.fields, expressions: {}, links: [], values: {} }, { ...Object.fromEntries(type.fields.map(field => [field.key,field.initial])), ...input }, context); }
function result(extra = {}, ctx = context) { const c = runtime.buildDnContext({ ...values,...extra },ctx); return runtime.buildDnResult(c,runtime.calculateDnCircuit(c),runtime.calculateDnCircuit(c,true)); }

test("node DN preserves first-workspace circuit calculation, independent collector sizing, PN and velocities", () => {
  const before = JSON.stringify(values), data = result();
  assert.equal(data.context.status,"ready"); assert.equal(data.primary.stationFlow,20); assert.equal(data.primary.pumpFlow,10); assert.equal(data.primary.totalPumpCount,3);
  assert.equal(data.primary.values.suctionValveDn,40); assert.equal(data.primary.values.dischargeValveDn,32);
  const legacy = runtime.withDnPrimitives(() => coreGetCircuitDnConfig(data.context.effectiveEntity,data.context.input,data.context.settings,false,item.pump));
  const { speeds, ...actual } = data.primary; assert.deepEqual(actual,legacy);
  assert(speeds.suctionCollectorDn.velocity > 0); assert.equal(data.context.input.staticHead,4);
  const manual = result({ overrides: { suctionCollectorDn: 150, dischargeCollectorDn: 200, suctionValveDn: 65, dischargeValveDn: 80, connectionType: "flanged", pn: 25, collectorMaterial: "st20" } });
  assert.equal(manual.primary.values.suctionCollectorDn,150); assert.equal(manual.primary.values.dischargeCollectorDn,200); assert.equal(manual.primary.values.suctionValveDn,65); assert.equal(manual.primary.pn,25); assert.equal(manual.context.entity.collectorMaterial,"st20");
  assert.equal(manual.project.entities["station-dn"].pn,25); assert.equal(JSON.stringify(values),before);
  assert.deepEqual(JSON.parse(JSON.stringify(data)),data);
});

test("both circuits retain separate pump, nozzle, flow and pressure rules", () => {
  const secondItem = structuredClone(item); secondItem.variantId = secondItem.pump.id = "fixture:second"; secondItem.modelId = "model2"; secondItem.pump.inlet = { dn: 25,type: "thread",pressure_class:"PN16" }; secondItem.pump.outlet = { dn:20,type:"thread",pressure_class:"PN16" };
  const secondary = { flowRate:3,head:20,workingPumpCount:1,reservePumpCount:0,medium:"water" };
  const ctx = { ...context,resources:{pump_catalog_v2:{...snapshot,items:[item,secondItem]}} };
  const data = result({ settings:{...settings,stationType:"combined",secondary}, secondaryItem:secondItem,secondarySelection:{...selection,variantId:secondItem.variantId,modelId:secondItem.modelId},secondaryRequest:{...secondary,staticHead:0}},ctx);
  assert.equal(data.primary.forcedFlanged,true); assert.equal(data.secondary.stationFlow,3); assert.equal(data.secondary.suction.locked,true); assert.equal(data.secondary.values.secondarySuctionValveDn,25); assert.equal(data.secondary.values.secondaryDischargeValveDn,20);
  assert.equal(data.project.station.secondaryPumpId,secondItem.variantId); assert.equal(data.project.entities["system-input-2"].selectedPumpId,secondItem.variantId); assert.equal(data.pumps.length,2);
});

test("source nozzle data stays incomplete without a legacy fallback and manual overrides follow exact pump identity", () => {
  const incomplete = structuredClone(item); incomplete.pump.inlet = {dn:40}; incomplete.pump.outlet = {};
  const ctx = {...context,resources:{pump_catalog_v2:{...snapshot,items:[incomplete]}}};
  const data = result({item:incomplete},ctx);
  assert.equal(data.context.effectiveEntity.pumpSuctionPort.dn,40); assert.equal(data.context.effectiveEntity.pumpSuctionPort.connection,null); assert.equal(data.context.effectiveEntity.pumpDischargePort.dn,null); assert(data.primary.suction.errors.some(message => message.includes("тип соединения")));
  const manual = { pumpId:item.variantId,dn:50,connection:"flanged",maxPressure:16,source:"user" };
  const overridden = result({item:incomplete,overrides:{pumpSuctionPort:manual}},ctx);
  assert.equal(overridden.primary.suction.port.dn,50); assert.equal(overridden.primary.suction.errors.length,0);
  const previous = result({item:incomplete,overrides:{pumpSuctionPort:{...manual,pumpId:"old"}}},ctx);
  assert.equal(previous.context.effectiveEntity.pumpSuctionPort.dn,40); assert.equal(previous.context.effectiveEntity.pumpSuctionPort.connection,null);
});

test("stale and tampered pump selections cannot supply station identities or source ports", () => {
  for(const extra of [{selection:{...selection,stale:true}},{selection:{...selection,modelId:"other"}},{selection:{...selection,snapshotId:"b".repeat(64)}},{item:{...item,pump:{...item.pump,inlet:{dn:1200,type:"flange"}}}}]) {
    const data=result(extra); assert.equal(data.pumps.length,0); assert.equal(data.project.station.selectedPumpId,undefined); assert.equal(data.context.effectiveEntity.pumpSuctionPort,null); assert(data.issues.length > 0);
  }
  const mismatched = result({request:{...request,flowRate:999}}); assert.equal(mismatched.context.status,"empty"); assert.equal(mismatched.primary,null);
  assert.equal(result({settings:{...settings,main:{...main,workingPumpCount:0}}}).context.status,"empty");
  assert.equal(result({settings:{...settings,main:{...main,reservePumpCount:1.5}}}).primary,null);
  assert.equal(result({settings:{...settings,main:{...main,medium:null}}}).primary,null);
  assert.equal(result({request:null}).primary,null);
  assert.equal(result({request:{...request,staticHead:null}}).primary,null);
});

test("DN stages and view carry editable bindings and reset data without coupling to a workspace", () => {
  const c=run("station.dnContext",values).context,primary=run("station.dnCircuit",{context:c}).circuit;
  const data=run("station.dnResult",{context:c,primary}).value;
  const binding={key:"dn",node:"dn-parameter",value:{},active:true,editable:true,mode:"user",permission:"all",origin:"user",field:{key:"dn",kind:"object",meaning:"dnOverrides",name:"Настройки DN",unit:"",direction:"input"}};
  const view=run("ui.dnCalculator",{data,binding}).value;
  assert.equal(view.kind,"dn-calculator");assert.equal(view.binding,binding);assert.equal(view.dn,data);assert.equal(data.resetOverrides.pn,16);assert.equal(data.resetOverrides.collectorMaterial,"aisi304");
  assert.equal(data.project.entities["station-spec"].items.length,0);assert.equal(data.project.workspace.windows.length,0);
  assert.throws(()=>runtime.normalizeDnOverrides({pn:99}),/Недопустимое/);assert.throws(()=>runtime.normalizeDnOverrides({suctionValveDn:-1}),/DN/);
});

test("shared hydraulic options inherit settings until an explicit upstream override is connected",()=>{
  const inherited={products:{"suction:plug":"existing"},hoseLengthMm:600};
  assert.deepEqual(result({settings:{...settings,hydraulicOptions:inherited},hydraulicOptions:null}).context.settings.hydraulicOptions,inherited);
  const options={products:{"suction:plug":"replacement","untrusted:role":"ignored"},hoseLengthMm:800};
  const data=result({settings:{...settings,hydraulicOptions:inherited},hydraulicOptions:options});
  assert.deepEqual(data.project.entities["station-settings"].hydraulicOptions,{products:{"suction:plug":"replacement"},hoseLengthMm:800});
  assert.deepEqual(inherited,{products:{"suction:plug":"existing"},hoseLengthMm:600});
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./load-ts.mjs";
import { catalogNozzle, parseNozzleSize } from "../scripts/build-pump-nozzles.mjs";

const portsUrl = new URL("../app/pump-ports.ts", import.meta.url);
const { resolvePumpPort, resolvePumpPortData, catalogPumpPort } = await loadTs(portsUrl);
const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const pumps = JSON.parse(await readFile(new URL("../public/pumps.json", import.meta.url), "utf8"));
const index = JSON.parse(await readFile(new URL("../app/pump-nozzles.json", import.meta.url), "utf8"));

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replaceAll('from "react/jsx-runtime"', `from "${import.meta.resolve("react/jsx-runtime")}"`)).toString("base64")}`;
let portsSource = await readFile(portsUrl, "utf8");
for (const [name, file] of [["evidence", "pump-connections"], ["importedPorts", "imported-pump-ports"], ["catalogNozzles", "pump-nozzles"]]) {
  portsSource = portsSource.replace(`import ${name} from "./${file}.json";`, `const ${name} = ${await readFile(new URL(`../app/${file}.json`, import.meta.url), "utf8")};`);
}
const componentSource = (await readFile(new URL("../app/pump-nozzle-fields.tsx", import.meta.url), "utf8"))
  .replace('from "./pump-ports"', `from "${moduleUrl(portsSource)}"`)
  .replace('import { STANDARD_DN } from "./dn-defaults";', 'const STANDARD_DN = [25,32,40,50,65,80,100,125,150,200,250,300,350,400,450,500,600,700,800,900,1000,1200];');
const { PumpNozzleFields } = await import(moduleUrl(componentSource));

test("generated index tracks current pump database and preserves separate ports", () => {
  for (const p of pumps) for (const side of ["inlet", "outlet"]) {
    assert.deepEqual(index[p.id]?.[side] ?? null, catalogNozzle(p, side), `${p.model}: ${side}`);
  }
  assert.equal(catalogPumpPort("979", "inlet").dn, 100);
  assert.equal(catalogPumpPort("979", "outlet").dn, 65);
  for (const id of ["1", "500", "760", "979"]) for (const side of ["inlet", "outlet"]) {
    assert.equal(catalogPumpPort(id, side).connection, "flanged");
  }
  assert.equal(catalogPumpPort("672").dn, 25);
  assert.equal(catalogPumpPort("672").connection, "threaded");
  assert.equal(catalogPumpPort("nu-7b64fa2162db2674", "inlet").dn, 40);
  assert.equal(catalogPumpPort("nu-7b64fa2162db2674", "outlet").dn, 32);
});

test("DN implies flanged and G implies threaded without choosing ambiguous diameters", () => {
  for (const value of ['G1½', 'G 1 1/2"', 'Rp1 1/2']) assert.deepEqual(parseNozzleSize(value), { dn: 40, connection: "threaded" });
  for (const value of ["DN 25 / DN 32", "DN 25/32", "DN 100 / DN 150"]) {
    assert.deepEqual(parseNozzleSize(value), { dn: null, connection: "flanged" });
  }
  for (const value of ["DN100", "DN 100", "dn 100"]) assert.deepEqual(parseNozzleSize(value), { dn: 100, connection: "flanged" });
  assert.deepEqual(parseNozzleSize("G6"), { dn: null, connection: "threaded" });
  assert.deepEqual(parseNozzleSize("—"), { dn: null, connection: null });
  const partial = catalogNozzle({ inletDn: 65 }, "inlet");
  assert.equal(partial.dn, 65);
  assert.equal(partial.connection, "flanged");
  assert.equal(catalogNozzle({ inlet: { dn: 100 } }, "inlet").connection, "flanged");
  assert.equal(catalogNozzle({ inletDn: 40, connectionSourceValue: { inlet: "G1½" } }, "inlet").connection, "threaded");
  const oval = catalogNozzle({ manufacturer: "CNP", series: "CDM", inlet: { dn: 25, type: "flange" }, connectionSourceValue: { inlet: "G1" } }, "inlet");
  assert.equal(oval.connection, "flanged");
  assert.equal(catalogNozzle({ manufacturer: "CNP", series: "CDM", connectionSourceValue: { inlet: "G1" } }, "inlet").connection, "threaded");
  assert.equal(catalogNozzle({ mounting: { "Напорный патрубок": "DN 50", "Стандарт трубного соединения": "Фланец" } }, "inlet"), null);
});

test("manual values persist independently for both nozzles and circuits, and do not leak to a different pump", () => {
  const p = createProject();
  const dn = p.entities["station-dn"];
  const input = { selectedPumpId: "979" };
  assert.equal(resolvePumpPort(dn, input).dn, 100);
  dn.pumpSuctionPort = { pumpId: "979", dn: 80, connection: null, source: "Указано пользователем" };
  assert.equal(resolvePumpPort(dn, input), null);
  assert.equal(resolvePumpPortData(dn, input).dn, 80);
  dn.pumpDischargePort = { pumpId: "979", dn: 50, connection: "threaded", source: "Указано пользователем" };
  dn.secondaryPumpSuctionPort = { pumpId: "672", dn: 32, connection: "flanged", source: "Указано пользователем" };
  dn.secondaryPumpDischargePort = { pumpId: "672", dn: 40, connection: "threaded", source: "Указано пользователем" };
  const saved = parseProjectConfig(JSON.parse(JSON.stringify(p))).entities["station-dn"];
  assert.equal(resolvePumpPort(saved, input), null);
  assert.equal(resolvePumpPort(saved, input, false, "outlet").dn, 50);
  assert.equal(resolvePumpPort(saved, { selectedPumpId: "672" }, true).dn, 32);
  assert.equal(resolvePumpPort(saved, { selectedPumpId: "672" }, true, "outlet").dn, 40);
  assert.equal(resolvePumpPort(saved, { selectedPumpId: "760" }).dn, 32);
  assert.equal(resolvePumpPort(saved, { selectedPumpId: "760" }, false, "outlet").connection, "flanged");
  assert.equal(resolvePumpPort(saved, {}), null);
});

const nodes = element => !element || typeof element !== "object" ? [] : [element, ...[element.props?.children].flat(Infinity).flatMap(nodes)];
test("UI auto-fills both sides, prompts only for missing fields, and dropdown edits/reset work", () => {
  let entity = createProject().entities["station-dn"];
  let props = { entity, input: { selectedPumpId: "979" }, title: "Контур 1", onChange: patch => Object.assign(entity, patch) };
  const tree = PumpNozzleFields(props);
  const selects = nodes(tree).filter(n => n.type === "select");
  assert.deepEqual(selects.map(n => n.props.value), [100, "flanged", 65, "flanged"]);
  selects[2].props.onChange({ target: { value: "80" } });
  assert.equal(entity.pumpDischargePort.dn, 80);
  assert.equal(entity.pumpDischargePort.connection, "flanged");
  const reset = nodes(PumpNozzleFields(props)).filter(n => n.type === "button")[1];
  assert.equal(reset.props.disabled, false);
  reset.props.onClick();
  assert.equal(resolvePumpPort(entity, props.input, false, "outlet").dn, 65);
  let html = renderToStaticMarkup(createElement(PumpNozzleFields, props));
  assert.doesNotMatch(html, /role="alert"/);
  props = { ...props, input: { selectedPumpId: "missing-pump" }, secondary: true };
  html = renderToStaticMarkup(createElement(PumpNozzleFields, props));
  assert.equal((html.match(/role="alert"/g) ?? []).length, 2);
  const unknown = nodes(PumpNozzleFields(props)).filter(n => n.type === "select");
  unknown[0].props.onChange({ target: { value: "40" } });
  assert.equal(entity.secondaryPumpSuctionPort.connection, null);
  const partial = nodes(PumpNozzleFields(props)).filter(n => n.type === "select");
  partial[1].props.onChange({ target: { value: "threaded" } });
  assert.equal(entity.secondaryPumpSuctionPort.dn, 40);
  html = renderToStaticMarkup(createElement(PumpNozzleFields, props));
  assert.equal((html.match(/role="alert"/g) ?? []).length, 1);
  assert.equal(resolvePumpPort(entity, props.input, true).connection, "threaded");
  const partialCatalog = Object.entries(index).find(([, ports]) => !ports.inlet?.dn && ports.inlet?.connection === "flanged");
  assert.ok(partialCatalog);
  props = { ...props, input: { selectedPumpId: partialCatalog[0] } };
  const catalogFields = nodes(PumpNozzleFields(props)).filter(n => n.type === "select");
  assert.equal(catalogFields[0].props.value, "");
  assert.equal(catalogFields[1].props.value, "flanged");
  catalogFields[0].props.onChange({ target: { value: "32" } });
  assert.equal(entity.secondaryPumpSuctionPort.dn, 32);
  assert.equal(entity.secondaryPumpSuctionPort.connection, "flanged");
  props = { ...props, input: {} };
  assert.ok(nodes(PumpNozzleFields(props)).filter(n => n.type === "select").every(n => n.props.disabled));
});

test("DN source strings auto-fill connection for both nozzles and both circuits", () => {
  for (const secondary of [false, true]) {
    const props = { entity: createProject().entities["station-dn"], input: { selectedPumpId: "236" }, title: secondary ? "Контур 2" : "Контур 1", secondary };
    const selects = nodes(PumpNozzleFields(props)).filter(n => n.type === "select");
    assert.deepEqual(selects.map(n => n.props.value), [40, "flanged", 40, "flanged"]);
    assert.doesNotMatch(renderToStaticMarkup(createElement(PumpNozzleFields, props)), /role="alert"/);
    assert.equal(resolvePumpPort(props.entity, props.input, secondary).connection, "flanged");
    assert.equal(resolvePumpPort(props.entity, props.input, secondary, "outlet").connection, "flanged");
  }
});

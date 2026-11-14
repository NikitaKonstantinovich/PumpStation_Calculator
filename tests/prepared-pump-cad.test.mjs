import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const root = new URL("../", import.meta.url);
const pump = {
  id: "DEMO:VM:125", manufacturer: "DEMO", series: "VM", model: "VM 3-5", article: "125",
  execution: "VM 3-5-A", power: 4, frequencyHz: 50, type: "vertical_multistage",
  dimensions: { overall_length: 240, overall_width: 190, overall_height: 720 },
};
const secondary = { ...pump, id: "DEMO:VM:126", article: "126", execution: "VM 3-5-B" };
const noArticle = { ...pump, id: "DEMO:VM:127", article: undefined };
const blocked = { ...pump, id: "DEMO:VM:oval", inlet: { connection_type: "oval_flange" } };
const hash = "a".repeat(64);
const drawingHash = "b".repeat(64);
const port = { id: "inlet", point: [0, 0, 0], axis: [-1, 0, 0], provisional: true };
const profile = {
  bounds: [0, -95, -80, 240, 95, 640], ports: [port], source: "Equipment/Pumps/Example.step", sourceHash: hash,
  meshUrl: `/model-assets/model-${hash}-v1.stl`, mapping: "prepared_source", warnings: [],
};
const entry = { manufacturer: pump.manufacturer, series: pump.series, model: pump.model, article: pump.article,
  execution: pump.execution, powerKw: pump.power, frequencyHz: pump.frequencyHz, scope: "variant_step", profile };
const drawingProfile = { ...profile, source: "Equipment/Pumps/Drawing.step", sourceHash: drawingHash,
  meshUrl: `/model-assets/model-${drawingHash}-v1.stl`, ports: [] };
const data = { version: 1, nonRoundVariantIds: [blocked.id], models: { [pump.id]: entry,
  [secondary.id]: { ...entry, article: secondary.article, execution: secondary.execution, scope: "drawing_reference", profile: drawingProfile },
  [noArticle.id]: { ...entry, article: null, scope: "model_reference", displayArticle: "DEMO-VM-3-5" },
} };
const replace = { [new URL("data/prepared-pump-cad-models.json", root).href]: JSON.stringify(data) };
const load = name => loadTs(new URL(name, root), replace);
const { coreBuildStationLayout, corePlaceStationPumps, mergeAssembly, sourceFingerprint } = await load("app/model-editor/model.ts");
const { createProject } = await load("app/project-config.ts");
const { cadContents } = await load("app/cad-export.ts");
const { preparedPumpCadModel } = await load("app/model-editor/prepared-pump-cad.ts");
const { availableSpecificationPumpKeys, specificationModels, specificationPreparationItems } = await load("app/model-editor/specification-models.ts");
const { addLibraryModel, filterLibrary, mergePreparedPumpLibrary, parseModelLibrary } = await load("app/model-editor/library.ts");
const empty = { version: 1, profiles: {} };
const setup = id => {
  const project = createProject("STEP regression", { id: "step-regression" });
  Object.assign(project.entities["system-input"], { selectedPumpId: id, workingPumpCount: 2, reservePumpCount: 1 });
  return project;
};
const place = (project, pumps, profiles = empty) => corePlaceStationPumps(project, pumps, profiles, undefined, {}).pumpComponents;

test("registered CAD requires the exact execution, motor and original article", () => {
  assert.equal(preparedPumpCadModel(pump)?.profile.sourceHash, hash);
  assert.equal(preparedPumpCadModel(noArticle)?.profile.sourceHash, hash);
  for (const field of ["id", "manufacturer", "series", "model", "article", "execution", "power", "frequencyHz"]) {
    const altered = { ...pump, [field]: typeof pump[field] === "number" ? pump[field] + 1 : pump[field] + "-other" };
    assert.equal(preparedPumpCadModel(altered), undefined, field);
  }
  assert.equal(preparedPumpCadModel({ ...noArticle, article: "DEMO-VM-3-5" }), undefined);
});

test("working, reserve and secondary pumps export native CAD with the registered pose and role evidence", () => {
  const project = setup(pump.id);
  project.entities["station-settings"].stationType = "combined";
  Object.assign(project.entities["system-input-2"], { selectedPumpId: secondary.id, workingPumpCount: 1, reservePumpCount: 0 });
  const components = place(project, [pump, secondary]);
  assert.equal(components.length, 4);
  assert(components.slice(0, 3).every(c => c.meshUrl === profile.meshUrl && c.position[2] + c.bounds[2] === 80));
  assert(components.slice(0, 3).every(c => c.ports.length === 1 && c.ports[0].id === "inlet" && c.ports[0].provisional));
  assert.deepEqual(components[3].ports, []);
  assert.match(components[3].sourceNote, /Компоновочный STEP по чертежу/);
  const { instances, warnings } = cadContents({ version: 1, sourceFingerprint: sourceFingerprint(project), components });
  assert.deepEqual(instances.map(part => [part.geometry.kind, part.geometry.hash]), [["native", hash], ["native", hash], ["native", hash], ["native", drawingHash]]);
  assert(warnings.some(warning => warning.includes("STEP по чертежу")));
  assert(warnings.some(warning => warning.includes("Монтажную пригодность проверяют отдельно")));
});

test("the same source hash keeps registered ports, while a different pinned CAD still takes precedence", () => {
  const project = setup(pump.id);
  const stalePorts = [{ ...port, id: "outlet", point: [240, 0, 0], axis: [1, 0, 0] }];
  const [same] = place(project, [pump], { ...empty, profiles: { [pump.id]: { ...profile, ports: stalePorts } } });
  assert.deepEqual(same.ports, [port]);
  const pinned = { ...profile, sourceHash: "c".repeat(64) };
  const [different] = place(project, [pump], { ...empty, profiles: { [pump.id]: pinned } });
  assert.equal(different.cadSource.hash, pinned.sourceHash);
});

test("saved assembly refresh attaches the STEP and retains manual placement", () => {
  const project = setup(secondary.id);
  const existing = place(project, [{ ...secondary, execution: "Earlier edition" }]);
  existing[0] = { ...existing[0], position: [10, 20, 400], rotation: [0, 0, 10], locked: true };
  const generated = place(project, [secondary]);
  const generatedFingerprint = sourceFingerprint(project);
  assert(generatedFingerprint.includes(drawingHash));
  const merged = mergeAssembly({ version: 1, components: existing, sourceFingerprint: "old" },
    { version: 1, components: generated, sourceFingerprint: generatedFingerprint });
  assert.equal(merged.sourceFingerprint, generatedFingerprint);
  assert.equal(merged.components[0].cadSource.hash, drawingHash);
  assert.deepEqual(merged.components[0].position, [10, 20, 400]);
  assert.deepEqual(merged.components[0].rotation, [0, 0, 10]);
  assert.equal(merged.components[0].locked, true);
  assert(!sourceFingerprint(setup("elsewhere")).includes(drawingHash));
});

test("additional purchased pumps get the exact model and skip redundant conversion", () => {
  const project = setup(secondary.id);
  project.entities["station-spec"].items.push({ equipmentId: secondary.id, section: "pump", quantity: 5, position: "01", name: "Дополнительный насос", details: "", description: "" });
  const draft = corePlaceStationPumps(project, [secondary], empty, undefined, { reasons: [] });
  const assembly = coreBuildStationLayout(draft);
  const purchased = assembly.components.filter(c => c.kind === "equipment" && c.sourceKey === `pump:${secondary.id}`);
  assert.equal(purchased.length, 2);
  assert(purchased.every(c => c.cadSource.hash === drawingHash && c.ports.length === 0));
  const available = availableSpecificationPumpKeys(assembly);
  assert.deepEqual([...available], [`pump:${secondary.id}`]);
  assert(!specificationModels(project).filter(item => !available.has(item.key)).some(item => item.key === `pump:${secondary.id}`));
  const { instances, warnings } = cadContents(assembly);
  assert.equal(instances.filter(part => part.equipmentId === secondary.id && part.geometry.hash === drawingHash).length, 5);
  assert(warnings.some(warning => warning.startsWith("Дополнительный насос") && warning.includes("STEP по чертежу")));
  const wrongExecution = corePlaceStationPumps(project, [{ ...secondary, execution: "wrong" }], empty, undefined, { reasons: [] });
  assert.equal(availableSpecificationPumpKeys(coreBuildStationLayout(wrongExecution)).size, 0);
});

test("manual library merges by source hash and searches factory and fallback articles", () => {
  const pinned = parseModelLibrary({ version: 1, models: [{ id: hash, sourceHash: hash, units: "mm", status: "ready", name: "Pinned name",
    source: profile.source, sources: [profile.source], categories: ["Pinned category"], bounds: profile.bounds, meshUrl: profile.meshUrl, warnings: ["Pinned warning"] }] });
  const library = mergePreparedPumpLibrary(pinned);
  assert.equal(library.models.length, 2);
  const [factory] = filterLibrary(library.models, "125", "DEMO VM", "ready");
  const [fallback] = filterLibrary(library.models, "DEMO-VM-3-5", "Насосы", "ready");
  assert.equal(factory.sourceHash, fallback.sourceHash);
  assert.equal(factory.name, "Pinned name");
  assert(factory.warnings.includes("Pinned warning"));
  const [drawing] = filterLibrary(library.models, "126", "Насосы", "ready");
  const assembly = addLibraryModel({ version: 1, components: [], sourceFingerprint: "" }, drawing, "manual-pump");
  assert.deepEqual(assembly.components[0].ports, []);
  assert.equal(assembly.components[0].equipmentId, undefined);
  const { instances, warnings } = cadContents(assembly);
  assert.equal(instances[0].geometry.hash, drawingHash);
  assert(warnings.some(warning => warning.includes("STEP по чертежу")));
});

test("an oval execution cannot enter a new scene, preparation request or saved-scene CAD export", () => {
  const project = setup(blocked.id);
  project.entities["station-spec"].items.push({ equipmentId: blocked.id, section: "pump", quantity: 5, position: "01", name: "Овальный насос", details: "", description: "" });
  const pinned = { ...empty, profiles: { [blocked.id]: profile }, equipment: { [`pump:${blocked.id}`]: profile } };
  const draft = corePlaceStationPumps(project, [blocked], pinned, undefined, { reasons: [] });
  assert.equal(draft.pumpComponents.length, 0);
  assert.equal(coreBuildStationLayout(draft).components.filter(c => c.equipmentId === blocked.id).length, 0);
  assert(!specificationPreparationItems(specificationModels(project), [blocked], new Set()).some(item => item.equipmentId === blocked.id));
  const [old] = place(setup(pump.id), [pump]);
  const saved = { version: 1, sourceFingerprint: "previous", components: [{ ...old, equipmentId: blocked.id }] };
  const before = structuredClone(saved);
  const { instances, warnings } = cadContents(saved);
  assert.equal(instances[0].geometry.kind, "unavailable");
  assert.match(instances[0].geometry.reason, /стандартные круглые фланцы/);
  assert(warnings.some(warning => warning.includes("стандартные круглые фланцы")));
  assert.deepEqual(saved, before);
});

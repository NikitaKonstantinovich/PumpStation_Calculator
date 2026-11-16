import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

// Run the real scene, controls, geometry and STL loader with a minimal canvas in Node.
const root = fileURLToPath(new URL("../", import.meta.url));
const three = fileURLToPath(import.meta.resolve("three")).replaceAll("\\", "/");
const result = await build({
  stdin: {
    resolveDir: root,
    contents: `export { Scene } from "./app/model-editor/viewport";
      export { emptyEditor, editComponent, createHistory, execute, undo, redo } from "./app/model-editor/model";
      export { rebuildFasteners } from "./app/model-editor/flange-fasteners";
      export { Box3, Vector3 } from "three";`,
  },
  platform: "node",
  bundle: true,
  format: "esm",
  write: false,
  plugins: [{
    name: "viewport-test-canvas",
    setup(build) {
      build.onLoad({ filter: /[\\/]model-editor[\\/]viewport\.tsx$/ }, async ({ path }) => ({
        contents: `${await readFile(path, "utf8")}\nexport { Scene };`,
        loader: "tsx",
        resolveDir: dirname(path),
      }));
      build.onResolve({ filter: /^three$/ }, () => ({ path: "three", namespace: "test-canvas" }));
      build.onLoad({ filter: /^three$/, namespace: "test-canvas" }, () => ({
        contents: `export * from ${JSON.stringify(three)};
          export class WebGLRenderer {
            domElement = document.createElement("canvas");
            setPixelRatio() {}
            dispose() {}
          }`,
        resolveDir: root,
      }));
    },
  }],
});
const {
  Scene, emptyEditor, editComponent, createHistory, execute, undo, redo, rebuildFasteners, Box3, Vector3,
} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);

function mount(t, callbacks = {}) {
  const document = new EventTarget();
  const cameraStorage = new Map();
  const localStorage = {
    getItem: key => cameraStorage.get(key) ?? null,
    setItem: (key, value) => cameraStorage.set(key, value),
  };
  class Element extends EventTarget {
    ownerDocument = document;
    style = {};
    dataset = {};
    getRootNode() { return this.ownerDocument; }
    append() {}
    appendChild() {}
    setAttribute() {}
    remove() {}
  }
  document.documentElement = new Element();
  document.createElement = () => new Element();
  class Observer { observe() {} disconnect() {} }
  const globals = {
    document, window: { devicePixelRatio: 1, localStorage, setTimeout, clearTimeout }, getComputedStyle: () => ({ getPropertyValue: () => "" }),
    ResizeObserver: Observer, MutationObserver: Observer, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  };
  const original = Object.getOwnPropertyDescriptors(globalThis);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  let scene;
  t.after(() => {
    try {
      scene?.dispose();
    } finally {
      for (const key of Object.keys(globals)) {
        if (original[key]) Object.defineProperty(globalThis, key, original[key]);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
  scene = new Scene(new Element());
  const editor = emptyEditor();
  return {
    scene,
    cameraStorage,
    reopen: () => {
      scene.dispose();
      scene = new Scene(new Element());
      return scene;
    },
    update: (assembly, selectedId = null) => scene.update({
      assembly, selectedId, grid: true, mode: "translate", snapStep: 25, snaps: editor.objectSnaps,
      referencePoints: editor.referencePoints, camera: { position: [500, -1000, 800], target: [0, 0, 0] },
      measurement: [], ...callbacks,
    }),
    object: id => scene.root.children.find(o => o.userData.componentId === id),
  };
}

function component(id, kind, patch = {}) {
  return {
    id, kind, name: id, sourceNote: "Test fixture", hidden: false, locked: false, opacity: 1,
    position: [0, 0, 0], rotation: [0, 0, 0], ports: [],
    parameters: { length: 20, width: 200, height: 200, diameter: 200, routeOffset: 0 }, ...patch,
  };
}

const assembly = (components, patch = {}) => ({ version: 1, sourceFingerprint: "viewport-test", components, ...patch });

test("wheel changes the camera immediately and remembers the view only in the browser", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const key = "camera/station", projectCamera = { position: [500, -1000, 800], target: [0, 0, 0] };
  const { scene, update, cameraStorage, reopen } = mount(t, { camera: projectCamera, cameraStorageKey: key });
  const model = assembly([component("pump", "pump")]);
  cameraStorage.set(key, "{");
  update(model);
  const before = scene.camera.position.distanceTo(scene.orbit.target);
  assert.ok(Math.abs(before - Math.hypot(...projectCamera.position)) < 1e-6);
  cameraStorage.clear();
  const wheel = deltaY => scene.renderer.domElement.dispatchEvent(Object.assign(new Event("wheel", { cancelable: true }), { deltaY, deltaMode: 0 }));
  wheel(-120);
  const nearer = scene.camera.position.distanceTo(scene.orbit.target);
  assert.ok(nearer < before);
  t.mock.timers.tick(100);
  wheel(60);
  assert.ok(scene.camera.position.distanceTo(scene.orbit.target) > nearer);
  t.mock.timers.tick(100);
  assert.equal(cameraStorage.size, 0, "a burst must not write each wheel event");
  t.mock.timers.tick(50);
  const saved = JSON.parse(cameraStorage.get(key));
  assert.deepEqual(saved, scene.cameraView());
  assert.deepEqual(projectCamera, { position: [500, -1000, 800], target: [0, 0, 0] });

  const reopened = reopen();
  update(model);
  assert.ok(reopened.camera.position.distanceTo(new Vector3(...saved.position)) < 1e-6);
});

function meshes(object) {
  const result = [];
  object.traverse(child => { if (child.isMesh) result.push(child); });
  return result;
}

function station() {
  const flange = (id, kind, rotation) => component(id, kind, {
    rotation, shape: { kind: "flange", lengthMm: 20, outerMm: 200, innerMm: 80, boltCircleMm: 160, boltHoles: 8, boltHoleMm: 18 },
    ports: [{ id: "left", point: [0, 0, 0], axis: [-1, 0, 0], connection: "flanged", dn: 80, pn: 16 }],
  });
  const from = { componentId: "pump", portId: "left" }, to = { componentId: "collector", portId: "branch" };
  const hardware = (kind, standard, length) => ({ id: kind, kind, name: `DIN ${standard}`, diameter: 16, length, source: "fixture" });
  return rebuildFasteners(assembly([
    flange("pump", "pump", [0, 0, 180]), flange("flange", "equipment", [0, 0, 0]),
    component("collector", "collector", { position: [500, 100, 50], ports: [{ id: "branch", point: [0, 0, 0], axis: [-1, 0, 0] }] }),
    component("auto", "pipe", { routing: { from, to, automatic: true, points: [] } }),
    component("manual", "pipe", { position: [100, 0, -100] }),
  ], {
    fastenerCatalog: { version: 1, items: [hardware("bolt", 933, 80), hardware("nut", 934, 13), hardware("washer", 125, 3)] },
    lineJoints: [{ id: "pump-flange", a: from, b: { componentId: "flange", portId: "left" }, kind: "face", overlap: 0, provisional: false }],
  }));
}

test("local scene edits keep unaffected objects and update dependent pipe and hardware", t => {
  const { scene, update, object } = mount(t);
  const original = station();
  const fastener = original.components.find(c => c.fastener);
  assert.equal(fastener.fastener.status, "ready", fastener.fastener.issues.join("\n"));
  update(original, "pump");
  const pump = object("pump"), manual = object("manual"), auto = object("auto"), collector = object("collector");
  const pumpGeometry = meshes(pump)[0].geometry;
  const initialPipeBox = new Box3().setFromObject(auto);
  assert.equal(meshes(object(fastener.id)).length, 4);
  assert.ok(scene.transform.object === pump, "the gizmo must attach to the selected pump");

  const beforeClone = [...scene.root.children];
  update(structuredClone(original), "pump");
  assert.ok(beforeClone.every(part => object(part.userData.componentId) === part), "equal assembly data must reuse scene objects");

  const hidden = editComponent(original, { id: "pump", patch: { hidden: true } });
  update(hidden, "pump");
  assert.ok(object("pump") === pump, "visibility changes must reuse the pump");
  assert.equal(pump.visible, false);
  assert.equal(scene.selection.visible, false);
  assert.ok(!scene.transform.object, "the gizmo must detach when its object is hidden");
  assert.ok(object("auto") === auto, "hiding a pump must reuse the connected pipe");

  const moved = editComponent(hidden, { id: "pump", patch: { hidden: false, position: [0, -150, 0], rotation: [0, 0, 90], opacity: .4 } });
  update(moved, "pump");
  assert.ok(object("pump") === pump && meshes(pump)[0].geometry === pumpGeometry, "changing pose and opacity must reuse the pump geometry");
  assert.equal(pump.visible, true);
  assert.deepEqual(pump.position.toArray(), [0, -150, 0]);
  assert.equal(pump.rotation.z, Math.PI / 2);
  assert.equal(meshes(pump)[0].material.opacity, .4);
  assert.equal(meshes(pump)[0].material.transparent, true);
  assert.ok(scene.transform.object === pump, "showing the pump must restore the gizmo");
  assert.equal(scene.selection.visible, true);
  assert.ok(new Box3().setFromObject(object("auto")).min.y < initialPipeBox.min.y - 100, "automatic pipe must reach the moved pump");
  assert.equal(meshes(object(fastener.id)).length, 0, "the disconnected joint must lose its rendered fasteners");
  assert.ok(object("collector") === collector, "the unchanged collector must be retained");

  const movedPipe = object("auto"), outline = meshes(movedPipe)[0].material;
  const faintPipe = editComponent(moved, { id: "auto", patch: { opacity: .4 } });
  update(faintPipe, "pump");
  assert.ok(object("auto") === movedPipe, "changing opacity must reuse the automatic pipe");
  assert.ok(Math.abs(meshes(movedPipe)[0].material.opacity - .18) < .001);
  update(moved, "pump");
  assert.ok(Math.abs(meshes(movedPipe)[0].material.opacity - .45) < .001);
  assert.equal(meshes(movedPipe)[0].material.transparent, true);
  assert.equal(outline.wireframe, true);

  const resized = editComponent(moved, { id: "manual", patch: { parameters: { length: 300 } } });
  const oldGeometry = meshes(manual)[0].geometry;
  let disposed = 0;
  oldGeometry.addEventListener("dispose", () => disposed++);
  update(resized, "pump");
  assert.equal(disposed, 1);
  assert.ok(Math.abs(new Box3().setFromObject(object("manual")).getSize(new Vector3()).x - 300) < .001);
  assert.ok(object("pump") === pump, "resizing a pipe must reuse the pump");

  const deleted = execute(createHistory(resized), { ...resized, components: resized.components.filter(c => c.id !== "manual") });
  update(deleted.present, "pump");
  assert.ok(!object("manual"), "deleted pipe must leave the scene");
  assert.ok(object("collector") === collector, "deletion must reuse the collector");
  const restored = undo(deleted);
  update(restored.present, "pump");
  assert.ok(Math.abs(new Box3().setFromObject(object("manual")).getSize(new Vector3()).x - 300) < .001);
  assert.ok(object("pump") === pump, "undo must reuse the pump");
  update(redo(restored).present, "pump");
  assert.ok(!object("manual"), "redo must remove the pipe");
});

test("STL arrives for retained components, skips stale objects and retries failures", async t => {
  const requests = new Map(), errors = [];
  t.mock.method(globalThis, "fetch", url => new Promise((resolve, reject) => requests.set(url, { resolve, reject })));
  const { update, object } = mount(t, { onAssetError: error => errors.push(error) });
  const directUrl = "/model-assets/viewport-direct.stl", nestedUrl = "/model-assets/viewport-nested.stl";
  const staleUrl = "/model-assets/viewport-old.stl", replacementUrl = "/model-assets/viewport-new.stl";
  const direct = component("direct", "pump", { meshUrl: directUrl });
  const nested = component("nested", "equipment", { shape: { kind: "mesh", meshUrl: nestedUrl, meshBounds: [0, 0, 0, 5, 5, 5] } });
  const neighbor = component("neighbor", "equipment");
  const stale = component("replace", "pump", { meshUrl: staleUrl });
  const first = assembly([direct, nested, neighbor, stale]);
  update(first);
  const directObject = object("direct"), oldNested = object("nested"), oldNestedPlaceholder = meshes(oldNested)[0];

  const changed = editComponent(first, { id: "neighbor", patch: { hidden: true } });
  const faded = editComponent(changed, { id: "direct", patch: { opacity: .35 } });
  update(faded);
  assert.ok(object("direct") === directObject, "updating another component or opacity must retain the pending STL object");
  update({ ...faded, components: faded.components.filter(c => c.id !== "nested") });
  const restored = { ...faded, components: faded.components.map(c => c.id === stale.id ? { ...c, meshUrl: replacementUrl } : c) };
  update(restored);
  assert.ok(object("nested") !== oldNested, "a removed and restored component gets a new scene object");
  const replacement = object("replace"), replacementPlaceholder = meshes(replacement)[0];
  const replacementRequest = requests.get(replacementUrl);

  const triangle = Buffer.alloc(134);
  triangle.writeUInt32LE(1, 80);
  [0, 0, 1, 0, 0, 0, 20, 0, 0, 0, 20, 0].forEach((n, i) => triangle.writeFloatLE(n, 84 + i * 4));
  requests.get(directUrl).resolve(new Response(triangle));
  requests.get(nestedUrl).resolve(new Response(triangle));
  requests.get(staleUrl).reject(new Error("old asset is unavailable"));
  replacementRequest.reject(new Error("replacement temporarily unavailable"));
  await setImmediate();

  assert.equal(meshes(directObject)[0].geometry.attributes.position.count, 3);
  assert.equal(meshes(directObject)[0].material.opacity, .35);
  assert.equal(meshes(object("nested"))[0].geometry.attributes.position.count, 3);
  assert.ok(meshes(oldNested)[0] === oldNestedPlaceholder, "a stale STL response must not mutate a detached object");
  assert.ok(meshes(replacement)[0] === replacementPlaceholder, "a failed request must leave the placeholder visible");
  assert.equal(errors.length, 1, "only the current STL failure should be reported");
  assert.match(errors[0], /^replace: .*CAD/);

  const directMesh = meshes(directObject)[0];
  const visibleNeighbor = editComponent(restored, { id: "neighbor", patch: { hidden: false } });
  update(visibleNeighbor);
  const retry = requests.get(replacementUrl);
  assert.ok(retry && retry !== replacementRequest, "a later assembly edit must retry the failed STL request");
  retry.resolve(new Response(triangle));
  await setImmediate();
  assert.ok(object("replace") === replacement, "a retry must reuse the component's group");
  assert.equal(meshes(replacement)[0].geometry.attributes.position.count, 3);
  assert.ok(meshes(directObject)[0] === directMesh, "a retry must leave previously loaded meshes intact");
  assert.equal(errors.length, 1);

  update(editComponent(visibleNeighbor, { id: "direct", patch: { opacity: 1 } }));
  assert.ok(object("direct") === directObject, "restoring opacity must keep the loaded STL object");
  assert.equal(meshes(directObject)[0].material.opacity, 1);
  assert.equal(meshes(directObject)[0].material.transparent, false);
});

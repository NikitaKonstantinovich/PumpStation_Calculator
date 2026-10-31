import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadTs } from "./load-ts.mjs";
const fixture = JSON.parse(await readFile(new URL("./fixtures/insertion-3d.json", import.meta.url), "utf8"));
globalThis.__insertion3dHash = value => createHash("sha256").update(value).digest("hex");
const replacements = { [new URL("../app/auth-server.ts", import.meta.url).href]: "export const sha256=async value=>globalThis.__insertion3dHash(value);" };
const server = await loadTs(new URL("../app/component-insert-3d-server.ts", import.meta.url), replacements);
const core = await loadTs(new URL("../app/model-editor/insertion-template.ts", import.meta.url));
const model = await loadTs(new URL("../app/model-editor/model.ts", import.meta.url));
const validation = await loadTs(new URL("../app/model-editor/insertion-types.ts", import.meta.url));
const rendererUrl = new URL("../app/model-editor/insertion-renderer.ts", import.meta.url);
const renderer = await loadTs(rendererUrl, { [rendererUrl.href]: (await readFile(rendererUrl, "utf8")).replace('from "three"', `from ${JSON.stringify(new URL("../node_modules/three/build/three.module.js", import.meta.url).href)}`) });
const build = (i, angle = 0, f = fixture) => server.insertion3d(f.rows[i], f.source, f.catalog, { id: "saved-insert-123", revision: 3 }, angle);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const closeVec = (a, b) => a.forEach((n, i) => close(n, b[i]));
const partPose = (piece, point) => model.add(piece.position, model.rotate(point, piece.rotation));

test("real DN125–65 PN25 uses 127 mm reducer, 137 mm finished length and 5 mm seats without pipe extensions", async () => {
  const t = await build(0), g = t.geometry;
  assert.equal(t.status, "layout"); assert.ok(validation.parseInsertionTemplate(t));
  assert.equal(g.baseLengthMm, 127); assert.equal(g.totalLengthMm, 137);
  assert.equal(g.pieces.length, 3); assert.equal(g.pieces[0].shape.outerMm, 139.7);
  assert.equal(g.pieces.find(p => p.id === "right").shape.boltHoles, 8);
  closeVec(g.ports[0].point, [0, 0, 0]); closeVec(g.ports[1].point, [137, 0, 0]);
  closeVec(g.ports[0].axis, [-1, 0, 0]); closeVec(g.ports[1].axis, [1, 0, 0]);
  for (const joint of g.joints) {
    const a = g.pieces.find(p => p.id === joint.a.piece), b = g.pieces.find(p => p.id === joint.b.piece);
    const ap = a.ports.find(p => p.id === joint.a.port), bp = b.ports.find(p => p.id === joint.b.port);
    closeVec(partPose(a, ap.point), partPose(b, bp.point));
    closeVec(model.rotate(ap.axis, a.rotation), model.rotate(bp.axis, b.rotation).map(n => -n));
  }
  assert.equal(g.pieces.find(p => p.id === "left").shape.lengthMm - 5, 21);
});

test("straight collar assembly uses exact 3 mm CAD, butt joints and auxiliary loose flanges without changing price/length", async () => {
  const t = await build(1), g = t.geometry;
  assert.equal(g.baseLengthMm, 130); assert.equal(g.totalLengthMm, 186);
  const collars = g.pieces.filter(p => p.id === "left" || p.id === "right");
  assert.ok(collars.every(p => p.fidelity === "cad"));
  assert.equal(g.pieces.filter(p => p.auxiliary).length, 2);
  assert.equal(t.source.price, fixture.rows[1].price);
  assert.ok(g.joints.every(j => j.kind === "butt"));
  closeVec(g.pieces.find(p => p.id === "left-loose").position, [3, 0, 0]);
  // Native collar X=L is the lip; it is correctly mapped to the external plane.
  const c = collars[0], shape = c.shape;
  closeVec(model.add(shape.modelPosition, model.rotate([28, 0, 0], shape.modelRotation)), [0, 0, 0]);
  closeVec(c.ports[1].point, [28, 0, 0]);
});

test("eccentricity rotates while sensor stays upward at base midpoint; cap occupies its provisional thread port", async () => {
  const t = await build(2, 90), g = t.geometry;
  closeVec(g.ports[1].point, [137, -31.8, 0]);
  const nipple = g.pieces.find(p => p.id === "sensor-nipple"), sensor = g.ports.find(p => p.id === "sensor");
  close(nipple.position[0], 5 + 127 / 2); close(nipple.position[1], -15.9);
  closeVec(model.rotate([1, 0, 0], nipple.rotation), [0, 0, 1]);
  closeVec(sensor.axis, [0, 0, 1]); close(sensor.point[2] - nipple.position[2], 60);
  assert.equal(sensor.occupiedBy, "sensor-plug"); assert.equal(sensor.thread, '1/2"'); assert.ok(sensor.provisional);
  assert.equal(g.pieces.find(p => p.id === "sensor-plug").shape.kind, "marker");
  assert.equal(t.status, "incomplete"); assert.ok(t.issues.some(s => s.includes("глубины навинчивания")));
  assert.ok(t.warnings.some(s => s.includes("25 бар")));
});

test("eccentric default has a level top, lower slope, matching joints and the same opaque material as a pipe", async () => {
  const t = await build(2), body = t.geometry.pieces.find(p => p.id === "base"), s = body.shape;
  close(s.offset[2] + s.smallOuterMm / 2, s.outerMm / 2);
  assert.ok(s.offset[2] - s.smallOuterMm / 2 > -s.outerMm / 2);
  closeVec(t.geometry.ports.find(p => p.id === "right").point, [137, 0, 31.8]);
  for (const joint of t.geometry.joints) {
    const a = t.geometry.pieces.find(p => p.id === joint.a.piece), b = t.geometry.pieces.find(p => p.id === joint.b.piece);
    closeVec(partPose(a, a.ports.find(p => p.id === joint.a.port).point), partPose(b, b.ports.find(p => p.id === joint.b.port).point));
  }
  const reducer = renderer.pieceObject(body), pipe = renderer.pieceObject({ ...body, shape:{kind:"tube",lengthMm:127,outerMm:139.7,innerMm:119.7}, fidelity:"parametric" });
  try {
    const mesh = reducer.children[0], pipeMat = pipe.children[0].material;
    for (const key of ["roughness", "metalness", "opacity", "transparent"]) assert.equal(mesh.material[key], pipeMat[key]);
    assert.equal(mesh.material.color.getHex(), pipeMat.color.getHex());
    assert.equal(mesh.material.opacity, 1);
    const positions = mesh.geometry.getAttribute("position");
    const top = start => Math.max(...Array.from({length:64}, (_,i) => positions.getZ(start+i)));
    assert.ok(Math.abs(top(0)-top(64)) < 1e-5); // Test the actual rendered mesh, not only the descriptor.
    assert.equal(body.fidelity,"outline"); assert.ok(t.warnings.some(w => /точной CAD-модели нет/.test(w)));
  } finally { renderer.disposeInsertionObject(reducer); renderer.disposeInsertionObject(pipe); }
});

test("whole component transforms all connections and survives project normalization with database link and warnings", async () => {
  const t = await build(2), c = core.insertionComponent(t, "insert-test"); c.position = [100, 200, 300]; c.rotation = [0, 0, 90]; c.insertion.hiddenPieceIds = ["sensor-plug"];
  const assembly = { version: 1, sourceFingerprint: "test", components: [c] };
  closeVec(model.portPoint(assembly, { componentId: c.id, portId: "right" }), [100, 337, 331.8]);
  closeVec(model.portAxis(assembly, { componentId: c.id, portId: "right" }), [0, 1, 0]);
  const saved = model.normalizeEditor(JSON.parse(JSON.stringify({ ...model.emptyEditor(), assembly, selectedId: c.id })));
  assert.deepEqual(saved.assembly.components[0].insertion, c.insertion);
  assert.equal(saved.assembly.components[0].equipmentId, "calculated-insertion:saved-insert-123");
  assert.equal(saved.assembly.components[0].ports.find(p => p.id === "sensor").occupiedBy, "sensor-plug");
});

test("geometry cache ignores price/name/revision, invalidates physical geometry and clones resources safely", async () => {
  const a = await build(0), f = structuredClone(fixture);
  f.rows[0].price += 100; f.rows[0].name += " новое название"; f.catalog.parts.forEach(p => { p.price = 42; });
  const b = await server.insertion3d(f.rows[0], f.source, f.catalog, { id: "saved-insert-123", revision: 4 }, 0);
  assert.equal(a.geometryKey, b.geometryKey); assert.notEqual(a.source.price, b.source.price);
  assert.notEqual((await build(2, 0)).geometryKey, (await build(2, 180)).geometryKey);
  const cache = new renderer.InsertionRenderCache(), x = cache.get(core.insertionComponent(a, "a")), y = cache.get(core.insertionComponent(b, "b"));
  assert.equal(cache.builds, 1); assert.notEqual(x.children[0].children[0].geometry, y.children[0].children[0].geometry);
  renderer.disposeInsertionObject(x); assert.ok(y.children[0].children[0].geometry.getAttribute("position").count > 0);
  cache.get(core.insertionComponent(await build(2), "c")); assert.equal(cache.builds, 2);
  renderer.disposeInsertionObject(y); cache.dispose();
});

test("matching reducer CAD is reused; changed dimensions never select an incompatible model", async () => {
  const t = await build(3); assert.equal(t.geometry.pieces[0].fidelity, "cad");
  closeVec(model.rotate([0, 0, 76], t.geometry.pieces[0].shape.modelRotation), [76, 0, 0]);
  const catalog = structuredClone(fixture.catalog), part = catalog.parts.find(p => p.id === "переходы-005-r0365"); part.wallThickness = 5;
  const context = server.insertionGeometryContext(fixture.source, catalog);
  assert.equal(context.models[part.id], undefined);
  assert.throws(() => core.prepareInsertionTemplate(fixture.rows[3], context), /Нет|Нельзя/);
  const missing = server.insertionGeometryContext(fixture.source, fixture.catalog); missing.models = {};
  const fallback = core.prepareInsertionTemplate(fixture.rows[3], missing);
  assert.equal(fallback.geometry.pieces[0].fidelity, "outline"); assert.ok(fallback.warnings.some(s => s.includes("точной CAD-модели нет")));
});

test("independent end executions remain distinct and missing dimensions are explicit", async () => {
  const t = await build(4);
  assert.equal(t.geometry.ports[0].connection, "collar"); assert.equal(t.geometry.ports[1].connection, "flanged");
  assert.equal(t.geometry.ports[0].dn, 100); assert.equal(t.geometry.ports[1].dn, 100);
  const context = server.insertionGeometryContext(fixture.source, fixture.catalog); delete context.flanges["newkey-din2503:NK-FDh125-4"];
  const partial = core.prepareInsertionTemplate(fixture.rows[0], context); assert.equal(partial.status, "incomplete"); assert.ok(partial.issues.some(s => s.includes("не хватает размеров")));
});

test("ports reject occupied/incompatible connections, and project parser rejects unsafe geometry", async () => {
  const t = await build(2), a = t.geometry.ports[0], b = structuredClone(a); b.axis = [1, 0, 0];
  assert.deepEqual(core.connectionCompatibility(a, b), []);
  b.dn = 50; assert.ok(core.connectionCompatibility(a, b).includes("Разные DN"));
  const sensor = t.geometry.ports[2]; assert.ok(core.connectionCompatibility(sensor, sensor).includes("Подключение занято"));
  const bad = await build(1); bad.geometry.pieces[1].shape.meshUrl = "https://example.test/private.stl";
  assert.equal(validation.parseInsertionTemplate(bad), null);
  const nonfinite = await build(0); nonfinite.geometry.ports[0].point[0] = NaN; assert.equal(validation.parseInsertionTemplate(nonfinite), null);
  const ring = await build(0); ring.geometry.pieces[1].shape.innerMm = 500; assert.equal(validation.parseInsertionTemplate(ring), null);
});

test("60 mm sensor nipple has a closed hollow helical mesh for both materials and survives project reload", async()=>{
  for(const material of ["aisi304","st20"]){
    const f=JSON.parse(JSON.stringify(fixture).replaceAll("aisi304",material));
    const before=JSON.stringify(f.rows[2]),t=await build(2,0,f);
    assert.equal(JSON.stringify(f.rows[2]),before,"geometry must not mutate engineering calculation");
    const piece=t.geometry.pieces.find(p=>p.id==="sensor-nipple"),s=piece.shape;
    assert.equal(s.lengthMm,60);assert.equal(s.thread.lengthMm,18);close(s.thread.pitchMm,25.4/14);
    assert.ok(s.thread.depthMm<(s.outerMm-s.innerMm)/2);
    assert.equal(t.source.price,f.rows[2].price);assert.equal(t.geometry.totalLengthMm,f.rows[2].totalLengthMm);
    const loaded=validation.parseInsertionTemplate(JSON.parse(JSON.stringify(t)));assert.deepEqual(loaded.geometry,t.geometry);
    const cap=t.geometry.pieces.find(p=>p.id==="sensor-plug"),port=piece.ports[0];
    closeVec(partPose(piece,port.point),cap.position);
    assert.equal(port.thread,'1/2"');assert.equal(port.gender,"male");
    const object=renderer.pieceObject(piece),mesh=object.children.find(c=>c.isMesh),g=mesh.geometry;
    try{
      g.computeBoundingBox();close(g.boundingBox.min.x,0);close(g.boundingBox.max.x,60);
      const positions=g.getAttribute("position"),index=g.index.array,edges=new Map();
      let groove=false;
      for(let i=0;i<positions.count;i++){
        const x=positions.getX(i),r=Math.hypot(positions.getY(i),positions.getZ(i));
        assert.ok(r>=s.innerMm/2-1e-5 && r<=s.outerMm/2+1e-5);
        if(x>42&&x<60&&r<s.outerMm/2-.1&&r>s.innerMm/2+.1)groove=true;
      }
      assert.ok(groove,"actual mesh contains thread grooves, not just metadata");
      for(let i=0;i<index.length;i+=3)for(let j=0;j<3;j++){
        const a=index[i+j],b=index[i+(j+1)%3],k=[Math.min(a,b),Math.max(a,b)].join('/'),v=edges.get(k)??[0,0];
        v[0]++;v[1]+=a<b?1:-1;edges.set(k,v);
      }
      assert.ok([...edges.values()].every(([count,balance])=>count===2&&balance===0),"closed consistently oriented hollow body");
    }finally{renderer.disposeInsertionObject(object);}
    const old=structuredClone(t);old.geometry.ruleVersion=3;delete old.geometry.pieces.find(p=>p.id==="sensor-nipple").shape.thread;
    old.geometry.pieces.find(p=>p.id==="sensor-nipple").shape.lengthMm=110;
    assert.notEqual(core.insertionGeometrySignature(old),core.insertionGeometrySignature(t),"old cached geometry must not be reused");
  }
});

test("saved thread descriptors reject unbounded tessellation and wall penetration",async()=>{
  const t=await build(2);
  const {parseLineShape}=await loadTs(new URL('../app/model-editor/line-types.ts',import.meta.url));
  for(const patch of [{pitchMm:0},{pitchMm:0.00001},{depthMm:99},{lengthMm:61},{pitchMm:NaN}]){
    const bad=structuredClone(t),s=bad.geometry.pieces.find(p=>p.id==='sensor-nipple').shape;
    Object.assign(s.thread,patch);assert.equal(validation.parseInsertionTemplate(bad),null);assert.equal(parseLineShape(s),undefined);
  }
});

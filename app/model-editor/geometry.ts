import * as THREE from "three";
import { pipePoints, type Assembly, type Component, type Vec3 } from "./model";
import { frameBoxes } from "./snap-geometry";
import { pieceObject, ringGeometry, type InsertionRenderCache } from "./insertion-renderer";
import { collectorObject, type CollectorRenderCache } from "./collector-renderer";
import { fastenerObject } from "./fastener-renderer";
import { frameHardwareObject, frameProfileObject } from "./frame-hardware-renderer";
import { PIPE_APPEARANCE } from "./pipe-appearance";

const colors = { pump: 0x4587a6, collector: PIPE_APPEARANCE.color, pipe: PIPE_APPEARANCE.color, frame: 0x405568, equipment: 0x62877b };
export const vector = (p: Vec3) => new THREE.Vector3(...p);
export function material(c: Component) {
  const kipColors = { valve: 0xaeb6bb, gauge: 0xc9ced2, adapter: 0xb69a52, bush: 0xb69a52, relay: 0x464c54, transducer: 0xc3cbd0, connector: 0x30343a };
  const nativeColors = c.instrumentMount?.role === "gauge" || c.instrumentMount?.role === "valve";
  const cabinetColor=c.frameMount?.role==="cabinet"?0xbfc6cc:c.frameMount?.role.startsWith("stand-")?(c.frameColor==="red"?0xa31720:0x005293):undefined;
  return new THREE.MeshStandardMaterial({ ...PIPE_APPEARANCE, color: cabinetColor ?? (c.kind==="frame"&&c.frameColor ? (c.frameColor==="red"?0xa31720:0x005293) : c.tankMount?.role==="tank"?0x22538a:c.tankMount?.role==="valve"?0xb8bec4:nativeColors ? 0xffffff : c.instrumentMount ? kipColors[c.instrumentMount.role] : colors[c.kind]), vertexColors: nativeColors, transparent: c.opacity < 1, opacity: c.opacity, side: THREE.DoubleSide });
}
export function cylinder(a: Vec3, b: Vec3, diameter: number, mat: THREE.Material): THREE.Mesh {
  const start = vector(a), end = vector(b), delta = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, Math.max(.001, delta.length()), 32), mat);
  mesh.position.copy(start.add(end).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}
function localPipePoints(assembly: Assembly, c: Component): Vec3[] {
  if (!c.routing) return [[-c.parameters.length / 2, 0, 0], [c.parameters.length / 2, 0, 0]];
  if (!c.routing.automatic || c.locked) return c.routing.points;
  // Automatic routes are resolved from the connected ports in world space.
  const inverse = new THREE.Matrix4().compose(
    vector(c.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...c.rotation.map(THREE.MathUtils.degToRad) as Vec3)),
    new THREE.Vector3(1, 1, 1),
  ).invert();
  return pipePoints(assembly, c).map(p => vector(p).applyMatrix4(inverse).toArray() as Vec3);
}

export type ComponentRenderState = { component: Component; route?: Vec3[] };
const hasTankShell = (c: Component) => c.tankMount?.role === "tank" && c.tankMount.volume === 8 && !c.meshUrl;

export function componentRenderState(assembly: Assembly, c: Component): ComponentRenderState {
  // Model builders can retain the pipe record when either endpoint changes.
  const routed = c.kind === "pipe" && !c.line && !c.shape && !c.insertion && !c.collector && !c.fastener && !hasTankShell(c);
  return { component: c, route: routed ? localPipePoints(assembly, c) : undefined };
}

function sameRenderData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((value, i) => sameRenderData(value, b[i]));
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameRenderData(left[key], right[key]));
}

function geometryInputs(c: Component): unknown[] {
  // Include the inputs to the procedural builders and STL materials. Omit
  // editor state and calculation diagnostics, which can change independently.
  const inputs = [c.kind, c.meshUrl, c.frameColor, c.frameDrilling, c.frameHardware, c.frameProfile, c.tankMount?.role, c.instrumentMount?.role];
  const b = c.fastener;
  if (b) return [...inputs, "fastener", b.status, b.dimensions, b.grip, b.centers];
  if (c.collector) return [...inputs, "collector", c.collector.template, c.collector.selectedPieceId];
  if (c.insertion) return [...inputs, "insertion", c.insertion.template.geometry];
  if (hasTankShell(c)) return [...inputs, "tank-shell", c.bounds];
  if (c.line || c.shape) return [...inputs, "piece", c.shape, c.line?.fidelity, c.line?.auxiliary];
  return [...inputs, c.bounds, c.parameters, c.pumpGeometry?.envelope, c.pumpGeometry?.schematic];
}

export function sameComponentGeometry(previous: ComponentRenderState, next: ComponentRenderState): boolean {
  return sameRenderData(previous.route, next.route) &&
    (previous.component === next.component || sameRenderData(geometryInputs(previous.component), geometryInputs(next.component)));
}

const materialDefaults = new WeakMap<THREE.Material, { opacity: number; transparent: boolean }>();

export function setMaterialOpacity(mat: THREE.Material, factor: number) {
  let base = materialDefaults.get(mat);
  if (!base) {
    base = { opacity: mat.opacity, transparent: mat.transparent };
    materialDefaults.set(mat, base);
  }
  mat.opacity = base.opacity * factor;
  const transparent = base.transparent || mat.opacity < 1;
  if (mat.transparent !== transparent) {
    mat.transparent = transparent;
    mat.needsUpdate = true;
  }
}

export function updateComponentAppearance(group: THREE.Group, c: Component, previous?: Component) {
  group.visible = !c.hidden;
  const hidden = (c.collector ?? c.insertion)?.hiddenPieceIds;
  const pieceOpacities = c.collector?.pieceOpacities;
  if (previous?.opacity === c.opacity &&
      sameRenderData(hidden, (previous.collector ?? previous.insertion)?.hiddenPieceIds) &&
      sameRenderData(pieceOpacities, previous.collector?.pieceOpacities)) return;
  const update = (object: THREE.Object3D, opacity: number) => {
    const pieceId = object.userData.pieceId as string | undefined;
    if (pieceId) {
      if (hidden) object.visible = !hidden.includes(pieceId);
      opacity *= pieceOpacities?.[pieceId] ?? 1;
    }
    if (object.userData.fixedOpacity) return;
    // Root lines are the bounds outline or port guides, drawn at full opacity.
    if (object instanceof THREE.Mesh || (object instanceof THREE.LineSegments && object.parent !== group)) {
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) setMaterialOpacity(mat, opacity);
    }
    for (const child of object.children) update(child, opacity);
  };
  for (const child of group.children) update(child, c.opacity);
}

export function componentObject(assembly: Assembly, c: Component, insertionCache?: InsertionRenderCache, collectorCache?: CollectorRenderCache, route?: Vec3[]): THREE.Group {
  // Build materials at full component opacity so adjustments can be reversed.
  const opaque = { ...c, opacity: 1 };
  const group = new THREE.Group(), mat = material(opaque), p = c.parameters;
  group.userData.componentId = c.id;
  if (c.frameHardware) { mat.dispose(); group.add(frameHardwareObject(opaque)); }
  else if (c.frameProfile) { mat.dispose(); group.add(frameProfileObject(opaque)); }
  else if (c.fastener) { mat.dispose(); group.add(fastenerObject(opaque)); }
  else if (c.collector) {
    mat.dispose();
    group.add(collectorObject({ ...opaque, collector: { ...c.collector, pieceOpacities: undefined } }, collectorCache));
  } else if (c.insertion && insertionCache) {
    mat.dispose(); group.add(insertionCache.get(opaque));
    // Guides are visual annotations, not physical components or additional dimensions.
    for (const port of c.insertion.template.geometry.ports) {
      const color = port.purpose === "sensor" ? 0xeaa14e : port.id === "left" ? 0x46be8a : 0x579ce0;
      const end = port.point.map((v, i) => v + port.axis[i] * 25) as Vec3;
      const guide = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([vector(port.point), vector(end)]), new THREE.LineBasicMaterial({ color, depthTest: false }));
      guide.renderOrder = 90; group.add(guide);
    }
  }
  else if (hasTankShell(c)) {
    const r=(c.bounds![3]-c.bounds![0])/2,h=c.bounds![5]-c.bounds![2];
    const profile=[[0,.087],[.35,.087],[.7,.138],[.94,.241],[1,.322],[1,.74],[.95,.82],[.75,.907],[.35,.955],[0,.961]].map(([radius,z])=>new THREE.Vector2(radius*r,z*h));
    group.add(new THREE.Mesh(new THREE.LatheGeometry(profile,64).rotateX(Math.PI/2),mat));
    const metal=new THREE.MeshStandardMaterial({color:0xb8bec4,metalness:.6,roughness:.4});
    group.add(cylinder([0,0,0],[0,0,h*.058],26.4,metal));
    group.add(cylinder([0,0,h*.058],[0,0,h*.087],100,metal.clone()));
    group.add(cylinder([0,0,h*.961],[0,0,h],16,metal.clone()));
    for(const z of [.43,.45]){const seam=new THREE.Mesh(new THREE.TorusGeometry(r*.995,.45,8,64),mat.clone());seam.position.z=z*h;group.add(seam);}
  }
  else if (c.line || c.shape) {
    mat.dispose();
    const piece = pieceObject({ id: "line-body", componentId: c.equipmentId ?? c.id, name: c.name, role: c.line?.role ?? "body", auxiliary: c.line?.auxiliary ?? false,
      position: [0, 0, 0], rotation: [0, 0, 0], shape: c.shape ?? { kind: "marker" }, ports: [], source: c.sourceNote, fidelity: c.line?.fidelity ?? "parametric" });
    group.add(piece);
  }
  else if (c.kind === "pipe") {
    const points = route ?? localPipePoints(assembly, c);
    if (points.length === 2 && p.wallThickness && p.wallThickness * 2 < p.diameter) {
      const delta = vector(points[1]).sub(vector(points[0]));
      const mesh = new THREE.Mesh(ringGeometry({ kind: "tube", outerMm: p.diameter, innerMm: p.diameter - 2 * p.wallThickness, lengthMm: delta.length() }), mat);
      mesh.position.copy(vector(points[0])); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), delta.normalize()); group.add(mesh);
    } else {
      // Unknown wall/bend radii are an outline, never capped solid cylinders or spherical elbows.
      mat.wireframe = true; mat.opacity *= .45; mat.transparent = true;
      for (let i = 1; i < points.length; i++) group.add(cylinder(points[i - 1], points[i], p.diameter, mat));
    }
  } else if (c.kind === "collector") {
    if (p.wallThickness && p.wallThickness * 2 < p.diameter) {
      const mesh = new THREE.Mesh(ringGeometry({ kind: "tube", outerMm: p.diameter, innerMm: p.diameter - 2 * p.wallThickness, lengthMm: p.length }), mat);
      mesh.position.x = -p.length / 2; group.add(mesh);
    } else { mat.wireframe = true; mat.opacity *= .4; mat.transparent = true; group.add(cylinder([-p.length / 2, 0, 0], [p.length / 2, 0, 0], p.diameter, mat)); }
  } else if (c.kind === "frame") {
    for (const box of frameBoxes(p)) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(...box.size), mat); beam.position.copy(vector(box.center)); group.add(beam);
    }
  } else {
    if (c.kind === "pump" && c.pumpGeometry?.envelope === "incomplete") {
      mat.wireframe = !c.pumpGeometry.schematic; mat.transparent = true; mat.opacity *= c.pumpGeometry.schematic ? .65 : .5; mat.color.set(0xe3a145);
    }
    const b = c.bounds ?? [-p.length / 2, -p.width / 2, -p.height / 2, p.length / 2, p.width / 2, p.height / 2];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]), mat);
    mesh.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x24485d })); edges.position.copy(mesh.position); group.add(edges);
  }
  group.position.copy(vector(c.position));
  group.rotation.set(...c.rotation.map(v => THREE.MathUtils.degToRad(v)) as Vec3);
  updateComponentAppearance(group, c);
  return group;
}
export function disposeObject(object: THREE.Object3D) {
  object.traverse(o => {
    if (o instanceof THREE.InstancedMesh) o.dispose();
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      o.geometry.dispose();
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.dispose();
    }
  });
}

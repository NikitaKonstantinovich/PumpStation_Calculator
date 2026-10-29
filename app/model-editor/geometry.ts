import * as THREE from "three";
import { pipePoints, type Assembly, type Component, type Vec3 } from "./model";
import { frameBoxes } from "./snap-geometry";
import { pieceObject, ringGeometry, type InsertionRenderCache } from "./insertion-renderer";
import { collectorObject, type CollectorRenderCache } from "./collector-renderer";

const colors = { pump: 0x4587a6, collector: 0x91a8b5, pipe: 0x91a8b5, frame: 0x405568, equipment: 0x62877b };
export const vector = (p: Vec3) => new THREE.Vector3(...p);
export function material(c: Component) {
  return new THREE.MeshStandardMaterial({ color: colors[c.kind], roughness: .6, metalness: .2, transparent: c.opacity < 1, opacity: c.opacity, side: THREE.DoubleSide });
}
export function cylinder(a: Vec3, b: Vec3, diameter: number, mat: THREE.Material): THREE.Mesh {
  const start = vector(a), end = vector(b), delta = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, Math.max(.001, delta.length()), 32), mat);
  mesh.position.copy(start.add(end).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}
export function componentObject(assembly: Assembly, c: Component, insertionCache?: InsertionRenderCache, collectorCache?: CollectorRenderCache): THREE.Group {
  const group = new THREE.Group(), mat = material(c), p = c.parameters;
  group.userData.componentId = c.id; group.visible = !c.hidden;
  if (c.collector) { mat.dispose(); group.add(collectorObject(c, collectorCache)); }
  else if (c.insertion && insertionCache) {
    mat.dispose(); group.add(insertionCache.get(c));
    // Guides are visual annotations, not physical components or additional dimensions.
    for (const port of c.insertion.template.geometry.ports) {
      const color = port.purpose === "sensor" ? 0xeaa14e : port.id === "left" ? 0x46be8a : 0x579ce0;
      const end = port.point.map((v, i) => v + port.axis[i] * 25) as Vec3;
      const guide = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([vector(port.point), vector(end)]), new THREE.LineBasicMaterial({ color, depthTest: false }));
      guide.renderOrder = 90; group.add(guide);
    }
  }
  else if (c.line || c.shape) {
    mat.dispose();
    const piece = pieceObject({ id: "line-body", componentId: c.equipmentId ?? c.id, name: c.name, role: c.line?.role ?? "body", auxiliary: c.line?.auxiliary ?? false,
      position: [0, 0, 0], rotation: [0, 0, 0], shape: c.shape ?? { kind: "marker" }, ports: [], source: c.sourceNote, fidelity: c.line?.fidelity ?? "parametric" });
    piece.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.opacity *= c.opacity; m.transparent ||= m.opacity < 1; } });
    group.add(piece);
  }
  else if (c.kind === "pipe") {
    // Route geometry is in world coordinates; the manipulation anchor still follows component pose.
    const inverse = new THREE.Matrix4().compose(vector(c.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...c.rotation.map(v => THREE.MathUtils.degToRad(v)) as Vec3)), new THREE.Vector3(1, 1, 1)).invert();
    const points = pipePoints(assembly, c).map(v => vector(v).applyMatrix4(inverse).toArray() as Vec3);
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
    const b = c.bounds ?? [-p.length / 2, -p.width / 2, -p.height / 2, p.length / 2, p.width / 2, p.height / 2];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]), mat);
    mesh.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x24485d })); edges.position.copy(mesh.position); group.add(edges);
  }
  group.position.copy(vector(c.position));
  group.rotation.set(...c.rotation.map(v => THREE.MathUtils.degToRad(v)) as Vec3);
  return group;
}
export function disposeObject(object: THREE.Object3D) {
  object.traverse(o => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.dispose();
    }
  });
}

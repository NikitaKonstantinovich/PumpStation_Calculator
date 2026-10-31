import * as THREE from "three";
import type { Component, Vec3 } from "./model";
import type { InsertionPiece, InsertionShape } from "./insertion-types";
import { flangeHoleCenters } from "./flange-hole-pattern";
import { PIPE_APPEARANCE } from "./pipe-appearance";
import { threadedTubeMesh } from "./threaded-tube";

export function ringGeometry(shape: InsertionShape): THREE.BufferGeometry {
  const s = new THREE.Shape(), radius = shape.outerMm! / 2;
  s.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const hole = (x: number, y: number, r: number) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, Math.PI * 2, true); s.holes.push(p); };
  if (shape.innerMm) hole(0, 0, shape.innerMm / 2);
  for (const p of flangeHoleCenters(shape)) hole(-p[2], p[1], shape.boltHoleMm! / 2);
  return new THREE.ExtrudeGeometry(s, { depth: shape.lengthMm!, bevelEnabled: false, steps: 1, curveSegments: 32 }).rotateY(Math.PI / 2);
}
/** Ruled hollow envelope, explicitly marked as layout when the exact reducer profile is unavailable. */
function reducer(s: InsertionShape): THREE.BufferGeometry {
  const points: number[] = [], triangles: number[] = [], N = 64, off = s.offset ?? [0, 0, 0];
  const diameters = [s.outerMm!, s.smallOuterMm!, s.innerMm ?? s.outerMm!, s.smallInnerMm ?? s.smallOuterMm!];
  for (let ring = 0; ring < 4; ring++) for (let i = 0; i < N; i++) {
    const end = ring % 2, a = 2 * Math.PI * i / N;
    points.push(end * s.lengthMm!, Math.cos(a) * diameters[ring] / 2 + end * off[1], Math.sin(a) * diameters[ring] / 2 + end * off[2]);
  }
  for (const [a, b] of [[0, 1], [3, 2], [2, 0], [1, 3]]) for (let i = 0; i < N; i++) {
    const j = (i + 1) % N; triangles.push(a * N + i, b * N + i, b * N + j, a * N + i, b * N + j, a * N + j);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3)); geometry.setIndex(triangles); geometry.computeVertexNormals(); return geometry;
}
export function disposeInsertionObject(object: THREE.Object3D) {
  object.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } });
}
export function pieceObject(p: InsertionPiece): THREE.Group {
  const group = new THREE.Group(), s = p.shape;
  group.userData.pieceId = p.id;
  const outline = p.fidelity === "outline" || p.fidelity === "missing";
  const pipeBody = (s.kind === "tube" || s.kind === "reducer-outline") && p.fidelity !== "missing";
  const mat = new THREE.MeshStandardMaterial({ ...(pipeBody ? PIPE_APPEARANCE : { color: outline ? 0xd1a24c : p.auxiliary ? 0x6d8ba0 : 0xaabdc6, metalness: .35, roughness: .5 }), side: THREE.DoubleSide, transparent: outline && !pipeBody, opacity: outline && !pipeBody ? .55 : 1, wireframe: p.fidelity === "missing" });
  if (s.kind === "flange" && s.faceHeightMm && s.faceDiameterMm) {
    // x=0 is the mating face. The raised face is part of total b, never added to it.
    group.add(new THREE.Mesh(ringGeometry({ ...s, lengthMm: s.lengthMm! - s.faceHeightMm }).translate(s.faceHeightMm, 0, 0), mat));
    group.add(new THREE.Mesh(ringGeometry({ kind: "tube", outerMm: s.faceDiameterMm, innerMm: s.innerMm, lengthMm: s.faceHeightMm }), mat));
  } else if (s.kind === "tube" && s.thread) {
    const data = threadedTubeMesh(s), geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices); geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry, mat));
  } else if (s.kind === "tube" || s.kind === "flange") group.add(new THREE.Mesh(ringGeometry(s), mat));
  else if (s.kind === "reducer-outline") { mat.wireframe ||= !s.innerMm || !s.smallInnerMm; group.add(new THREE.Mesh(reducer(s), mat)); }
  else if (s.kind === "collar") {
    group.add(new THREE.Mesh(ringGeometry({ ...s, outerMm: s.lipOuterMm, lengthMm: s.lipThicknessMm }), mat));
    const neck = new THREE.Mesh(ringGeometry({ ...s, lengthMm: s.lengthMm! - s.lipThicknessMm! }), mat); neck.position.x = s.lipThicknessMm!; group.add(neck);
  } else if (s.kind === "mesh" && s.meshBounds) {
    const b = s.meshBounds, placeholder = new THREE.Mesh(new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]), new THREE.MeshBasicMaterial({ color: 0xc09045, wireframe: true }));
    placeholder.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    const frame = new THREE.Group(); frame.position.fromArray(s.modelPosition ?? [0, 0, 0]); frame.rotation.set(...(s.modelRotation ?? [0, 0, 0]).map(a => a * Math.PI / 180) as Vec3); frame.add(placeholder); group.add(frame);
  } else {
    // Symbolic cross, not a substitute for missing physical dimensions.
    const marker = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([[-8, 0, 0], [8, 0, 0], [0, -8, 0], [0, 8, 0], [0, 0, -8], [0, 0, 8]].map(v => new THREE.Vector3(...v))), new THREE.LineBasicMaterial({ color: 0xff7845, depthTest: false })); group.add(marker);
    if (s.lengthMm) {
      const end = marker.clone(); end.geometry = marker.geometry.clone(); end.material = marker.material.clone(); end.position.x = s.lengthMm; group.add(end);
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(s.lengthMm,0,0)]), new THREE.LineBasicMaterial({color:0xff7845})));
    }
  }
  if (!group.children.some(c => c instanceof THREE.Mesh)) mat.dispose();
  group.position.fromArray(p.position); group.rotation.set(...p.rotation.map(v => v * Math.PI / 180) as Vec3); return group;
}

/** Cache owns originals; each mounted scene receives disposable clones, including materials. */
export class InsertionRenderCache {
  private entries = new Map<string, THREE.Group>();
  builds = 0;
  get(c: Component): THREE.Group {
    const insertion = c.insertion!, key = insertion.template.geometryKey + JSON.stringify(insertion.template.geometry, (k, v) => ["source", "name"].includes(k) ? undefined : v);
    let original = this.entries.get(key);
    if (!original) {
      original = new THREE.Group(); for (const p of insertion.template.geometry.pieces) original.add(pieceObject(p));
      this.entries.set(key, original); this.builds++;
      if (this.entries.size > 48) { const oldest = this.entries.keys().next().value!; disposeInsertionObject(this.entries.get(oldest)!); this.entries.delete(oldest); }
    }
    const copy = original.clone(true);
    copy.traverse(o => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { o.geometry = o.geometry.clone(); o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.opacity *= c.opacity; m.transparent ||= m.opacity < 1; }
      }
      if (o.userData.pieceId) o.visible = !insertion.hiddenPieceIds.includes(o.userData.pieceId);
    });
    return copy;
  }
  dispose() { for (const o of this.entries.values()) disposeInsertionObject(o); this.entries.clear(); }
}

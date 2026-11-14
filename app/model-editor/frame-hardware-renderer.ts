import * as THREE from "three";
import shapes from "../../data/fastener-shapes.json";
import type { Component } from "./model";
import { FRAME_PROFILE_SLOT_RADIUS_MM, frameBoltSeat, frameProfileSlots } from "./frame-hardware";
import { ringGeometry } from "./insertion-renderer";

export function frameHardwareObject(c:Component):THREE.Group {
 const b=c.frameHardware!,group=new THREE.Group(),d=shapes.rows.find(r=>r.d===b.diameter)??{flats:10,head:4,washerInner:6.4,washerOuter:12};
 const mat=new THREE.MeshStandardMaterial({color:0xc4c9cb,metalness:.65,roughness:.38});
 function add(g:THREE.BufferGeometry,x:number){
  const mesh=new THREE.InstancedMesh(g,mat,b.centers.length),matrix=new THREE.Matrix4();
  b.centers.forEach((p,i)=>mesh.setMatrixAt(i,matrix.makeTranslation(p[0]+x,p[1],p[2])));
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
 }
 const seat=frameBoltSeat(b);
 add(new THREE.CylinderGeometry(b.diameter/2,b.diameter/2,b.length,16).rotateZ(-Math.PI/2),seat-b.length/2);
 add(new THREE.CylinderGeometry(d.flats/Math.sqrt(3),d.flats/Math.sqrt(3),d.head,6).rotateZ(-Math.PI/2),seat+d.head/2);
 if(b.washer)add(ringGeometry({kind:"tube",lengthMm:b.washer,outerMm:d.washerOuter,innerMm:d.washerInner}),seat-b.washer);
 add(ringGeometry({kind:"tube",lengthMm:b.head,outerMm:b.headDiameter,innerMm:b.diameter}),0);
 // Nominal installed envelope, without a fictitious helical thread or bulge.
 add(ringGeometry({kind:"tube",lengthMm:b.sheet+b.tail,outerMm:b.hole,innerMm:b.diameter}),-b.sheet-b.tail);
 return group;
}

/** Native 20×40×2 C-section, extruded to length, without stretching a 600 mm mesh.
 * Additional slots connect the actual stand and cabinet axes. */
export function frameProfileObject(c:Component):THREE.Group {
 const p=c.frameProfile!,group=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:0xb8bec4,metalness:.6,roughness:.4});
 // Back web: 2 mm thick, with the same slots as the CAD part.
 const radius=FRAME_PROFILE_SLOT_RADIUS_MM;
 const web=new THREE.Shape();web.moveTo(0,-16);web.lineTo(p.length,-16);web.lineTo(p.length,16);web.lineTo(0,16);web.closePath();
 for(const [lo,hi] of frameProfileSlots(p)){const slot=new THREE.Path();slot.moveTo(lo,-radius);slot.absarc(lo,0,radius,-Math.PI/2,-3*Math.PI/2,true);slot.lineTo(hi,radius);slot.absarc(hi,0,radius,Math.PI/2,-Math.PI/2,true);slot.closePath();web.holes.push(slot);}
 // Extrusion Z -> native X; section X -> native Z.
 group.add(new THREE.Mesh(new THREE.ExtrudeGeometry(web,{depth:2,bevelEnabled:false,curveSegments:12}).rotateY(-Math.PI/2).translate(2,0,0),mat));
 // Two folded flanges and inward lips with native inside/outside radii 2/4.
 for(const sign of [-1,1]){
  const section=new THREE.Shape();section.moveTo(0,16);section.absarc(4,16,4,Math.PI,Math.PI/2,true);section.lineTo(16,20);section.absarc(16,16,4,Math.PI/2,0,true);section.lineTo(20,10);section.lineTo(18,10);section.lineTo(18,16);section.absarc(16,16,2,0,Math.PI/2,false);section.lineTo(4,18);section.absarc(4,16,2,Math.PI/2,Math.PI,false);section.closePath();
  const geometry=new THREE.ExtrudeGeometry(section,{depth:p.length,bevelEnabled:false,curveSegments:6});
  if(sign<0)geometry.rotateX(Math.PI).translate(0,0,p.length);
  group.add(new THREE.Mesh(geometry,mat));
 }
 return group;
}

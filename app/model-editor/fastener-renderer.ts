import * as THREE from "three";
import type { Component } from "./model";
import { ringGeometry } from "./insertion-renderer";

/** One instanced draw per shape in a joint. Instances share actual-size geometry;
 * no non-uniform mesh scaling, thread tessellation or per-bolt material objects. */
export function fastenerObject(c:Component):THREE.Group {
  const group=new THREE.Group(), b=c.fastener!;
  if(b.status!=="ready"||!b.dimensions)return group;
  const d=b.dimensions, material=new THREE.MeshStandardMaterial({color:0xc4c9cb,metalness:.65,roughness:.38,transparent:c.opacity<1,opacity:c.opacity});
  function instances(geometry:THREE.BufferGeometry, stations:number[]) {
    const mesh=new THREE.InstancedMesh(geometry,material,b.centers.length*stations.length),matrix=new THREE.Matrix4();
    let i=0;for(const p of b.centers)for(const x of stations){matrix.makeTranslation(x,p[1],p[2]);mesh.setMatrixAt(i++,matrix);}
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
  }
  function hex(height:number,bore?:number) {
    const s=new THREE.Shape(),r=d.flats/Math.sqrt(3);
    for(let i=0;i<6;i++){const a=i*Math.PI/3,x=r*Math.cos(a),y=r*Math.sin(a);if(i===0)s.moveTo(x,y);else s.lineTo(x,y);}s.closePath();
    if(bore){const hole=new THREE.Path();hole.absarc(0,0,bore/2,0,Math.PI*2,true);s.holes.push(hole);}
    return new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:false,steps:1,curveSegments:16}).rotateY(Math.PI/2);
  }
  const protrusion=d.ends===2?(d.length-b.grip-2*(d.nut+d.washer))/2:0;
  const start=d.ends===2?-(d.nut+d.washer+protrusion):0;
  instances(new THREE.CylinderGeometry(d.diameter/2,d.diameter/2,d.length,20).rotateZ(-Math.PI/2).translate(d.length/2,0,0),[start]);
  if(d.ends===1)instances(hex(d.head),[-d.head]);
  instances(ringGeometry({kind:"tube",lengthMm:d.washer,outerMm:d.washerOuter,innerMm:d.washerInner}),d.ends===2?[-d.washer,b.grip]:[b.grip]);
  instances(hex(d.nut,d.diameter),d.ends===2?[-d.washer-d.nut,b.grip+d.washer]:[b.grip+d.washer]);
  return group;
}

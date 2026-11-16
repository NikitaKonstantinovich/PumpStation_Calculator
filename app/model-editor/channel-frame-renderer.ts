import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { channelSection } from "../frame-calculation/channel-profiles";
import type { ChannelGeometry, ChannelMember } from "../frame-calculation/channel-types";
import type { Component } from "./model";

/** Member geometry before frame pose: x=depth, y=height, z=-row. */
export function channelMemberGeometry(g:ChannelGeometry,m:ChannelMember):THREE.BufferGeometry {
 const profile=g.profile,section=channelSection(profile),shape=new THREE.Shape();
 section.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 let geometry:THREE.BufferGeometry=new THREE.ExtrudeGeometry(shape,{depth:m.end-m.start,steps:1,bevelEnabled:false,curveSegments:16});
 const holes=g.holes.filter(h=>h.memberId===m.id&&h.valid&&h.diameterMm);
 if(holes.length){
  const raw=geometry.index?geometry.toNonIndexed():geometry,p=raw.getAttribute("position"),kept:number[]=[],faces=new Map<number,{minX:number;maxX:number;minZ:number;maxZ:number;upper:boolean}>();
  const planes=holes.flatMap(h=>h.face==="top"?[profile.height,profile.height-profile.flange]:[profile.flange,0]);
  for(let i=0;i<p.count;i+=3){
   const y=planes.find(y=>[i,i+1,i+2].every(j=>Math.abs(p.getY(j)-y)<.0001));
   if(y===undefined){for(let j=i;j<i+3;j++)kept.push(p.getX(j),p.getY(j),p.getZ(j));continue;}
   const face=faces.get(y)??{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity,upper:y===profile.height||y===profile.flange};
   for(let j=i;j<i+3;j++){face.minX=Math.min(face.minX,p.getX(j));face.maxX=Math.max(face.maxX,p.getX(j));face.minZ=Math.min(face.minZ,p.getZ(j));face.maxZ=Math.max(face.maxZ,p.getZ(j));}faces.set(y,face);
  }
  const pieces:THREE.BufferGeometry[]=[new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute(kept,3))];
  const local=(h:typeof holes[number])=>{const cross=m.axis==="x"?h.y:h.x;return [m.opening===1?cross-m.cross:m.cross+profile.width-cross,(m.axis==="x"?h.x:h.y)-m.start];};
  for(const [y,f] of faces){
   const face=new THREE.Shape();face.moveTo(f.minX,f.minZ);face.lineTo(f.maxX,f.minZ);face.lineTo(f.maxX,f.maxZ);face.lineTo(f.minX,f.maxZ);face.closePath();
   for(const hole of holes.filter(h=>h.face==="top"?y>profile.height/2:y<profile.height/2)){const [x,z]=local(hole),circle=new THREE.Path();circle.absarc(x,z,hole.diameterMm!/2,0,Math.PI*2,true);face.holes.push(circle);}
   const geo=new THREE.ShapeGeometry(face,24).toNonIndexed();geo.rotateX(Math.PI/2).translate(0,y,0);
   if(f.upper)reverse(geo);pieces.push(geo);
  }
  for(const hole of holes){const [x,z]=local(hole),y=hole.face==="top"?profile.height-profile.flange/2:profile.flange/2;
   const bore=new THREE.CylinderGeometry(hole.diameterMm!/2,hole.diameterMm!/2,profile.flange,48,1,true).scale(-1,1,1).translate(x,y,z);pieces.push(bore.toNonIndexed());bore.dispose();}
  for(const p of pieces)for(const k of Object.keys(p.attributes))if(k!=="position")p.deleteAttribute(k);
  geometry=mergeGeometries(pieces)!;pieces.forEach(p=>p.dispose());raw.dispose();
 }
 const opening=m.opening,offset=m.cross+(opening===1?0:profile.width),matrix=m.axis==="x"
  ?new THREE.Matrix4().set(opening,0,0,offset,0,1,0,0,0,0,-1,-m.start,0,0,0,1)
  :new THREE.Matrix4().set(0,0,1,m.start,0,1,0,0,-opening,0,0,-offset,0,0,0,1);
 geometry.applyMatrix4(matrix);if(matrix.determinant()<0)reverse(geometry);
 geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
function reverse(g:THREE.BufferGeometry){const p=g.getAttribute("position");for(let i=0;i<p.count;i+=3)for(let a=0;a<3;a++){const v=p.getComponent(i,a);p.setComponent(i,a,p.getComponent(i+2,a));p.setComponent(i+2,a,v);}}
export function channelFrameObject(c:Component,material:THREE.Material):THREE.Group {
 const group=new THREE.Group();for(const m of c.channelFrame!.members){const mesh=new THREE.Mesh(channelMemberGeometry(c.channelFrame!,m),material.clone());mesh.userData.pieceId=m.id;mesh.visible=!c.channelFrameAssembly?.hiddenPieceIds.includes(m.id);group.add(mesh);}return group;
}

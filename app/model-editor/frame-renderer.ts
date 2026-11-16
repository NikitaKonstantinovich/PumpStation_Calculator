import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { FrameDrilling } from "./frame-drilling";

/** Replace only the two rectangular sheet faces. Bends, side walls and feet
 * remain the native STL. Called once per changed hole pattern, never per frame. */
export function drilledFrameGeometry(source:THREE.BufferGeometry,drilling:FrameDrilling):THREE.BufferGeometry {
 const raw=source.index?source.toNonIndexed():source.clone(),p=raw.getAttribute("position"),kept:number[]=[];
 const top=drilling.top,bottom=top-drilling.thickness;
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,topCount=0,bottomCount=0;
 for(let i=0;i<p.count;i+=3){
  const on=(y:number)=>[i,i+1,i+2].every(j=>Math.abs(p.getY(j)-y)<.001);
  const upper=on(top),lower=on(bottom);
  if(upper||lower){
   if(upper){topCount++;for(let j=i;j<i+3;j++){minX=Math.min(minX,p.getX(j));maxX=Math.max(maxX,p.getX(j));minZ=Math.min(minZ,p.getZ(j));maxZ=Math.max(maxZ,p.getZ(j));}}
   else bottomCount++;
  }else for(let j=i;j<i+3;j++)kept.push(p.getX(j),p.getY(j),p.getZ(j));
 }
 raw.dispose();
 if(!topCount||!bottomCount||!(maxX>minX&&maxZ>minZ))throw new Error("Не найдены плоскости листа гнутой рамы");
 const shape=new THREE.Shape();shape.moveTo(minX,minZ);shape.lineTo(maxX,minZ);shape.lineTo(maxX,maxZ);shape.lineTo(minX,maxZ);shape.closePath();
 const bores:THREE.BufferGeometry[]=[];
 for(const h of drilling.holes){
  const [x,,z]=h.point,r=h.diameter/2;
  if(x-r<minX||x+r>maxX||z-r<minZ||z+r>maxZ)throw new Error(`Отверстие ${h.id} выходит за плоскую часть рамы`);
  const circle=new THREE.Path();circle.absarc(x,z,r,0,Math.PI*2,true);shape.holes.push(circle);
  // Reverse normals into the bore. Each wall uses the same 48-sided contour
  // as ShapeGeometry's 24 curve segments to keep the surface closed.
  const wall=new THREE.CylinderGeometry(r,r,drilling.thickness,48,1,true).scale(-1,1,1).translate(x,(top+bottom)/2,z);
  bores.push(wall.toNonIndexed());wall.dispose();
 }
 const face=(y:number,upper:boolean)=>{
  const geometry=new THREE.ShapeGeometry(shape,24).toNonIndexed();
  geometry.rotateX(Math.PI/2).translate(0,y,0);
  // ShapeGeometry faces -Y after rotation; reverse for the top face.
  if(upper){const a=geometry.getAttribute("position");for(let i=0;i<a.count;i+=3)for(let axis=0;axis<3;axis++){const tmp=a.getComponent(i,axis);a.setComponent(i,axis,a.getComponent(i+2,axis));a.setComponent(i+2,axis,tmp);}}
  return geometry;
 };
 const remainder=new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute(kept,3));
 const pieces=[remainder,face(top,true),face(bottom,false),...bores];
 for(const g of pieces)for(const attribute of Object.keys(g.attributes))if(attribute!=="position")g.deleteAttribute(attribute);
 const merged=mergeGeometries(pieces)!;for(const g of pieces)g.dispose();
 merged.computeVertexNormals();merged.computeBoundingBox();merged.computeBoundingSphere();return merged;
}

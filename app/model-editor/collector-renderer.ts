import * as THREE from "three";
import type { Component } from "./model";
import type { MetalMesh, CollectorMetal } from "./collector-mesh";
import { resolvedCollectorMetal } from "./collector-mesh";
import { collectorGeometryKey } from "./collector-types";
import { pieceObject } from "./insertion-renderer";

export class CollectorRenderCache {
  private entries = new Map<string,CollectorMetal>();
  builds=0;
  get(c:Component) {
    const t=c.collector!.template,key=collectorGeometryKey(t);let result=this.entries.get(key);
    if(!result){result=resolvedCollectorMetal(t);this.entries.set(key,result);this.builds++;if(this.entries.size>12)this.entries.delete(this.entries.keys().next().value!);}
    return result;
  }
  dispose(){this.entries.clear();}
}
export function metalGeometry(m:MetalMesh):THREE.BufferGeometry {
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(m.positions,3));g.setIndex(m.indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export function collectorObject(c:Component,cache?:CollectorRenderCache):THREE.Group {
  const binding=c.collector!,t=binding.template,metal=cache?cache.get(c):resolvedCollectorMetal(t),group=new THREE.Group();
  group.userData.collectorIssues=metal.issues;
  const body=(id:string,m:MetalMesh)=>{
    const selected=binding.selectedPieceId===id;
    const opacity=c.opacity*(binding.pieceOpacities?.[id]??1);
    const mesh=new THREE.Mesh(metalGeometry(m),new THREE.MeshStandardMaterial({color:selected?0xf0a34b:0x9db8c5,metalness:.4,roughness:.45,side:THREE.DoubleSide,transparent:opacity<1,opacity}));
    mesh.userData.pieceId=id;mesh.visible=!binding.hiddenPieceIds.includes(id);group.add(mesh);
  };
  if(metal.main)body("main",metal.main);
  for(const b of t.branches)if(metal.branches[b.id])body(b.id,metal.branches[b.id]);else {
    const marker=pieceObject({id:b.id,componentId:b.componentId,name:b.name,role:b.id,auxiliary:false,position:b.origin.map((v,i)=>v+b.axis[i]*b.endMm) as [number,number,number],rotation:[0,0,0],shape:{kind:"marker"},ports:[],source:b.source,fidelity:"missing"});
    marker.visible=!binding.hiddenPieceIds.includes(b.id);group.add(marker);
  }
  for(const p of t.pieces){const object=pieceObject(p);object.visible=!binding.hiddenPieceIds.includes(p.id);object.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.opacity*=c.opacity*(binding.pieceOpacities?.[p.id]??1);m.transparent||=m.opacity<1;if(p.id===binding.selectedPieceId&&m instanceof THREE.MeshStandardMaterial)m.emissive.setHex(0x5b3200);}});group.add(object);}
  return group;
}

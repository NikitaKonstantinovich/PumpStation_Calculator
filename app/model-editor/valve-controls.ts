import importedMounts from "../../data/valve-control-mounts.json";
import type { ProjectConfig, SpecEntity, SpecItem } from "../project-config";
import type { Assembly, Bounds, Component, Vec3 } from "./model";

export const VALVE_CONTROL_REVISION = importedMounts.revision;
export type ValveControl = {
  version: 1; parentId: string; role: "bracket" | "switch-1" | "switch-2";
  revision: string; position: Vec3; rotation: Vec3; manual?: boolean;
};
type Pose = { position: Vec3; rotation: Vec3 };
type Asset = { name: string; source: string; sourceHash: string; meshUrl: string; bounds: number[] };
const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e7);
export function parseValveControl(v: unknown): ValveControl | undefined {
  if (!v || typeof v !== "object") return;
  const b = v as ValveControl;
  if (b.version !== 1 || typeof b.parentId !== "string" || !b.parentId || b.parentId.length > 240 || typeof b.revision !== "string" || b.revision.length > 100
    || !["bracket", "switch-1", "switch-2"].includes(b.role) || !vec(b.position) || !vec(b.rotation)) return;
  return { version: 1, parentId: b.parentId, role: b.role, revision: b.revision, position: [...b.position], rotation: [...b.rotation], ...(b.manual === true ? { manual: true } : {}) };
}

// XYZ Euler composition, not addition: controls also follow arbitrarily rotated valves.
type Matrix = number[][];
function matrix(r: Vec3): Matrix {
  const [x,y,z] = r.map(v => v*Math.PI/180), a=Math.cos(x), b=Math.sin(x), c=Math.cos(y), d=Math.sin(y), e=Math.cos(z), f=Math.sin(z);
  return [[c*e,-c*f,d],[a*f+b*d*e,a*e-b*d*f,-b*c],[b*f-a*d*e,b*e+a*d*f,a*c]];
}
const apply = (m: Matrix, v: Vec3): Vec3 => m.map(r => r.reduce((s,n,i) => s+n*v[i],0)) as Vec3;
const multiply = (a: Matrix, b: Matrix): Matrix => a.map(r => [0,1,2].map(i => r.reduce((s,n,k) => s+n*b[k][i],0)));
function euler(m: Matrix): Vec3 {
  const y=Math.asin(Math.max(-1,Math.min(1,m[0][2]))), normal=Math.abs(m[0][2])<.9999999;
  return [normal?Math.atan2(-m[1][2],m[2][2]):Math.atan2(m[2][1],m[1][1]),y,normal?Math.atan2(-m[0][1],m[0][0]):0].map(v => Math.abs(v)<1e-12?0:v*180/Math.PI) as Vec3;
}
export function composeValvePose(parent: Pose, local: Pose): Pose {
  const m=matrix(parent.rotation), offset=apply(m,local.position);
  return { position: parent.position.map((v,i)=>v+offset[i]) as Vec3, rotation: euler(multiply(m,matrix(local.rotation))) };
}
function relativePose(parent: Pose, world: Pose): Pose {
  const m=matrix(parent.rotation), inverse=m.map((_,i)=>m.map(r=>r[i]));
  return { position: apply(inverse,world.position.map((v,i)=>v-parent.position[i]) as Vec3), rotation: euler(multiply(inverse,matrix(world.rotation))) };
}
/** Lock prevents a direct edit; a locked child still follows its mounting parent. */
export function followValveControls(assembly: Assembly, editedId?: string): Assembly {
  return { ...assembly, components: assembly.components.map(c => {
    if (!c.valveControl) return c;
    const parent=assembly.components.find(p=>p.id===c.valveControl!.parentId && !p.valveControl);
    if (!parent) return { ...c, orphaned: true };
    const binding = editedId===c.id ? { ...c.valveControl, ...relativePose(parent,c), manual: true } : c.valveControl;
    return { ...c, ...composeValvePose(parent,binding), valveControl: binding, ...(c.line ? { line: { ...c.line, baseline: composeValvePose(parent,binding) } } : {}) };
  }) };
}

/** Only controls actually present in the specification are expanded. No costs or
 * equipment selection are changed here. Parent CAD hash guards the mounting fit. */
export function addValveControls(assembly: Assembly, project: ProjectConfig): Assembly {
  const rows=(project.entities["station-spec"] as SpecEntity).items, removed=new Set<string>(), children: Component[]=[];
  for (const parent of assembly.components) {
    if (parent.valveControl || parent.sourceKey === "manual") continue;
    const hash=parent.shape?.kind === "mesh" ? parent.shape.modelHash : parent.cadSource?.hash;
    const mount=importedMounts.rows.find(m=>m.valveHash===hash);
    if (!mount) continue;
    let bracket: SpecItem | undefined, sensor: SpecItem | undefined;
    let bracketComponent: Component | undefined, sensorComponent: Component | undefined;
    if (parent.line && /^(primary|secondary)(SuctionValve|DischargeValve)$/.test(parent.line.role)) {
      const prefix=parent.line.role.startsWith("primary")?"primary":"secondary";
      const auxiliary=assembly.components.filter(c=>c.line?.pumpId===parent.line!.pumpId && c.line?.side===parent.line!.side);
      bracketComponent=auxiliary.find(c=>c.line?.role===`${prefix}-limit-switches-bracket` && c.line.quantity===1);
      sensorComponent=auxiliary.find(c=>c.line?.role===`${prefix}-limit-switches-switch` && c.line.quantity===2);
      bracket=rows.find(r=>r.section===parent.line!.side && r.position===bracketComponent?.line?.specPosition);
      sensor=rows.find(r=>r.section===parent.line!.side && r.position===sensorComponent?.line?.specPosition);
    } else {
      const row=rows.find(r=>parent.id.startsWith(`spec-${r.position}-`) && r.equipmentId===parent.equipmentId);
      if (row?.hydraulicAssembly?.requirement.kind !== "isolating-valve") continue;
      bracket=row.hydraulicAssembly.parts.find(r=>r.assemblyRole==="separator-limit-switches-bracket" && r.quantity===1);
      sensor=row.hydraulicAssembly.parts.find(r=>r.assemblyRole==="separator-limit-switches-switch" && r.quantity===2);
    }
    if (bracket?.equipmentId !== (mount.dn<=80?"кронштейны-001-r0005":"кронштейны-001-r0006") || sensor?.equipmentId!=="кипиа-004-r0028") continue;
    for (const c of [bracketComponent,sensorComponent]) if (c) removed.add(c.id);
    const nativePose: Pose=parent.shape?.kind === "mesh" ? { position: parent.shape.modelPosition ?? [0,0,0], rotation: parent.shape.modelRotation ?? [0,0,0] } : { position: [0,0,0], rotation: [0,0,0] };
    const parts: Array<{ asset: Asset; row: SpecItem; old?: Component; role: ValveControl["role"]; position: number[]; rotation: number[] }> = [
      { asset: mount.bracket, row: bracket, old: bracketComponent, role: "bracket", position: mount.bracketPosition, rotation: mount.bracketRotation },
      ...mount.switchPositions.map((position,i)=>({ asset: importedMounts.switch, row: sensor!, old: sensorComponent, role: `switch-${i+1}` as ValveControl["role"], position, rotation: mount.switchRotations[i] })),
    ];
    for (const part of parts) {
      const local=composeValvePose(nativePose,{ position: part.position as Vec3, rotation: part.rotation as Vec3 }), pose=composeValvePose(parent,local), bounds=part.asset.bounds as Bounds;
      const note=`Автоматическая посадка Dendor 017W DN${mount.dn}: кронштейн по сверловке Ø${mount.boltCircle}, выключатели по пазам. Номинальное положение в регулировочных пазах; ход срабатывания настраивается при сборке.`;
      children.push({ id: `${parent.id}-control-${part.role}`, name: `${part.asset.name}${part.role.startsWith("switch")?` · ${part.role.endsWith("1")?"1":"2"}`:""}`, kind: "equipment",
        sourceKey: `equipment:${part.row.equipmentId}`, equipmentId: part.row.equipmentId, sourceNote: note, ...pose, bounds, meshUrl: part.asset.meshUrl,
        cadSource: { path: part.asset.source, hash: part.asset.sourceHash }, ports: [], hidden: false, locked: false, opacity: 1,
        parameters: { length: bounds[3]-bounds[0], width: bounds[4]-bounds[1], height: bounds[5]-bounds[2], diameter: 1, routeOffset: 0 },
        valveControl: { version: 1, parentId: parent.id, role: part.role, revision: VALVE_CONTROL_REVISION, ...local },
        ...(part.old?.line ? { line: { ...part.old.line, instance: part.role==="switch-2"?1:0, quantity: 1, length: null, fidelity: "cad", issues: [], baseline: pose, geometryRevision: VALVE_CONTROL_REVISION } } : {}),
      });
    }
  }
  return { ...assembly, components: [...assembly.components.filter(c=>!removed.has(c.id)), ...children] };
}

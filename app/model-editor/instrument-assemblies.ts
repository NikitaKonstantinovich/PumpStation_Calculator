import mounts from "../../data/instrument-mounts.json";
import { INSTRUMENT_SIDE_FITTINGS } from "../instrument-connection";
import type { ProjectConfig, SpecEntity, SpecItem } from "../project-config";
import type { Assembly, Bounds, Port, Vec3 } from "./model";
import { composeValvePose, relativePose } from "./valve-controls";
import { FIRE_INSERTION_INSTRUMENTS_REVISION } from "../fire-insertion-instruments";
import { occupyInsertionSensor } from "./insertion-template";

export const INSTRUMENT_MOUNT_REVISION = mounts.revision;
type Role = keyof typeof mounts.assets;
export type InstrumentMount = {
  version: 1; parentId: string; portId: string; role: Role; revision: string;
  position: Vec3; rotation: Vec3; specPosition: string; manual?: boolean; kind?: "fire-insertion";
};
const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7);
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 240;
export function parseInstrumentMount(value: unknown): InstrumentMount | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as InstrumentMount;
  if (v.version !== 1 || !id(v.parentId) || !id(v.portId) || !id(v.revision) || !id(v.specPosition) || !Object.hasOwn(mounts.assets, v.role) || !vec(v.position) || !vec(v.rotation) || v.kind !== undefined && v.kind !== "fire-insertion") return;
  return { version: 1, parentId: v.parentId, portId: v.portId, revision: v.revision, role: v.role,
    position: [...v.position], rotation: [...v.rotation], specPosition: v.specPosition, ...(v.manual === true ? { manual: true } : {}), ...(v.kind ? { kind: v.kind } : {}) };
}

/** Every part is bound to the free end of the actual collector sgon. Length,
 * position and XYZ rotation changes therefore move the whole KIP assembly. */
export function followInstrumentAssemblies(assembly: Assembly, editedId?: string): Assembly {
  // A retained manual insertion may come from a saved scene with a reserve cap.
  const prepared = assembly.components.map(c => {
    if (!c.insertion || !assembly.components.some(child => child.instrumentMount?.kind === "fire-insertion" && child.instrumentMount.parentId === c.id)) return c;
    const template = occupyInsertionSensor(c.insertion.template);
    return { ...c, ports: template.geometry.ports, insertion: { ...c.insertion, template } };
  });
  return { ...assembly, components: prepared.map(c => {
    if (!c.instrumentMount) return c;
    const binding = c.instrumentMount, parent = prepared.find(p => p.id === binding.parentId && (binding.kind === "fire-insertion" ? p.insertion : p.collector));
    const port = parent?.ports.find(p => p.id === binding.portId);
    if (!parent || !port) return { ...c, orphaned: true };
    const anchor = composeValvePose(parent, { position: port.point, rotation: [0, 0, 0] });
    const next = editedId === c.id ? { ...binding, ...relativePose(anchor, c), manual: true } : binding;
    return { ...c, ...composeValvePose(anchor, next), instrumentMount: next };
  }) };
}

type Part = { role: Role; row: SpecItem; quantity: number };
/** Expand the selected specification, never select equipment or price CAD.
 * The DIN connector is geometry belonging to the transducer, not another SKU. */
export function addInstrumentAssemblies(assembly: Assembly, project: ProjectConfig): Assembly {
  const rows = (project.entities["station-spec"] as SpecEntity).items;
  const components = assembly.components.filter(c => !c.instrumentMount), joints = (assembly.lineJoints ?? []).filter(j => !j.id.startsWith("kip-joint-"));
  const adopted = new Map<string, number>();
  const consume = (row: SpecItem, index: number) => adopted.set(`${row.section}:${row.position}:${row.equipmentId}`, Math.max(index + 1, adopted.get(`${row.section}:${row.position}:${row.equipmentId}`) ?? 0));
  for (const side of ["suction", "discharge"] as const) {
    const parent = components.find(c => c.id === `collector-${side}` && c.collector);
    if (!parent?.collector) continue;
    // Clone the collector before adding diagnostics; the incoming assembly is immutable.
    const collector = { ...parent, collector: { ...parent.collector, template: { ...parent.collector.template, issues: [...parent.collector.template.issues] } } };
    components[components.indexOf(parent)] = collector;
    const find = (role: string) => rows.find(r => r.section === side && r.assemblyRole === role && r.quantity > 0);
    const valve = find("instrument-valve"), gauge = find("gauge"), sensor = find(side === "suction" ? "pressure-switch" : "discharge:transducer");
    if (!valve && !gauge && !sensor) continue;
    const nested = side === "discharge" ? sensor?.hydraulicAssembly?.parts : undefined;
    const fitting = (role: "adapter" | "bush") => (nested ?? rows.filter(r => r.section === side)).find(r => r.assemblyRole === INSTRUMENT_SIDE_FITTINGS[role]);
    const warn = (message: string) => collector.collector.template.issues.push(`КИП: ${message}`);
    const total = Math.max(valve?.quantity ?? 0, gauge?.quantity ?? 0, sensor?.quantity ?? 0);
    for (let i = 0; i < Math.min(32, total); i++) {
      const portId = `instrument-kip-${i + 1}-0`, port = parent.ports.find(p => p.id === portId);
      if (!port || port.dn !== 15 || port.gender !== "male" || port.occupiedBy !== "kip" || port.thread !== "G1/2") {
        warn(`комплект №${i + 1}: нужен занятый резьбовой сгон DN15; автоматическая посадка не выполнена.`);
        continue;
      }
      const branch = parent.collector.template.branches.find(b => b.portId === portId);
      if (branch ? !branch.thread || branch.thread.lengthMm < 10 : port.point[2] - (parent.collector.template.main?.outerMm ?? 0) / 2 < 10) {
        warn(`комплект №${i + 1}: для посадки крана нужен прямой резьбовой участок не менее 10 мм.`);
        continue;
      }
      if (!branch) warn(`комплект №${i + 1}: приборы размещены по расчётному торцу; геометрия сгона требует подтверждения.`);
      if (valve?.equipmentId !== "шаровые-краны-002-r0203" || i >= valve.quantity) {
        warn(`комплект №${i + 1}: выбранный кран не имеет проверенного CAD-профиля.`);
        continue;
      }
      const parts: Part[] = [{ role: "valve", row: valve, quantity: valve.quantity }];
      if (gauge?.equipmentId && /^кипиа-001-r000[5-8]$/.test(gauge.equipmentId) && i < gauge.quantity) parts.push({ role: "gauge", row: gauge, quantity: gauge.quantity });
      else warn(`комплект №${i + 1}: выбранный манометр не имеет CAD-профиля; требуется уточнение.`);
      const adapter = fitting("adapter"), bush = fitting("bush");
      const quantity = (r: SpecItem | undefined) => (r?.quantity ?? 0) * (nested ? sensor?.quantity ?? 0 : 1);
      if (adapter?.equipmentId === INSTRUMENT_SIDE_FITTINGS.adapter && i < quantity(adapter)) {
        parts.push({ role: "adapter", row: adapter, quantity: quantity(adapter) });
        if (bush?.equipmentId === INSTRUMENT_SIDE_FITTINGS.bush && i < quantity(bush)) {
          parts.push({ role: "bush", row: bush, quantity: quantity(bush) });
          if (sensor?.equipmentId && i < sensor.quantity) {
            if (side === "suction" && /^кипиа-002-r001[3-6]$/.test(sensor.equipmentId)) parts.push({ role: "relay", row: sensor, quantity: sensor.quantity });
            else if (side === "discharge" && /^station-v11-oni-ppt10-(16|25)$/.test(sensor.equipmentId)) parts.push({ role: "transducer", row: sensor, quantity: sensor.quantity }, { role: "connector", row: sensor, quantity: sensor.quantity });
            else warn(`комплект №${i + 1}: выбранный прибор не имеет CAD-профиля.`);
          }
        } else warn(`комплект №${i + 1}: нет футорки 1/2 НР–1/4 ВР в спецификации.`);
      } else warn(`комплект №${i + 1}: нет переходника 1/4 НР–1/2 ВР в спецификации.`);
      const refs = new Map<Role, string>();
      for (const part of parts) {
        const asset = mounts.assets[part.role], bounds = asset.bounds as Bounds;
        const binding: InstrumentMount = { version: 1, parentId: parent.id, portId, role: part.role, revision: INSTRUMENT_MOUNT_REVISION, specPosition: part.row.position, position: asset.position as Vec3, rotation: asset.rotation as Vec3 };
        const componentId = `kip-${side}-${i + 1}-${part.role}`;
        const note = part.role === "gauge" ? "Компоновочная CAD-геометрия ТМ-510Р Ø100 G1/2 по изображению пользователя; в расчёте сохранён выбранный манометр Экомера. Точное соответствие корпуса требует проверки."
          : part.role === "connector" ? "Разъём DIN43650 — часть геометрии преобразователя; отдельная покупная позиция и стоимость не добавляются."
          : "Исходная CAD-геометрия КИП; номинальная посадка по резьбе. Глубины навинчивания и допуски требуют проверки при изготовлении.";
        components.push({ id: componentId, name: `${part.role === "connector" ? "Разъём DIN43650" : part.row.name} · КИП ${i + 1}`, kind: "equipment", equipmentId: part.row.equipmentId,
          sourceKey: `equipment:${part.row.equipmentId}`, sourceNote: note, position: [0, 0, 0], rotation: [0, 0, 0], hidden: false, locked: false, opacity: 1,
          bounds, meshUrl: asset.meshUrl, cadSource: { path: asset.source, hash: asset.sourceHash }, ports: structuredClone(asset.ports) as Port[], instrumentMount: binding,
          parameters: { length: bounds[3] - bounds[0], width: bounds[4] - bounds[1], height: bounds[5] - bounds[2], diameter: 1, routeOffset: 0 } });
        refs.set(part.role, componentId);
        if (part.role !== "connector") consume(part.row, i);
      }
      const joint = (a: Role | "collector", pa: string, b: Role, pb: string, overlap: number) => {
        const first = a === "collector" ? parent.id : refs.get(a), second = refs.get(b);
        if (first && second) joints.push({ id: `kip-joint-${side}-${i + 1}-${b}`, a: { componentId: first, portId: pa }, b: { componentId: second, portId: pb }, kind: "thread", overlap, provisional: true });
      };
      joint("collector", portId, "valve", "inlet", 10);
      joint("valve", "gauge", "gauge", "inlet", 10);
      joint("valve", "sensor", "adapter", "inlet", 8);
      joint("adapter", "outlet", "bush", "inlet", 11);
      joint("bush", "outlet", side === "suction" ? "relay" : "transducer", "inlet", 8);
    }
    collector.collector.template.issues = [...new Set(collector.collector.template.issues)];
  }
  // Insertion instruments use the main upper port: no gauge and no side
  // adapter. The relay follows the sensor port of its own pump-line insertion.
  for (const original of [...components]) {
    if (!original.insertion || original.line?.side !== "discharge") continue;
    const row = rows.find(r => r.position === original.line!.specPosition && r.equipmentId === original.equipmentId && r.insertionAssembly?.sensorConnection === "fire-pressure-switch");
    if (!row || !original.ports.some(p => p.id === "sensor" && p.dn === 15 && p.gender === "male")) continue;
    const parent = { ...original, line: { ...original.line, issues: [...original.line.issues] } };
    components[components.indexOf(original)] = parent;
    const prefix = row.assemblyRole!.split("-")[0];
    const poses: Partial<Record<Role, { position: Vec3; rotation: Vec3 }>> = {
      valve: { position: [0, 0, 14.5], rotation: [0, 90, 0] },
      bush: { position: [0, 0, 51], rotation: [0, 90, 0] },
      relay: { position: [-20, 18, 102.5], rotation: [90, 0, 0] },
    };
    const refs = new Map<Role, string>();
    for (const role of ["valve", "bush", "relay"] as const) {
      const part = rows.find(r => r.section === "discharge" && r.assemblyRole === `${prefix}-sensor-${role}` && r.quantity >= row.quantity);
      const compatible = role === "valve" ? part?.equipmentId === "шаровые-краны-002-r0203" : role === "bush" ? part?.equipmentId === INSTRUMENT_SIDE_FITTINGS.bush : /^кипиа-002-r001[3-6]$/.test(part?.equipmentId ?? "");
      if (!part || !compatible) {
        parent.line.issues.push(`Узел реле на вставке: ${role === "valve" ? "кран" : role === "bush" ? "футорка" : "реле"} не подобран или не имеет CAD-профиля.`);
        break;
      }
      const asset = mounts.assets[role], bounds = asset.bounds as Bounds, componentId = `${parent.id}-sensor-${role}`;
      const binding: InstrumentMount = { version: 1, kind: "fire-insertion", parentId: parent.id, portId: "sensor", role, specPosition: part.position,
        revision: FIRE_INSERTION_INSTRUMENTS_REVISION, ...poses[role]! };
      components.push({ id: componentId, name: `${part.name} · ${parent.line.pumpId}`, kind: "equipment", equipmentId: part.equipmentId,
        sourceKey: `equipment:${part.equipmentId}`, sourceNote: "Сгон напорной вставки → кран LD Pride → футорка G1/2 НР–G1/4 ВР → реле сверху. Номинальная посадка по изображениям пользователя 01.11.2026; глубины навинчивания предварительные.",
        position: [0, 0, 0], rotation: [0, 0, 0], hidden: false, locked: false, opacity: 1, bounds, meshUrl: asset.meshUrl,
        cadSource: { path: asset.source, hash: asset.sourceHash }, ports: structuredClone(asset.ports) as Port[], instrumentMount: binding,
        parameters: { length: bounds[3] - bounds[0], width: bounds[4] - bounds[1], height: bounds[5] - bounds[2], diameter: 1, routeOffset: 0 } });
      refs.set(role, componentId);
      // The line ID itself identifies the physical branch. Staging copies for
      // this specification row are consumed independently of catalogue IDs.
      consume(part, row.quantity - 1);
    }
    parent.sourceNote = [parent.sourceNote, ...parent.line.issues.filter(i => i.startsWith("Узел реле"))].join(". ");
    for (const [from, port, to, overlap] of [["insertion", "sensor", "valve", 10], ["valve", "gauge", "bush", 11], ["bush", "outlet", "relay", 8]] as const) {
      const first = from === "insertion" ? parent.id : refs.get(from), second = refs.get(to);
      if (first && second) joints.push({ id: `kip-joint-fire-${parent.id}-${to}`, a: { componentId: first, portId: port }, b: { componentId: second, portId: "inlet" }, kind: "thread", overlap, provisional: true });
    }
  }
  // Replace only the adopted automatic instances. Unsupported or additional
  // equipment stays visible in the staging area; manually added CAD is retained.
  const filtered = components.filter(c => {
    if (!c.id.startsWith("spec-") || c.sourceKey === "manual") return true;
    const row = rows.find(r => c.id.startsWith(`spec-${r.position}-`) && r.equipmentId === c.equipmentId);
    const count = row && adopted.get(`${row.section}:${row.position}:${row.equipmentId}`);
    return !count || Number(c.id.match(/-(\d+)$/)?.[1] ?? Infinity) >= count;
  });
  return followInstrumentAssemblies({ ...assembly, components: filtered, ...(assembly.lineJoints || joints.length ? { lineJoints: joints } : {}) });
}

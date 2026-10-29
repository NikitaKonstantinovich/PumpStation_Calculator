import type { ProjectConfig, InputEntity, SettingsEntity, DnEntity, SpecEntity, ModelEntity } from "../project-config";
import type { Pump } from "../pump-catalog";
import type { CollectorsEntity } from "../collector-project";
import { catalogPumpPort, resolvePumpPortData } from "../pump-ports";
import { defaultSnaps, normalizeSnaps, type SnapSettings } from "./snap-settings";
import { specificationModels } from "./specification-models";
import { parseInsertionTemplate, parseConnectionPoint, type InsertionTemplate, type InsertionShape, type ConnectionPoint } from "./insertion-types";
import { addLineAssemblies } from "./line-assembly";
import { parseLineBinding, parseLineJoints, parseLineShape, type LineBinding, type LineCatalog, type LineJoint } from "./line-types";
import { COLLECTOR_INSTRUMENT_RULES_REVISION, parseCollectorBinding, type CollectorBinding } from "./collector-types";
import { applyCollectorTemplate, buildCollectorTemplate, finishCollectorTemplate } from "./collector-template";
import { resolvedCollectorMetal } from "./collector-mesh";
import { PUMP_LINE_RULES_REVISION } from "../line-insertion";
import { VIBRATION_DIMENSIONS_REVISION } from "../vibration-dimensions";
import { FRAME_RULE_REVISION, projectFrameSelection } from "../frame-selection";
import { addValveControls, followValveControls, parseValveControl, VALVE_CONTROL_REVISION, type ValveControl } from "./valve-controls";

/** All positions, source CAD coordinates and dimensions use mm; Euler angles use degrees, XYZ. */
export type Vec3 = [number, number, number];
export type Bounds = [number, number, number, number, number, number];
export type Port = { id: string; point: Vec3; axis?: Vec3; provisional?: boolean } & Partial<Omit<ConnectionPoint, "id" | "point" | "axis" | "provisional">>;
export type PortRef = { componentId: string; portId: string };
export type PumpProfile = {
  pumpId?: string; key?: string; bounds: Bounds; ports: Port[]; source: string; sourceHash: string;
  meshUrl?: string; mapping: string; warnings: string[];
  flowReview?: { status: string; previousNormalizedHash: string; flowNormalized?: Vec3 };
};
export type ProfileCatalog = { version: 1; profiles: Record<string, PumpProfile>; equipment?: Record<string, PumpProfile> };
export type Component = {
  id: string; name: string; kind: "pump" | "collector" | "pipe" | "frame" | "equipment";
  equipmentId?: string; sourceKey?: string; sourceNote: string;
  cadSource?: { path: string; hash: string };
  position: Vec3; rotation: Vec3; hidden: boolean; opacity: number; locked: boolean;
  parameters: { length: number; width: number; height: number; diameter: number; routeOffset: number; wallThickness?: number };
  bounds?: Bounds; meshUrl?: string; ports: Port[];
  insertion?: { template: InsertionTemplate; hiddenPieceIds: string[] };
  collector?: CollectorBinding;
  line?: LineBinding; shape?: InsertionShape;
  valveControl?: ValveControl;
  autoPose?: { position: Vec3; rotation: Vec3; parametersKey?: string };
  routing?: { from: PortRef; to: PortRef; automatic: boolean; points: Vec3[] };
  orphaned?: boolean;
};
export type Assembly = { version: 1; sourceFingerprint: string; components: Component[]; lineJoints?: LineJoint[]; lineDataRevision?: string };
export type CameraView = { position: Vec3; target: Vec3 };
export type EditorState = {
  version: 1; assembly: Assembly | null; selectedId: string | null;
  selectedPieceId?: string;
  grid: boolean; snap: boolean; snapStep: number; camera?: CameraView;
  objectSnaps: SnapSettings;
  referencePoints: Array<{ id: string; componentId: string; point: Vec3; approximate?: boolean }>;
};
export const emptyEditor = (): EditorState => ({ version: 1, assembly: null, selectedId: null, grid: true, snap: true, snapStep: 25, objectSnaps: defaultSnaps(), referencePoints: [] });
export const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3;
export const subtract = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
export const distance = (a: Vec3, b: Vec3) => Math.hypot(...subtract(a, b));
export const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const positive = (v: unknown, fallback: number) => finite(v) && v > 0 && v <= 1e6 ? v : fallback;
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => finite(n) && Math.abs(n) <= 1e7);
const safeId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 240;
const safeMesh = (v: unknown): v is string => typeof v === "string" && (/^\/model-assets\/[a-zA-Z0-9_-]+\.stl$/.test(v) || /^\/api\/model-preparation\/assets\/model-[a-f0-9]{64}-v1\.stl$/.test(v));

export function normalizeEditor(raw: unknown): EditorState {
  const value = object(raw), result = emptyEditor();
  if (value.version !== 1) return result;
  result.objectSnaps = normalizeSnaps(value.objectSnaps);
  if (Array.isArray(value.referencePoints)) result.referencePoints = value.referencePoints.slice(0, 500).flatMap(raw => {
    const p = object(raw);
    return safeId(p.id) && safeId(p.componentId) && vec(p.point) ? [{ id: p.id, componentId: p.componentId, point: [...p.point] as Vec3, ...(p.approximate === true ? { approximate: true } : {}) }] : [];
  });
  result.grid = value.grid !== false; result.snap = value.snap !== false;
  result.snapStep = Math.min(1000, Math.max(1, positive(value.snapStep, 25)));
  result.selectedId = safeId(value.selectedId) ? value.selectedId : null;
  if (safeId(value.selectedPieceId)) result.selectedPieceId = value.selectedPieceId;
  const camera = object(value.camera);
  if (vec(camera.position) && vec(camera.target) && distance(camera.position, camera.target) > .01) result.camera = { position: [...camera.position], target: [...camera.target] };
  const assembly = object(value.assembly);
  // Expanded branches contain many instances; the old 500-part limit remains for legacy scenes.
  if (assembly.version !== 1 || !Array.isArray(assembly.components) || assembly.components.length > (Array.isArray(assembly.lineJoints) ? 3000 : 500)) return result;
  const components: Component[] = [], ids = new Set<string>();
  for (const raw of assembly.components) {
    const c = object(raw), p = object(c.parameters);
    if (!safeId(c.id) || ids.has(c.id) || !["pump", "collector", "pipe", "frame", "equipment"].includes(String(c.kind)) || !vec(c.position) || !vec(c.rotation)) continue;
    ids.add(c.id);
    const ports: Port[] = Array.isArray(c.ports) ? c.ports.slice(0, 100).flatMap(raw => {
      const port = object(raw);
      const full = parseConnectionPoint(raw); if (full) return [full];
      return safeId(port.id) && vec(port.point) ? [{ id: port.id, point: [...port.point] as Vec3, ...(vec(port.axis) ? { axis: [...port.axis] as Vec3 } : {}), provisional: port.provisional === true,
        ...(["flanged", "threaded", "weld", "collar"].includes(String(port.connection)) ? { connection: port.connection as Port["connection"] } : {}),
        ...(finite(port.dn) && port.dn > 0 ? { dn: port.dn } : {}), ...(finite(port.pn) && port.pn > 0 ? { pn: port.pn } : {}),
        ...Object.fromEntries(["boreMm", "boltCircleMm", "boltHoles", "boltHoleMm"].filter(k => finite(port[k]) && Number(port[k]) > 0).map(k => [k, port[k]])),
        ...(typeof port.thread === "string" ? { thread: port.thread.slice(0, 24) } : {}), ...(typeof port.material === "string" ? { material: port.material.slice(0, 2000) } : {}),
        ...(["male", "female"].includes(String(port.gender)) ? { gender: port.gender as Port["gender"] } : {}),
        ...(["mating-face", "weld-end", "thread-reference"].includes(String(port.plane)) ? { plane: port.plane as Port["plane"] } : {}),
        ...(typeof port.source === "string" ? { source: port.source.slice(0, 12000) } : {}), ...(vec(port.up) ? { up: [...port.up] as Vec3 } : {}) }] : [];
    }) : [];
    const component: Component = {
      id: c.id, name: typeof c.name === "string" ? c.name.slice(0, 300) : c.id, kind: c.kind as Component["kind"],
      equipmentId: safeId(c.equipmentId) ? c.equipmentId : undefined, sourceKey: safeId(c.sourceKey) ? c.sourceKey : undefined,
      sourceNote: typeof c.sourceNote === "string" ? c.sourceNote.slice(0, 2000) : "Источник не указан",
      position: [...c.position], rotation: [...c.rotation], hidden: c.hidden === true, locked: c.locked === true,
      opacity: finite(c.opacity) ? Math.min(1, Math.max(.1, c.opacity)) : 1,
      parameters: { length: positive(p.length, 500), width: positive(p.width, 200), height: positive(p.height, 200), diameter: positive(p.diameter, 50), routeOffset: finite(p.routeOffset) ? p.routeOffset : 0 },
      ports, meshUrl: safeMesh(c.meshUrl) ? c.meshUrl : undefined, orphaned: c.orphaned === true,
    };
    const cadSource = object(c.cadSource);
    const line = parseLineBinding(c.line), shape = parseLineShape(c.shape);
    if (line) component.line = line;
    if (shape) component.shape = shape;
    const valveControl = parseValveControl(c.valveControl);
    if (valveControl && valveControl.parentId !== component.id) component.valveControl = valveControl;
    if (c.collector !== undefined && component.kind === "collector") {
      const collector = parseCollectorBinding(c.collector);
      if (collector) { collector.template = finishCollectorTemplate(collector.template); component.collector = collector; component.ports = collector.template.ports; component.bounds = collector.template.bounds; }
      else { component.sourceNote = "Повреждён шаблон коллектора. Обновите состав."; component.ports = []; component.orphaned = true; }
    }
    const autoPose = object(c.autoPose);
    if (vec(autoPose.position) && vec(autoPose.rotation)) component.autoPose = { position: [...autoPose.position], rotation: [...autoPose.rotation], ...(typeof autoPose.parametersKey === "string" ? { parametersKey: autoPose.parametersKey.slice(0, 1000) } : {}) };
    if (finite(p.wallThickness) && p.wallThickness > 0 && p.wallThickness * 2 < component.parameters.diameter) component.parameters.wallThickness = p.wallThickness;
    const insertion = object(c.insertion), template = parseInsertionTemplate(insertion.template);
    if (template && component.kind === "equipment") {
      component.insertion = { template, hiddenPieceIds: Array.isArray(insertion.hiddenPieceIds) ? insertion.hiddenPieceIds.filter((id): id is string => typeof id === "string" && template.geometry.pieces.some(p => p.id === id)) : [] };
      component.ports = template.geometry.ports;
      component.bounds = template.geometry.bounds;
      component.meshUrl = undefined;
      component.equipmentId = template.source.recordId ? `calculated-insertion:${template.source.recordId}` : component.line?.equipmentId;
    } else if (c.insertion !== undefined) {
      component.sourceNote = "Повреждён или не поддерживается сохранённый шаблон вставки. Загрузите позицию из базы заново.";
      component.ports = []; component.meshUrl = undefined; component.orphaned = true;
    }
    if (typeof cadSource.path === "string" && typeof cadSource.hash === "string" && /^[a-f0-9]{64}$/.test(cadSource.hash)) component.cadSource = { path: cadSource.path.slice(0, 1000), hash: cadSource.hash };
    const bounds = c.bounds;
    if (!template && !component.collector && Array.isArray(bounds) && bounds.length === 6 && bounds.every(finite) && [0, 1, 2].every(i => bounds[i + 3] > bounds[i])) component.bounds = [...bounds] as Bounds;
    const routing = object(c.routing), from = object(routing.from), to = object(routing.to);
    if (c.kind === "pipe" && safeId(from.componentId) && safeId(from.portId) && safeId(to.componentId) && safeId(to.portId) && Array.isArray(routing.points) && routing.points.length >= 2 && routing.points.length <= 20 && routing.points.every(vec)) {
      component.routing = { from: { componentId: from.componentId, portId: from.portId }, to: { componentId: to.componentId, portId: to.portId }, automatic: routing.automatic !== false, points: routing.points.map(p => [...p]) as Vec3[] };
    }
    components.push(component);
  }
  result.assembly = { version: 1, sourceFingerprint: typeof assembly.sourceFingerprint === "string" ? assembly.sourceFingerprint.slice(0, 200000) : "", components };
  if (Array.isArray(assembly.lineJoints)) result.assembly.lineJoints = parseLineJoints(assembly.lineJoints);
  if (typeof assembly.lineDataRevision === "string") result.assembly.lineDataRevision = assembly.lineDataRevision.slice(0, 1000);
  if (!ids.has(result.selectedId ?? "")) result.selectedId = null;
  return result;
}

/** Matches Three.js Euler XYZ: the rightmost Z rotation is applied first. */
export function rotate(point: Vec3, rotation: Vec3): Vec3 {
  const [x, y, z] = rotation.map(v => v * Math.PI / 180), [a, b, c] = point;
  const u = a * Math.cos(z) - b * Math.sin(z), v = a * Math.sin(z) + b * Math.cos(z);
  const w = -u * Math.sin(y) + c * Math.cos(y), t = u * Math.cos(y) + c * Math.sin(y);
  return [t, v * Math.cos(x) - w * Math.sin(x), v * Math.sin(x) + w * Math.cos(x)];
}
export const worldPoint = (c: Component, p: Vec3) => add(c.position, rotate(p, c.rotation));
export function portPoint(assembly: Assembly, ref: PortRef): Vec3 | null {
  const c = assembly.components.find(c => c.id === ref.componentId), port = c?.ports.find(p => p.id === ref.portId);
  return c && port ? worldPoint(c, port.point) : null;
}
export function portAxis(assembly: Assembly, ref: PortRef): Vec3 | null {
  const c = assembly.components.find(c => c.id === ref.componentId), port = c?.ports.find(p => p.id === ref.portId);
  return c && port?.axis ? rotate(port.axis, c.rotation) : null;
}
export function pipePoints(assembly: Assembly, c: Component): Vec3[] {
  if (c.line?.ports && c.kind === "pipe") return c.line.ports.map(id => worldPoint(c, c.ports.find(p => p.id === id)?.point ?? [0, 0, 0]));
  if (c.routing) {
    const a = portPoint(assembly, c.routing.from), b = portPoint(assembly, c.routing.to);
    if (c.routing.automatic && !c.locked && a && b) {
      const lead = Math.min(100, distance(a, b) / 4), axisA = portAxis(assembly, c.routing.from), axisB = portAxis(assembly, c.routing.to);
      const aLead = axisA ? add(a, axisA.map(v => v * lead) as Vec3) : a;
      const bLead = axisB ? add(b, axisB.map(v => v * lead) as Vec3) : b;
      const x = (aLead[0] + bLead[0]) / 2 + c.parameters.routeOffset;
      const points: Vec3[] = [a, aLead, [x, aLead[1], aLead[2]], [x, bLead[1], aLead[2]], [x, bLead[1], bLead[2]], bLead, b];
      return points.filter((p, i) => i === 0 || distance(p, points[i - 1]) > .001);
    }
    return c.routing.points.map(p => worldPoint(c, p));
  }
  return [worldPoint(c, [-c.parameters.length / 2, 0, 0]), worldPoint(c, [c.parameters.length / 2, 0, 0])];
}
export function componentBounds(assembly: Assembly, c: Component): Bounds {
  if (c.kind === "pipe") {
    const points = pipePoints(assembly, c), r = c.parameters.diameter / 2, boxes: Bounds[] = [];
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j], length = distance(a, b);
      const radial = [0, 1, 2].map(i => r * Math.sqrt(Math.max(0, 1 - ((b[i] - a[i]) / (length || 1)) ** 2)));
      boxes.push([...[0, 1, 2].map(i => Math.min(a[i], b[i]) - radial[i]), ...[0, 1, 2].map(i => Math.max(a[i], b[i]) + radial[i])] as Bounds);
    }
    for (const p of points.slice(1, -1)) boxes.push([p[0] - r, p[1] - r, p[2] - r, p[0] + r, p[1] + r, p[2] + r]);
    if (!boxes.length) return [...points[0], ...points[0]] as Bounds;
    return [...[0, 1, 2].map(i => Math.min(...boxes.map(b => b[i]))), ...[3, 4, 5].map(i => Math.max(...boxes.map(b => b[i])))] as Bounds;
  }
  const p = c.parameters, bounds: Bounds = c.bounds ?? (c.kind === "collector" ? [-p.length / 2, -p.diameter / 2, -p.diameter / 2, p.length / 2, p.diameter / 2, p.diameter / 2] : [-p.length / 2, -p.width / 2, -p.height / 2, p.length / 2, p.width / 2, p.height / 2]);
  const points: Vec3[] = [];
  for (const x of [bounds[0], bounds[3]]) for (const y of [bounds[1], bounds[4]]) for (const z of [bounds[2], bounds[5]]) points.push(worldPoint(c, [x, y, z]));
  return [...[0, 1, 2].map(i => Math.min(...points.map(p => p[i]))), ...[0, 1, 2].map(i => Math.max(...points.map(p => p[i])))] as Bounds;
}
export function assemblyBounds(assembly: Assembly, visibleOnly = false): Bounds | null {
  const bounds = assembly.components.filter(c => !visibleOnly || !c.hidden).map(c => componentBounds(assembly, c));
  return bounds.length ? [...[0, 1, 2].map(i => Math.min(...bounds.map(b => b[i]))), ...[3, 4, 5].map(i => Math.max(...bounds.map(b => b[i])))] as Bounds : null;
}
export const dimensions = (b: Bounds): Vec3 => [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
export const routeLength = (assembly: Assembly, c: Component) => pipePoints(assembly, c).reduce((length, p, i, points) => length + (i ? distance(p, points[i - 1]) : 0), 0);

export type Edit = { id: string; patch: Partial<Pick<Component, "position" | "rotation" | "hidden" | "locked" | "opacity" | "parameters">> };
/** One command is one immutable transaction; locked geometry cannot be changed by any input path. */
export function editComponent(assembly: Assembly, edit: Edit): Assembly {
  const nextAssembly = { ...assembly, components: assembly.components.map(c => {
    if (c.id !== edit.id) return c;
    const { hidden, opacity, locked } = edit.patch;
    let next: Component = { ...c, ...(typeof hidden === "boolean" ? { hidden } : {}), ...(finite(opacity) ? { opacity: Math.min(1, Math.max(.1, opacity)) } : {}) };
    if (!c.locked) {
      const automatic = c.routing?.automatic;
      if (vec(edit.patch.position) && !automatic) next.position = [...edit.patch.position];
      if (vec(edit.patch.rotation) && !automatic) next.rotation = [...edit.patch.rotation];
      if (edit.patch.parameters && c.kind !== "pump" && c.kind !== "equipment") {
        const params = { ...c.parameters };
        for (const key of [...Object.keys(params), "wallThickness"] as Array<keyof Component["parameters"]>) {
          const value = edit.patch.parameters[key];
          if (finite(value) && Math.abs(value) <= 1e6 && (key === "routeOffset" || value >= (key === "wallThickness" ? .1 : 1))) params[key] = value;
        }
        if (params.wallThickness !== undefined && params.wallThickness * 2 >= params.diameter) return next;
        // Parametric collector branch ports stay attached to the outside of its wall.
        if (c.kind === "collector" && !c.collector) next.ports = c.ports.map(port => ({ ...port, point: [port.point[0], Math.sign(port.point[1]) * params.diameter / 2, port.point[2]] }));
        next.parameters = params;
        if (c.collector?.template.main) {
          const template = structuredClone(c.collector.template), main = template.main!;
          const deltaLength = params.length - main.lengthMm, deltaRadius = (params.diameter - main.outerMm) / 2;
          main.lengthMm = params.length; main.outerMm = params.diameter; main.innerMm = params.diameter - 2 * (params.wallThickness ?? c.parameters.wallThickness!);
          for (const b of template.branches) if (b.role === "instrument" || template.mount.branchLengthReference === "surface-to-pipe-end") b.endMm += deltaRadius;
          for (const port of template.ports) {
            if (port.id.startsWith("network-")) port.point[0] += Math.sign(port.point[0]) * deltaLength / 2;
            else if (template.mount.branchLengthReference === "surface-to-pipe-end") port.point = add(port.point, (port.axis ?? [0,0,0]).map(v => v * deltaRadius) as Vec3);
          }
          for (const p of template.pieces) {
            if (p.id.startsWith("end-")) { p.position[0] += (p.id.startsWith("end-left") ? -1 : 1) * deltaLength / 2; if (deltaRadius) { p.shape = { kind: "marker" }; p.fidelity = "missing"; } }
            else if (p.id.startsWith("branch-") && template.mount.branchLengthReference === "surface-to-pipe-end") p.position[1] += Math.sign(p.position[1]) * deltaRadius;
            else if (p.id.startsWith("instrument")) p.position[2] += deltaRadius;
          }
          template.issues.push("Размеры коллектора изменены вручную; проверьте соответствие расчёту и концевым деталям.");
          next = applyCollectorTemplate(next, finishCollectorTemplate(template)); next.collector!.manualGeometry = true;
        }
        if (c.collector && JSON.stringify(params) !== JSON.stringify(c.parameters)) next.collector = { ...next.collector!, manualGeometry: true };
        if (c.kind === "pipe" && c.line && c.shape?.kind === "tube" && params.wallThickness) {
          next.shape = { ...c.shape, lengthMm: params.length, outerMm: params.diameter, innerMm: params.diameter - 2 * params.wallThickness };
          next.ports = c.ports.map(p => ({ ...p, point: p.id === "right" ? [params.length, 0, 0] : p.point, boreMm: next.shape!.innerMm }));
          const r = params.diameter / 2;
          next.bounds = [0, -r, -r, params.length, r, r];
          next.line = { ...c.line, manualGeometry: true, length: params.length, issues: [...c.line.issues.filter(i => !i.startsWith("Размеры трубы изменены")), "Размеры трубы изменены вручную; проверьте соответствие спецификации"] };
        }
      }
    }
    if (typeof locked === "boolean") {
      if (locked && !c.locked && c.routing) next = { ...next, position: [0, 0, 0], rotation: [0, 0, 0], routing: { ...c.routing, points: pipePoints(assembly, c) } };
      next.locked = locked;
    }
    return next;
  }) };
  const previous = assembly.components.find(c => c.id === edit.id);
  return followValveControls(nextAssembly, !previous?.locked && (edit.patch.position || edit.patch.rotation) ? edit.id : undefined);
}
export function setAutomaticRoute(assembly: Assembly, id: string, automatic: boolean): Assembly {
  return { ...assembly, components: assembly.components.map(c => c.id === id && c.routing && !c.locked ? { ...c, position: [0, 0, 0], rotation: [0, 0, 0], routing: { ...c.routing, automatic, points: pipePoints(assembly, c) } } : c) };
}
export function connectionIssues(assembly: Assembly): Array<{ id: string; message: string }> {
  const issues: Array<{ id: string; message: string }> = [];
  for (const c of assembly.components) {
    if (c.line) for (const message of c.line.issues) issues.push({ id: c.id, message: `${c.name}: ${message}` });
    if (c.orphaned) issues.push({ id: c.id, message: `${c.name}: отсутствует в текущем составе. Сохранена ручная компоновка.` });
    if (c.routing) {
      const a = portPoint(assembly, c.routing.from), b = portPoint(assembly, c.routing.to), points = pipePoints(assembly, c);
      if (!a || !b) issues.push({ id: c.id, message: `${c.name}: точка подключения не найдена.` });
      else if (distance(a, points[0]) > 1 || distance(b, points[points.length - 1]) > 1) issues.push({ id: c.id, message: `${c.name}: соединение нарушено. Зазор ${Math.max(distance(a, points[0]), distance(b, points[points.length - 1])).toFixed(1)} мм.` });
    }
    if (c.kind === "collector") {
      if (c.ports.some(p => !p.id.startsWith("network-") && Math.abs(p.point[0]) > c.parameters.length / 2)) issues.push({ id: c.id, message: `${c.name}: длина не вмещает все отводы.` });
      if (c.collector) for (const message of [...c.collector.template.assumptions, ...c.collector.template.issues, ...resolvedCollectorMetal(c.collector.template).issues]) issues.push({ id: c.id, message: `${c.name}: ${message}` });
      else if (assembly.lineJoints) issues.push({ id: c.id, message: `${c.name}: ${c.sourceNote}` });
    }
  }
  for (const j of assembly.lineJoints ?? []) {
    const a = portPoint(assembly, j.a), b = portPoint(assembly, j.b), axisA = portAxis(assembly, j.a), axisB = portAxis(assembly, j.b);
    const owner = assembly.components.find(c => c.id === j.a.componentId);
    if (!a || !b) issues.push({ id: j.a.componentId, message: `${owner?.name ?? j.id}: точка подключения стыка не найдена.` });
    else {
      const gap = distance(a, b);
      if (Math.abs(gap - j.overlap) > .1) issues.push({ id: j.a.componentId, message: `${owner?.name ?? j.id}: соединение нарушено, расстояние между плоскостями ${gap.toFixed(2)} мм. Автокомпоновка доступна отдельной командой.` });
      if (axisA && axisB && axisA.reduce((s, n, i) => s + n * axisB[i], 0) > -.999) issues.push({ id: j.a.componentId, message: `${owner?.name ?? j.id}: оси стыка не соосны или направлены неверно.` });
      if (j.provisional) issues.push({ id: j.a.componentId, message: `${owner?.name ?? j.id}: монтажные данные стыка предварительные.` });
      const pa = owner?.ports.find(p => p.id === j.a.portId), pb = assembly.components.find(c => c.id === j.b.componentId)?.ports.find(p => p.id === j.b.portId);
      if (pa?.dn && pb?.dn && pa.dn !== pb.dn) issues.push({ id: j.a.componentId, message: `${owner?.name ?? j.id}: несовместимые DN стыка ${pa.dn}/${pb.dn}.` });
      if (pa?.connection && pb?.connection && pa.connection !== pb.connection && ![pa.connection, pb.connection].every(v => v === "weld" || v === "collar")) issues.push({ id: j.a.componentId, message: `${owner?.name ?? j.id}: типы соединения стыка не совпадают (${pa.connection}/${pb.connection}).` });
      if (pa?.connection === "threaded" && pb?.connection === "threaded" && (pa.gender && pb.gender && pa.gender === pb.gender || pa.thread && pb.thread && pa.thread !== pb.thread)) issues.push({ id: j.a.componentId, message: `${owner?.name ?? j.id}: резьбы стыка несовместимы.` });
    }
  }
  return issues;
}

function base(id: string, name: string, kind: Component["kind"]): Component {
  return { id, name, kind, position: [0, 0, 0], rotation: [0, 0, 0], hidden: false, opacity: 1, locked: false, ports: [], sourceNote: "Параметрическая компоновочная геометрия; монтажные размеры требуют проверки", parameters: { length: 500, width: 300, height: 80, diameter: 60.3, routeOffset: 0 } };
}
const outsideDiameter = (dn: number) => ({ 15: 21.3, 20: 26.9, 25: 33.7, 32: 42.4, 40: 48.3, 50: 60.3, 65: 76.1, 80: 88.9, 100: 114.3, 125: 139.7, 150: 168.3, 200: 219.1, 250: 273, 300: 323.9 }[dn] ?? dn * 1.1);
export function sourceFingerprint(project: ProjectConfig): string {
  const entities = project.entities;
  return JSON.stringify(["collector-assembly-v4", VALVE_CONTROL_REVISION, COLLECTOR_INSTRUMENT_RULES_REVISION, "check-valve-flow-v1", PUMP_LINE_RULES_REVISION, VIBRATION_DIMENSIONS_REVISION, FRAME_RULE_REVISION, project.station, entities["system-input"], entities["system-input-2"], entities["station-dn"], entities["station-settings"], ...["suction", "discharge"].map(side => { const c = (entities["station-collectors"] as CollectorsEntity)?.[side as "suction" | "discharge"]; return [c?.configuration, c?.calculation && [c.calculation.fingerprint, c.calculation.lengthMm, c.calculation.branchLengthsMm, c.calculation.bom.map(r => [r.role, r.componentId, r.quantity])], c?.status]; }), (entities["station-spec"] as SpecEntity)?.items.map(i => [i.equipmentId, i.option, i.quantity, i.name, i.position, i.assemblyRole, i.details, i.description, i.status, i.hydraulicAssembly?.parts.map(p => [p.assemblyRole, p.equipmentId, p.quantity])])]);
}
export function buildAssembly(project: ProjectConfig, pumps: Pump[], profiles: ProfileCatalog, lines?: LineCatalog): Assembly {
  const settings = project.entities["station-settings"] as SettingsEntity, dn = project.entities["station-dn"] as DnEntity, collectors = project.entities["station-collectors"] as CollectorsEntity;
  const components: Component[] = [], pumpComponents: Component[] = [];
  const frameSelection = projectFrameSelection(project, pumps);
  // Unknown mass retains only the explicitly labelled legacy layout placeholder.
  const frameHeight = frameSelection.construction?.heightMm ?? 80;
  let y = 0;
  for (const circuit of [1, 2]) {
    if (circuit === 2 && !(settings.stationType === "combined" || settings.stationType === "fire" && settings.jockeyPump)) continue;
    const input = project.entities[circuit === 1 ? "system-input" : "system-input-2"] as InputEntity;
    const pumpId = input.selectedPumpId ?? (circuit === 1 ? project.station.selectedPumpId : project.station.secondaryPumpId);
    const pump = pumps.find(p => p.id === pumpId);
    if (!pump) continue;
    const count = Math.min(12, Math.max(1, Math.floor((input.workingPumpCount ?? 1) + (input.reservePumpCount ?? 0))));
    const profile = profiles.profiles[pump.id], p = pump.dimensions;
    const length = positive(p?.overall_length, positive(p?.flange_face_to_face, 400)), width = positive(p?.overall_width, positive(p?.base_width, 300)), height = positive(p?.overall_height, 700);
    const inletHeight = positive(p?.flange_center_height, 100);
    const bounds: Bounds = profile?.bounds ?? [0, -width / 2, -inletHeight, length, width / 2, height - inletHeight];
    const pitch = lines ? positive(collectors.suction.configuration?.[circuit === 1 ? "primary" : "secondary"]?.spacing, 500) : Math.max(positive(collectors.suction.configuration?.[circuit === 1 ? "primary" : "secondary"]?.spacing, 500), bounds[4] - bounds[1] + 150);
    for (let index = 0; index < count; index++) {
      const c = base(`pump-${circuit}-${pump.id}-${index}`, `${pump.manufacturer} ${pump.model} · ${circuit}.${index + 1}`, "pump");
      c.equipmentId = pump.id; c.sourceKey = pump.id; c.bounds = bounds; c.meshUrl = profile?.meshUrl;
      if (profile) c.cadSource = { path: profile.source, hash: profile.sourceHash };
      c.position = [0, y, frameHeight - bounds[2]];
      c.autoPose = { position: [...c.position], rotation: [...c.rotation] };
      c.parameters = { ...c.parameters, length: bounds[3] - bounds[0], width: bounds[4] - bounds[1], height: bounds[5] - bounds[2] };
      c.ports = profile?.ports.length ? profile.ports.map(port => ({ ...port, point: [...port.point] })) : [{ id: "inlet", point: [0, 0, 0], axis: [-1, 0, 0], provisional: true }, { id: "outlet", point: [length, 0, 0], axis: [1, 0, 0], provisional: true }];
      if (lines) c.ports = c.ports.map(port => {
        if (port.id !== "inlet" && port.id !== "outlet") return port;
        const metadata = resolvePumpPortData(dn, { ...input, selectedPumpId: pump.id }, circuit === 2, port.id);
        return metadata ? { ...port, dn: metadata.dn ?? undefined, connection: metadata.connection ?? undefined, source: metadata.source } : port;
      });
      c.sourceNote = profile ? `${profile.meshUrl ? "Геометрия STEP" : "Габариты STEP; браузерная копия не подготовлена"}. ${profile.warnings.join(". ")}` : `Габаритное представление. ${p?.overall_length && p?.overall_width && p?.overall_height ? "Размеры из каталога" : "Часть размеров оценочная; уточните паспорт"}. Положения патрубков предварительные`;
      if (profile) {
        const mismatches = (["length", "width", "height"] as const).flatMap((key, index) => {
          const catalogSize = p?.[`overall_${key}`], actualSize = c.parameters[key];
          return finite(catalogSize) && catalogSize > 0 && Math.abs(catalogSize - actualSize) > 1 ? [`${["длина", "ширина", "высота"][index]} STEP ${actualSize.toFixed(1)} мм / каталог ${catalogSize} мм`] : [];
        });
        if (mismatches.length) c.sourceNote += `. Расхождение габаритов требует проверки: ${mismatches.join("; ")}`;
      }
      components.push(c); pumpComponents.push(c); y += pitch;
    }
  }
  if (!pumpComponents.length) return addValveControls(withSpecificationModels({ version: 1, sourceFingerprint: sourceFingerprint(project), components: [] }, project, profiles, lines), project);
  const midY = (pumpComponents[0].position[1] + pumpComponents[pumpComponents.length - 1].position[1]) / 2, spanY = y;
  const maxX = Math.max(...pumpComponents.map(c => c.position[0] + c.bounds![3]));
  const frame = base("frame", frameSelection.construction?.label ?? "Рама установки — уточнить массу насоса", "frame");
  frame.parameters = { ...frame.parameters, length: maxX + 1100, width: spanY + 150, height: frameHeight };
  frame.position = [maxX / 2, midY, frameHeight / 2];
  frame.autoPose = { position: [...frame.position], rotation: [...frame.rotation], parametersKey: JSON.stringify(frame.parameters) };
  frame.sourceNote = frameSelection.construction
    ? `${frameSelection.construction.label}; высота ${frameHeight} мм по массе одного насоса ${frameSelection.massKg} кг. Показана условная компоновочная геометрия; длина, ширина, сечение и отверстия требуют уточнения.`
    : `${frameSelection.reasons.join(" ")} Условная высота 80 мм сохранена только для компоновки; конструкция рамы не выбрана.`;
  components.unshift(frame);
  for (const type of ["suction", "discharge"] as const) {
    const discharge = type === "discharge", state = collectors[type];
    const nominal = state.configuration?.dn ?? (discharge ? dn.dischargeCollectorDn : dn.suctionCollectorDn) ?? 65;
    const collector = base(`collector-${type}`, `${discharge ? "Напорный" : "Всасывающий"} коллектор DN${nominal}`, "collector");
    collector.parameters = { ...collector.parameters, length: state.status === "complete" ? positive(state.calculation?.lengthMm, spanY + 50) : spanY + 50, diameter: outsideDiameter(nominal) };
    if (lines) {
      const selectedPipe = state.calculation?.bom.find(r => r.role === "collector-pipe")?.componentId;
      const pipeData = selectedPipe ? lines.items[selectedPipe] : undefined;
      if (pipeData?.kind === "pipe" && pipeData.outerDiameter && pipeData.wall) {
        collector.parameters.diameter = pipeData.outerDiameter; collector.parameters.wallThickness = pipeData.wall;
        if (state.calculation?.lengthMm) collector.parameters.length = state.calculation.lengthMm;
        collector.sourceNote = `Труба коллектора: ${pipeData.source}. Отводы и их монтажные плоскости показаны предварительно; полная геометрия врезок не подтверждена.`;
      } else collector.sourceNote = "Коллектор показан предварительным контуром: нет подтверждённых размеров выбранной трубы/стенки. Рассчитайте коллектор и обновите размеры из базы.";
    }
    collector.position = [discharge ? maxX + 350 : -350, midY, pumpComponents[0].position[2]]; collector.rotation = [0, 0, 90];
    collector.autoPose = { position: [...collector.position], rotation: [...collector.rotation], parametersKey: JSON.stringify(collector.parameters) };
    collector.ports = pumpComponents.map(c => ({ id: c.id, point: [c.position[1] - midY, (discharge ? 1 : -1) * collector.parameters.diameter / 2, 0], axis: [0, discharge ? 1 : -1, 0], provisional: true }));
    const savedMount = (project.entities["station-model"] as ModelEntity)?.editor?.assembly?.components.find(c => c.id === collector.id)?.collector?.template.mount;
    const resolvedCollector = lines ? applyCollectorTemplate(collector, buildCollectorTemplate(state, lines, pumpComponents.map(p => ({ id: p.id, circuit: p.id.startsWith("pump-2-") ? 2 : 1, x: p.position[1] - midY })), type, savedMount)) : collector;
    components.push(resolvedCollector);
    for (const c of pumpComponents) {
      const portId = discharge ? "outlet" : "inlet";
      // PORT_A/PORT_B models awaiting direction review are visible, but not assigned flow roles.
      if (!c.ports.some(p => p.id === portId)) continue;
      const pipe = base(`pipe-${type}-${c.id}`, `${discharge ? "Напорная" : "Всасывающая"} труба · ${c.name}`, "pipe");
      const secondary = c.id.startsWith("pump-2-");
      const branch = state.configuration?.[secondary ? "secondary" : "primary"];
      const branchDn = (discharge ? (secondary ? dn.secondaryDischargeValveDn : dn.dischargeValveDn) : (secondary ? dn.secondarySuctionValveDn : dn.suctionValveDn)) ?? branch?.dn ?? catalogPumpPort(c.equipmentId, portId)?.dn;
      pipe.parameters.diameter = outsideDiameter(branchDn ?? 50);
      if (!branchDn) pipe.sourceNote += ". DN не задан; для компоновки предварительно принят DN50";
      pipe.routing = { from: { componentId: c.id, portId }, to: { componentId: collector.id, portId: c.id }, automatic: true, points: [] };
      components.push(pipe);
    }
  }
  const assembly: Assembly = { version: 1, sourceFingerprint: sourceFingerprint(project), components };
  for (const c of components) if (c.routing) c.routing.points = pipePoints(assembly, c);
  const complete = withSpecificationModels(assembly, project, profiles, lines);
  return addValveControls(lines ? addLineAssemblies(complete, project, profiles, lines) : complete, project);
}

/** Additional purchased equipment waits beside the installation for manual placement.
 * Port metadata is retained; guessing automatic valve mounting would be unsafe. */
function withSpecificationModels(assembly: Assembly, project: ProjectConfig, profiles: ProfileCatalog, lines?: LineCatalog): Assembly {
  const components = [...assembly.components], represented = new Map<string, number>();
  for (const c of components) if (c.kind === "pump") represented.set(`pump:${c.equipmentId}`, (represented.get(`pump:${c.equipmentId}`) ?? 0) + 1);
  let slot = 0;
  for (const item of specificationModels(project)) {
    let profile = profiles.equipment?.[item.key] ?? (item.key.startsWith("pump:") ? profiles.profiles[item.equipmentId] : undefined);
    const row = (project.entities["station-spec"] as SpecEntity).items.find(r => r.position === item.position && r.equipmentId === item.equipmentId);
    // Nested separating assemblies still have one physical valve per unit.
    // Resolve the selected drive, including DN150, before generic profile staging.
    const separator = row?.hydraulicAssembly?.requirement.kind === "isolating-valve";
    const drive = separator || /рукоятк/i.test(row?.details ?? "") ? "handle" : /редуктор/i.test(row?.details ?? "") ? "gear" : "none";
    const pn = separator ? row?.hydraulicAssembly?.requirement.pn : row?.selectedPn ?? Number(row?.details.match(/PN(\d+)/)?.[1]);
    const valve = pn && pn <= 16 ? lines?.items[item.equipmentId]?.valveModels?.find(v => v.drive === drive && v.series === "017W") : undefined;
    if (valve?.shape.kind === "mesh" && valve.shape.meshBounds && valve.shape.modelHash && valve.shape.meshUrl) profile = {
      source: valve.source, sourceHash: valve.shape.modelHash, bounds: valve.shape.meshBounds, meshUrl: valve.shape.meshUrl, ports: [],
      mapping: "series_geometry_review", warnings: ["Геометрия серии Dendor 017W; исполнение материала и PN сверяется с паспортом"],
    };
    if (!profile?.meshUrl || !profile.bounds) continue;
    const count = Math.min(500, Math.floor(item.quantity)), skip = Math.min(represented.get(item.key) ?? 0, count);
    represented.set(item.key, Math.max(0, (represented.get(item.key) ?? 0) - skip));
    for (let i = skip; i < count && components.length < 500; i++) {
      const c = base(`spec-${item.position}-${item.key}-${i}`, `${item.name} · ${item.position}.${i + 1}`, "equipment");
      if (components.some(existing => existing.id === c.id)) continue;
      c.equipmentId = item.equipmentId; c.sourceKey = item.key; c.bounds = profile.bounds; c.meshUrl = profile.meshUrl;
      c.cadSource = { path: profile.source, hash: profile.sourceHash }; c.ports = profile.ports;
      c.parameters = { ...c.parameters, length: profile.bounds[3] - profile.bounds[0], width: profile.bounds[4] - profile.bounds[1], height: profile.bounds[5] - profile.bounds[2] };
      c.position = [2000 + (slot % 5) * Math.max(500, c.parameters.length + 100), Math.floor(slot / 5) * Math.max(500, c.parameters.width + 100), -profile.bounds[2]];
      c.sourceNote = `Геометрия STEP. ${profile.warnings.join(". ")}. Требуется ручное размещение; автоматическое подключение этого оборудования не поддерживается`;
      components.push(c); slot++;
    }
  }
  return { ...assembly, components };
}

export function combineProfiles(current: ProfileCatalog, next: ProfileCatalog): ProfileCatalog {
  // Restoring an old conversion job must not undo a reviewed CAD correction.
  const supersedes = (reviewed: PumpProfile | undefined, incoming: PumpProfile) => reviewed?.flowReview?.status === "confirmed_corrected" && reviewed.flowReview.previousNormalizedHash === incoming.sourceHash;
  const profiles = { ...current.profiles };
  for (const [id, incoming] of Object.entries(next.profiles)) if (!supersedes(profiles[id], incoming)) profiles[id] = incoming;
  const equipment = { ...current.equipment };
  for (const [key, incoming] of Object.entries({ ...current.equipment, ...next.equipment })) {
    const reviewed = key.startsWith("pump:") ? profiles[key.slice(5)] : equipment[key];
    equipment[key] = supersedes(reviewed, incoming) ? reviewed! : incoming;
  }
  return { version: 1, profiles, equipment };
}

/** Resource refresh is not an edit command. Apply it to history snapshots as well
 * so Undo/Redo never rolls back a successfully prepared browser resource. */
export function refreshModelAssets(current: Assembly, project: ProjectConfig, pumps: Pump[], prepared: ProfileCatalog, lines?: LineCatalog): Assembly {
  const generated = buildAssembly(project, pumps, prepared, lines);
  const controlled = new Set(generated.components.flatMap(c => c.valveControl ? [c.valveControl.parentId] : []));
  const supported = generated.components.filter(c => (c.meshUrl || c.shape?.kind === "mesh") && (c.valveControl || controlled.has(c.id) || (c.kind === "pump" ? prepared.profiles[c.equipmentId ?? ""] : prepared.equipment?.[c.sourceKey ?? ""])));
  const next = current.components.map(c => {
    const fresh = supported.find(candidate => candidate.id === c.id);
    if (!fresh || c.line?.manualGeometry) return c;
    if (fresh.valveControl) return { ...fresh, hidden: c.hidden, locked: c.locked, opacity: c.opacity, valveControl: c.valveControl?.manual && c.valveControl.revision === fresh.valveControl.revision ? c.valveControl : fresh.valveControl };
    return { ...c, bounds: fresh.bounds, meshUrl: fresh.meshUrl, ports: fresh.ports, cadSource: fresh.cadSource,
      parameters: fresh.parameters, ...(c.line ? { shape: fresh.shape, line: { ...fresh.line!, baseline: c.line.baseline } } : {}),
      sourceNote: fresh.sourceNote + (/Расхождение габаритов/.test(c.sourceNote) && !/Расхождение габаритов/.test(fresh.sourceNote) ? `. ${c.sourceNote}` : "") };
  });
  for (const c of supported) if (!next.some(old => old.id === c.id) && next.length < 500) next.push(c);
  // Replace legacy grouped control markers only when their mounted instances exist.
  const replaced = (c: Component) => !c.valveControl && next.some(n => n.valveControl && n.line &&
    (/limit-switches-(bracket|switch)$/.test(c.line?.role ?? "") && n.line.pumpId === c.line?.pumpId && n.line.side === c.line?.side && n.line.role === c.line?.role
      || c.id.startsWith(`spec-${n.line.specPosition}-equipment:${n.equipmentId}-`)));
  return followValveControls({ ...current, components: next.filter(c => !replaced(c)) });
}

/** Synchronization retains manual geometry, removed components, and unsupported connections for review. */
export function mergeAssembly(current: Assembly, generated: Assembly): Assembly {
  const ids = new Set(generated.components.map(c => c.id));
  // Obsolete generated pump connection parts must disappear even if they were
  // moved or locked in a saved scene. Unrelated manual equipment stays intact.
  const supersededPumpPart = (c: Component) => c.line && generated.components.some(p => p.id === c.line!.pumpId) &&
    /^(primary|secondary)-(insertion|pump-insertion|pump-flange|valve-flange|check-flange|pump-gasket|pump-fasteners|reducer|after-vibration-insertion|insertion-reducer|vibration)(-|$)/.test(c.line.role);
  return followValveControls({ ...generated, components: [...generated.components.map(c => {
    const previous = current.components.find(old => old.id === c.id);
    if (!previous) return c;
    if (c.valveControl) return { ...c, hidden: previous.hidden, locked: previous.locked, opacity: previous.opacity, valveControl: previous.valveControl?.manual && previous.valveControl.revision === c.valveControl.revision ? previous.valveControl : c.valveControl };
    if (c.kind === "frame" || c.kind === "pump") {
      const automatic = previous.autoPose && !previous.locked &&
        JSON.stringify([previous.position, previous.rotation]) === JSON.stringify([previous.autoPose.position, previous.autoPose.rotation]) &&
        (c.kind !== "frame" || previous.autoPose.parametersKey === JSON.stringify(previous.parameters));
      if (automatic) return { ...c, hidden: previous.hidden, locked: previous.locked, opacity: previous.opacity };
      if (c.kind === "frame") return { ...previous, orphaned: false,
        sourceNote: `Сохранена ручная или прежняя геометрия рамы; проверьте соответствие текущему выбору. ${c.sourceNote}` };
    }
    if (c.collector) {
      if (previous.collector?.manualGeometry || previous.locked && previous.collector) return { ...previous, orphaned: false };
      const automatic = previous.autoPose && JSON.stringify([previous.position, previous.rotation]) === JSON.stringify([previous.autoPose.position, previous.autoPose.rotation]);
      return { ...c, ...(!automatic ? { position: previous.position, rotation: previous.rotation } : {}), hidden: previous.hidden, locked: previous.locked, opacity: previous.opacity,
        collector: { ...c.collector, hiddenPieceIds: previous.collector?.hiddenPieceIds.filter(id => id === "main" || c.collector!.template.branches.some(b => b.id === id) || c.collector!.template.pieces.some(p => p.id === id)) ?? [], selectedPieceId: previous.collector?.selectedPieceId, pieceOpacities: previous.collector?.pieceOpacities } };
    }
    if (c.line) {
      if (previous.line?.manualGeometry) return { ...previous, orphaned: false, line: { ...previous.line, specPosition: c.line.specPosition, quantity: c.line.quantity } };
      const unchanged = previous.line && !previous.locked && JSON.stringify([previous.position, previous.rotation]) === JSON.stringify([previous.line.baseline.position, previous.line.baseline.rotation]);
      return { ...c, ...(!unchanged ? { position: previous.position, rotation: previous.rotation } : {}), hidden: previous.hidden, locked: previous.locked, opacity: previous.opacity,
        ...(c.insertion ? { insertion: { ...c.insertion, hiddenPieceIds: previous.insertion?.hiddenPieceIds.filter(id => c.insertion!.template.geometry.pieces.some(p => p.id === id)) ?? [] } } : {}) };
    }
    if (c.kind === "collector" && previous.autoPose?.parametersKey === JSON.stringify(previous.parameters) && !previous.locked && JSON.stringify([previous.position, previous.rotation]) === JSON.stringify([previous.autoPose.position, previous.autoPose.rotation])) {
      return { ...c, hidden: previous.hidden, locked: previous.locked, opacity: previous.opacity };
    }
    const addedPorts = c.kind === "collector" ? c.ports.filter(port => !previous.ports.some(old => old.id === port.id)).map(port => ({ ...port, point: [port.point[0], Math.sign(port.point[1]) * previous.parameters.diameter / 2, port.point[2]] as Vec3 })) : [];
    return { ...previous, orphaned: false, name: c.name, ...(c.kind === "collector" ? { ports: [...previous.ports, ...addedPorts] } : {}), ...(c.kind === "pump" || c.kind === "equipment" ? { bounds: c.bounds, meshUrl: c.meshUrl, ports: c.ports, sourceNote: c.sourceNote, cadSource: c.cadSource } : {}) };
  }), ...current.components.filter(c => !ids.has(c.id) && !c.valveControl && !supersededPumpPart(c)
    && !(/limit-switches-(bracket|switch)$/.test(c.line?.role ?? "") && generated.components.some(n => n.valveControl && n.line?.pumpId === c.line?.pumpId && n.line?.side === c.line?.side && n.line?.role === c.line?.role))
    && !generated.components.some(n => n.valveControl && n.line && c.id.startsWith(`spec-${n.line.specPosition}-equipment:${n.equipmentId}-`))
    && !(generated.lineJoints && c.routing?.automatic && !c.locked) && !(c.line && !c.line.manualGeometry && !c.locked && JSON.stringify([c.position, c.rotation]) === JSON.stringify([c.line.baseline.position, c.line.baseline.rotation]))).map(c => c.sourceKey === "manual" ? c : { ...c, orphaned: true })] });
}
export function addManualPipe(assembly: Assembly, id: string): Assembly {
  const c = base(id, "Труба (ручная)", "pipe"); c.sourceKey = "manual"; c.position = [0, 0, 500];
  return { ...assembly, components: [...assembly.components, c] };
}

export type AssemblyHistory = { past: Assembly[]; present: Assembly; future: Assembly[] };
export const createHistory = (present: Assembly): AssemblyHistory => ({ past: [], present, future: [] });
export function execute(history: AssemblyHistory, next: Assembly): AssemblyHistory {
  return JSON.stringify(history.present) === JSON.stringify(next) ? history : { past: [...history.past.slice(-29), history.present], present: next, future: [] };
}
export function undo(history: AssemblyHistory): AssemblyHistory {
  return history.past.length ? { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future] } : history;
}
export function redo(history: AssemblyHistory): AssemblyHistory {
  return history.future.length ? { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) } : history;
}

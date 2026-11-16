import type { Pump, PumpSpatialData } from "../pump-catalog";
import type { Bounds, Port, PumpProfile, Vec3 } from "./model";
import { applyMvFlowReview } from "./onis-flow";
import echMounts from "../../data/ech-threaded-mounts.json";
import { horizontalPumpDrawing } from "./horizontal-pump-drawings";
import { applyHorizontalPumpCadPorts } from "./horizontal-pump-cad";
import { applyEndSuctionCadPorts, endSuctionDrawing } from "./end-suction-ports";
import { applyCdmCadPorts } from "./cdm-cad-ports";

export type PumpGeometryInfo = {
  version: 1;
  envelope: "cad" | "catalog" | "incomplete";
  dimensionsMm: [number | null, number | null, number | null];
  coordinateSystem: "cad" | "inlet" | "envelope-base";
  issues: string[];
  schematic?: boolean;
};
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e6;
const positive = (v: unknown): v is number => finite(v) && v > 0;
const vector = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(finite);
const validBounds = (v: unknown): v is Bounds => Array.isArray(v) && v.length === 6 && v.every(finite) && [0, 1, 2].every(i => v[i + 3] > v[i]);
type ThreadedPumpMount = { point: number[]; dn: number; thread: string; depthMm: number };
const echThreadedMounts: Record<string, { model: string; mounts: { inlet?: ThreadedPumpMount; outlet?: ThreadedPumpMount } }> = echMounts;
export function parseCatalogPumpSpatial(raw: unknown): PumpSpatialData | undefined {
  if (!raw || typeof raw !== "object") return;
  const v = raw as PumpSpatialData, b = v.boundsMm;
  if (v.version !== 1 || v.units !== "mm" || v.coordinateSystem !== "inlet" || !Array.isArray(b) || b.length !== 6
    || !b.every(n => n === null || finite(n))
    || ![0, 1, 2].every(i => b[i] === null || b[i + 3] === null || b[i + 3]! > b[i]!)
    || typeof v.source !== "string" || !v.source || typeof v.rule !== "string" || !v.rule
    || !Array.isArray(v.issues) || v.issues.length > 20 || !v.issues.every(s => typeof s === "string" && s.length < 2000)
    || !Array.isArray(v.ports) || v.ports.length !== 2 || new Set(v.ports.map(p => p?.id)).size !== 2
    || !v.ports.every(p => p && ["inlet", "outlet"].includes(p.id) && vector(p.point) && vector(p.axis)
      && Math.abs(Math.hypot(...p.axis) - 1) < 1e-6 && typeof p.source === "string" && p.source.length > 0)
    || !v.ports.find(p => p.id === "inlet")!.point.every(n => n === 0)) return;
  return structuredClone(v);
}
export function parsePumpGeometry(raw: unknown): PumpGeometryInfo | undefined {
  if (!raw || typeof raw !== "object") return;
  const v = raw as PumpGeometryInfo;
  if (v.version !== 1 || !["cad", "catalog", "incomplete"].includes(v.envelope) || !["cad", "inlet", "envelope-base"].includes(v.coordinateSystem)
    || !Array.isArray(v.dimensionsMm) || v.dimensionsMm.length !== 3 || !v.dimensionsMm.every(d => d === null || positive(d))
    || v.envelope !== "incomplete" && v.dimensionsMm.some(d => d === null)
    || v.schematic !== undefined && typeof v.schematic !== "boolean"
    || !Array.isArray(v.issues) || v.issues.length > 20 || !v.issues.every(s => typeof s === "string" && s.length < 2000)) return;
  return structuredClone(v);
}

/** A missing CAD mesh does not discard its measured envelope or port frame.
 * DN, packing dimensions and extra instrument connections are not coordinates. */
export function resolvePumpSpatial(pump: Pump, profile?: PumpProfile): { bounds: Bounds; ports: Port[]; info: PumpGeometryInfo; note: string } {
  profile = applyMvFlowReview(pump.id, profile);
  if (profile && pump.manufacturer === "CNP" && pump.series === "CDM") profile = applyCdmCadPorts(profile);
  if (profile && pump.type === "horizontal_multistage") profile = applyHorizontalPumpCadPorts(profile);
  if (profile && pump.type === "end_suction") profile = applyEndSuctionCadPorts(pump, profile);
  const dimensions = pump.dimensions ?? {}, issues: string[] = [];
  const sizes = ["length", "width", "height"].map(key => positive(dimensions[`overall_${key}`]) ? dimensions[`overall_${key}`] : null) as PumpGeometryInfo["dimensionsMm"];
  const measured = validBounds(profile?.bounds);
  const catalogSpatial = parseCatalogPumpSpatial(pump.spatialData);
  const drawing = !catalogSpatial ? pump.type === "end_suction" ? endSuctionDrawing(pump) : pump.type === "horizontal_multistage" ? horizontalPumpDrawing(pump.id) : undefined : undefined;
  const catalog = catalogSpatial ?? parseCatalogPumpSpatial(drawing) ?? verticalInstallationDrawing(pump, sizes);
  const info: PumpGeometryInfo = { version: 1, envelope: measured ? "cad" : sizes.every(positive) ? "catalog" : "incomplete", dimensionsMm: sizes, coordinateSystem: measured ? "cad" : "envelope-base", issues };
  // 100 mm on an unknown axis is only the selectable diagnostic marker size.
  // It is never published as a pump dimension or used as a nozzle coordinate.
  const [l, w, h] = sizes.map(v => v ?? 100);
  let bounds: Bounds = measured ? [...profile!.bounds] : [0, -w / 2, 0, l, w / 2, h];
  let ports: Port[] = [];
  if (measured) {
    info.dimensionsMm = [0, 1, 2].map(i => bounds[i + 3] - bounds[i]) as Vec3;
    ports = profile!.ports.filter(p => vector(p.point)).map(p => structuredClone(p));
  } else {
    if (catalog) {
      info.coordinateSystem = "inlet";
      info.dimensionsMm = [0, 1, 2].map(i => catalog.boundsMm[i] === null || catalog.boundsMm[i + 3] === null ? null : catalog.boundsMm[i + 3]! - catalog.boundsMm[i]!) as PumpGeometryInfo["dimensionsMm"];
      info.envelope = info.dimensionsMm.every(positive) ? "catalog" : "incomplete";
      bounds = catalog.boundsMm.map((value, index, all) => {
        if (value !== null) return value;
        const opposite = all[(index + 3) % 6];
        const fallback = opposite !== null ? opposite + (index < 3 ? -100 : 100) : [0, -50, 0, 100, 50, 100][index];
        const portPositions = catalog.ports.map(port => port.point[index % 3]);
        return index < 3 ? Math.min(fallback, ...portPositions) : Math.max(fallback, ...portPositions);
      }) as Bounds;
      ports = drawing ? catalog.ports.map(port => ({ ...port, provisional: true })) : catalog.ports;
      issues.push(...catalog.issues);
    } else if (pump.spatialData) issues.push("Некорректная размерная схема каталога; её координаты не использованы.");
    // The imported CNP CDM table explicitly places equal-height inline faces
    // at the overall X limits. Do not extend that convention to other series.
    const face = dimensions.flange_face_to_face, center = dimensions.flange_center_height;
    if (!catalog && pump.manufacturer === "CNP" && pump.series === "CDM" && pump.type === "vertical_multistage"
      && positive(face) && positive(center) && positive(sizes[0]) && Math.abs(face - sizes[0]) < .001 && (!positive(sizes[2]) || center < sizes[2])) {
      info.coordinateSystem = "inlet";
      bounds = [0, -w / 2, -center, l, w / 2, h - center];
      const source = "Таблица CNP CDM: flange_face_to_face, flange_center_height; начало — центр входного фланца";
      ports = [{ id: "inlet", point: [0, 0, 0], axis: [-1, 0, 0], provisional: true, source },
        { id: "outlet", point: [face, 0, 0], axis: [1, 0, 0], provisional: true, source }];
    }
    if (info.envelope === "incomplete") issues.push(`Нет габаритов насоса: ${["длина L", "ширина W", "высота H"].filter((_, i) => info.dimensionsMm[i] === null).join(", ")}. Показан условный контур; неизвестные размеры не являются габаритами насоса.`);
  }
  const horizontal = pump.type === "horizontal_multistage" || pump.type === "end_suction";
  ports = ports.map(p => p.id === "outlet" && !p.axis && horizontal ? { ...p, axis: [0, 0, 1], source: [p.source, "Решение пользователя 30.10.2026: напор горизонтального насоса вверх (+Z)"].filter(Boolean).join("; ") } : p);
  const sourceHash = profile?.sourceHash;
  const measuredThreads = sourceHash ? echThreadedMounts[sourceHash] : undefined;
  if (measuredThreads) ports = ports.map(port => {
    if (port.id !== "inlet" && port.id !== "outlet") return port;
    const mount = measuredThreads.mounts[port.id];
    const expectedAxis = port.id === "inlet" ? [-1, 0, 0] : [0, 0, 1];
    if (!mount || !port.axis?.every((value, index) => Math.abs(value - expectedAxis[index]) < 1e-5)
      || !port.point.every((value, index) => Math.abs(value - mount.point[index]) < 1e-4)) return port;
    return { ...port, dn: mount.dn, connection: "threaded", plane: "thread-reference", gender: "female", thread: mount.thread,
      threadDepthMm: mount.depthMm, provisional: true,
      source: `${measuredThreads.model}, измерение осевых поверхностей по STEP ${sourceHash}. Геометрический предел захода ${mount.depthMm} мм.` };
  });
  for (const [id, label] of [["inlet", "всасывающего"], ["outlet", "напорного"]] as const) {
    if (id === "inlet" && pump.type === "submersible") continue;
    const port = ports.find(p => p.id === id);
    if (!port) issues.push(`Нет координат ${label} патрубка и подтверждённой базы отсчёта. DN не определяет положение; автоматическое подключение этой стороны не построено.`);
    else if (!vector(port.axis) || Math.abs(Math.hypot(...port.axis) - 1) > 1e-6) issues.push(`Нет направления оси ${label} патрубка; автоматическое подключение этой стороны не построено.`);
  }
  const note = [measured ? `${profile?.meshUrl ? "Геометрия STEP" : "Параллелепипед по габаритам STEP; CAD-копия не подготовлена"}. ${profile?.warnings.join(". ")}`
    : info.envelope === "catalog" ? "Параллелепипед по габаритам насоса из каталога (L × W × H)." : "Неполные габариты: диагностический контур, не модель реальных размеров.",
  info.coordinateSystem === "cad" ? "Координаты патрубков сохранены в системе исходной CAD-модели; при размещении высота основания учитывается один раз."
    : info.coordinateSystem === "inlet" ? catalog ? `Начало — центр входного патрубка. ${catalog.rule} Источник: ${catalog.source}` : "Начало локальных координат — центр входного фланца; Z основания = −flange_center_height."
      : "Начало локальных координат — на нижней грани габаритного блока, X=0; это не точка подключения.", ...issues].join(" ");
  return { bounds, ports, info, note };
}

function verticalInstallationDrawing(pump: Pump, sizes: PumpGeometryInfo["dimensionsMm"]): PumpSpatialData | undefined {
  if (pump.type !== "vertical_multistage") return;
  const inlet = pump.inlet, outlet = pump.outlet;
  const low = inlet?.axis_height_mm, high = outlet?.axis_height_mm;
  if (!positive(low) || !positive(high) || typeof inlet?.installation_source !== "string" || typeof outlet?.installation_source !== "string") return;
  const opposed = inlet.layout === "inline_opposed" && outlet.layout === inlet.layout;
  const sameSide = inlet.layout === "same_side_different_heights" && outlet.layout === inlet.layout;
  const span = inlet.face_to_face_mm;
  if (opposed ? !positive(span) || span !== outlet.face_to_face_mm : !sameSide) return;
  const source = [...new Set([inlet.installation_source, outlet.installation_source])].join(", ");
  const declaredWidth = pump.dimensions?.base_width;
  const width = sizes[1] ?? (positive(declaredWidth) ? declaredWidth : null);
  const length = opposed && positive(span) ? Math.max(span, sizes[0] ?? 0) : sizes[0];
  const height = sizes[2];
  return {
    version: 1, units: "mm", coordinateSystem: "inlet", source, issues: [],
    rule: opposed ? "Оси патрубков и расстояние между присоединительными плоскостями по каталогу."
      : "Присоединения на одной стороне. Высота каждой оси от основания по каталогу.",
    boundsMm: [0, width === null ? null : -width / 2, -low, length, width === null ? null : width / 2, height === null ? null : height - low],
    ports: [
      { id: "inlet", point: [0, 0, 0], axis: [-1, 0, 0], source },
      { id: "outlet", point: [opposed && positive(span) ? span : 0, 0, high - low], axis: opposed ? [1, 0, 0] : [-1, 0, 0], source },
    ],
  };
}

/** Display-only convention approved 31.10.2026. Never enrich catalog dimensions
 * or audited nozzle coordinates with these schematic mounting points. */
export function resolvePumpLayout(pump: Pump, profile?: PumpProfile, allowSchematicPorts = true): ReturnType<typeof resolvePumpSpatial> {
  const r = resolvePumpSpatial(pump, profile);
  return completePumpLayout(pump, r, allowSchematicPorts);
}

/** A schematic nozzle must be drawn on its own envelope, never guessed onto
 * a real mesh in an unverified coordinate system. */
export function resolveStationPumpLayout(pump: Pump, profile?: PumpProfile): ReturnType<typeof resolvePumpSpatial> {
  const measured = resolvePumpSpatial(pump, profile);
  if (requiredPorts(pump).every(id => usablePort(measured.ports, id))) return measured;
  const outline = profile ? resolvePumpSpatial(pump) : measured;
  if (requiredPorts(pump).every(id => usablePort(outline.ports, id))) return outline;
  return completePumpLayout(pump, outline, true);
}

const requiredPorts = (pump: Pump) => pump.type === "submersible" ? ["outlet"] : ["inlet", "outlet"];
const usablePort = (ports: Port[], id: string) =>
  ports.some(p => p.id === id && vector(p.axis) && Math.abs(Math.hypot(...p.axis) - 1) < 1e-6);

function completePumpLayout(pump: Pump, r: ReturnType<typeof resolvePumpSpatial>, allowSchematicPorts: boolean): ReturnType<typeof resolvePumpSpatial> {
  if (!allowSchematicPorts) return r;
  const required = requiredPorts(pump);
  const usable = (id: string) => usablePort(r.ports, id);
  // Unassigned CAD port roles still require direction review, not remapping.
  if (required.every(usable) || r.ports.some(p => /^port-[ab]$/.test(p.id))) return r;
  const bounds = [...r.bounds] as Bounds;
  for (let i = 0; i < 3; i++) if (r.info.dimensionsMm[i] === null) {
    const span = [400, 300, 700][i];
    if (i === 1) { bounds[1] = -span / 2; bounds[4] = span / 2; }
    else bounds[i + 3] = bounds[i] + span;
  }
  const l = bounds[3] - bounds[0], h = bounds[5] - bounds[2], y = (bounds[1] + bounds[4]) / 2;
  const horizontal = pump.type === "end_suction" || pump.type === "horizontal_multistage";
  const height = bounds[2] + Math.min(100, h / 2);
  const note = "Условная компоновка: габариты и/или точки подключения насоса неточны. Неизвестные оси блока показаны как 400 × 300 × 700 мм; это не размеры каталога. Правило отображения принято пользователем 31.10.2026.";
  const ports = [...r.ports];
  for (const id of required) if (!usable(id)) {
    const known = ports.find(p => p.id === id);
    const point: Vec3 = id === "inlet" ? [bounds[0], y, height]
      : horizontal ? [bounds[0] + l / 4, y, bounds[5]] : [bounds[3], y, height];
    const axis: Vec3 = id === "inlet" ? [-1, 0, 0] : horizontal ? [0, 0, 1] : [1, 0, 0];
    const port: Port = { ...known, id, point: known?.point ?? point, axis, provisional: true, source: note };
    const index = ports.findIndex(p => p.id === id);
    if (index < 0) ports.push(port); else ports[index] = port;
  }
  const issues = r.info.issues.map(s => s.replace(/автоматическое подключение этой стороны не построено\./g, "подключение в сцене показано условно.").replace("Показан условный контур", "Показан условный блок"));
  return { bounds, ports, info: { ...r.info, schematic: true, issues: [note, ...issues] }, note: [note, ...issues].join(" ") };
}

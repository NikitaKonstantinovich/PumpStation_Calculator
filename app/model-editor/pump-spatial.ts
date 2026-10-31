import type { Pump, PumpSpatialData } from "../pump-catalog";
import type { Bounds, Port, PumpProfile, Vec3 } from "./model";

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
  const dimensions = pump.dimensions ?? {}, issues: string[] = [];
  const sizes = ["length", "width", "height"].map(key => positive(dimensions[`overall_${key}`]) ? dimensions[`overall_${key}`] : null) as PumpGeometryInfo["dimensionsMm"];
  const measured = validBounds(profile?.bounds);
  const catalog = parseCatalogPumpSpatial(pump.spatialData);
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
      bounds = catalog.boundsMm.map((v, i, b) => v ?? (b[(i + 3) % 6] !== null ? b[(i + 3) % 6]! + (i < 3 ? -100 : 100) : [0, -50, 0, 100, 50, 100][i])) as Bounds;
      ports = structuredClone(catalog.ports);
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

/** Display-only convention approved 31.10.2026. Never enrich catalog dimensions
 * or audited nozzle coordinates with these schematic mounting points. */
export function resolvePumpLayout(pump: Pump, profile?: PumpProfile): ReturnType<typeof resolvePumpSpatial> {
  const r = resolvePumpSpatial(pump, profile);
  const required = pump.type === "submersible" ? ["outlet"] : ["inlet", "outlet"];
  const usable = (id: string) => r.ports.some(p => p.id === id && vector(p.axis) && Math.abs(Math.hypot(...p.axis) - 1) < 1e-6);
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

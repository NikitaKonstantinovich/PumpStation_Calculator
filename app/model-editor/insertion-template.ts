import type { InsertCalculation, InsertCatalog, InsertPart } from "../component-insert-calculations";
import { insertPartIdentity, insertMaterialLabel } from "../component-insert-calculations";
import type { FlangeDimensions } from "../flange-dimensions";
import type { Bounds, Component, Vec3 } from "./model";
import type { ConnectionPoint, InsertionGeometry, InsertionPiece, InsertionShape, InsertionTemplate } from "./insertion-types";

export const INSERTION_3D_RULE_VERSION = 1;
export const INSERTION_3D_DECISIONS = "Решения пользователя 26.10.2026: сгон DN15 длиной 110 мм по центру основы вверх; свободный фланец виден как вспомогательная деталь; эксцентриситет по одной прямой наружной образующей.";
export type InsertModelBinding = { hash: string; bounds: Bounds; rotation: Vec3; position: Vec3; source: string };
export type InsertGeometryContext = { catalog: InsertCatalog; flanges: Record<string, FlangeDimensions>; models: Record<string, InsertModelBinding> };
const positive = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const same = (a: number, b: number) => Math.abs(a - b) < .001;

/** Uses the server calculation's finished/base lengths and seating; never calculates fasteners or prices. */
export function prepareInsertionTemplate(row: InsertCalculation, context: InsertGeometryContext, record: { id: string; revision: number } | null = null, angle = 0): Omit<InsertionTemplate, "geometryKey"> {
  if (!Number.isFinite(angle) || Math.abs(angle) > 360) throw new Error("Угол эксцентриситета должен быть от −360 до 360°.");
  const cfg = row.configuration, L = row.totalLengthMm, B = row.baseLengthMm, al = cfg.axialLeftMm, ar = cfg.axialRightMm;
  if (!positive(L) || !positive(B) || al === null || ar === null || !Number.isFinite(al + ar) || !same(L, B + al + ar)) throw new Error("Для 3D нужны согласованные длины основы, изделия и осевые добавки обоих концов. Выполните полный расчёт.");
  if (cfg.extension || row.extension) throw new Error("Сохранена устаревшая вставка с удлиняющей трубой. Пересчитайте по действующему правилу.");
  const issues = [...row.warnings], warnings = ["Компоновочная модель; технологические фаски, резьба и сварные валики не воспроизводятся.", ...(row.assumptions ?? []).map(a => `${a.message} ${a.source}`)];
  const parts = new Map(context.catalog.parts.map(p => [p.id, p]));
  const lookup = (role: string, identity: string | null): InsertPart | undefined => {
    const id = row.bom.find(b => b.role === role)?.componentId;
    const p = id ? parts.get(id) : undefined;
    const found = p ?? context.catalog.parts.find(p => insertPartIdentity(p) === identity);
    if (!found || insertPartIdentity(found) !== identity) { issues.push(`${role}: исходная деталь отсутствует или её геометрия изменилась. Пересчитайте и обновите вставку.`); return undefined; }
    return found;
  };
  const base = lookup("base", cfg.base);
  if (!base || !positive(base.outerDiameter)) throw new Error("Нельзя построить основу: нет подтверждённой детали и наружного диаметра.");
  if (base.geometry !== row.geometry || (row.geometry !== "straight" && base.lengthMm !== B)) throw new Error("Геометрия основы не соответствует сохранённому расчёту; пересчитайте вставку.");
  const D = base.outerDiameter, d = row.geometry === "straight" ? D : base.outerDiameterSmall;
  if (!positive(d)) throw new Error("Не указан фактический наружный диаметр малого конца перехода.");
  const theta = angle * Math.PI / 180, eccentric = row.geometry === "eccentric" ? (D - d) / 2 : 0;
  const offset: Vec3 = [0, eccentric * Math.sin(theta), -eccentric * Math.cos(theta)];
  const material = insertMaterialLabel(row.material), pn = row.pn;
  if (!positive(pn)) throw new Error("Не подтверждён PN вставки.");
  const point = (id: string, position: Vec3, axis: Vec3, dn: number, connection: ConnectionPoint["connection"], source: string, purpose: ConnectionPoint["purpose"] = "connection"): ConnectionPoint => ({ id, point: position, axis, up: axis[2] ? [1, 0, 0] : [0, 0, 1], dn, pn, material, connection, source, purpose, plane: purpose === "weld" ? "weld-end" : connection === "threaded" ? "thread-reference" : "mating-face", provisional: false });
  const pieces: InsertionPiece[] = [], ports: ConnectionPoint[] = [], joints: InsertionGeometry["joints"] = [];
  const add = (id: string, p: InsertPart | undefined, position: Vec3, rotation: Vec3, shape: InsertionShape, fidelity: InsertionPiece["fidelity"], auxiliary = false): InsertionPiece => {
    const piece: InsertionPiece = { id, componentId: p?.id ?? id, name: p?.name ?? id, role: id, auxiliary, position, rotation, shape, ports: [], source: p ? Object.values(p.dimensionSources).join("; ") || p.source : INSERTION_3D_DECISIONS, fidelity };
    pieces.push(piece); return piece;
  };
  const applyModel = (piece: InsertionPiece, p: InsertPart) => {
    const model = context.models[p.id];
    if (!model) return false;
    piece.shape = { kind: "mesh", meshUrl: `/model-assets/model-${model.hash}-v1.stl`, modelHash: model.hash, meshBounds: model.bounds, modelRotation: model.rotation, modelPosition: model.position };
    piece.fidelity = "cad"; piece.source += `; ${model.source}`; return true;
  };
  const inner = positive(base.wallThickness) && D > 2 * base.wallThickness ? D - 2 * base.wallThickness : undefined;
  const wallSmall = base.wallThicknessSmall;
  const smallInner = row.geometry === "straight" ? inner : positive(wallSmall) && d > 2 * wallSmall ? d - 2 * wallSmall : undefined;
  const body = add("base", base, [al, 0, 0], [0, 0, 0], { kind: row.geometry === "straight" ? "tube" : "reducer-outline", lengthMm: B, outerMm: D, innerMm: inner, smallOuterMm: d, smallInnerMm: smallInner, offset }, row.geometry === "straight" && inner ? "parametric" : "outline");
  if (!applyModel(body, base) && row.geometry !== "straight") warnings.push(`${base.id}: точной CAD-модели нет; показана компоновочная оболочка по торцам и длине, без подтверждения профиля и скруглений.`);
  if (!inner || !smallInner) issues.push(`${base.id}: не подтверждена толщина стенки для полной геометрии основы.`);
  body.ports = [point("left-weld", [0, 0, 0], [-1, 0, 0], row.dnLarge, "weld", body.source, "weld"), point("right-weld", [B, offset[1], offset[2]], [1, 0, 0], row.dnSmall ?? row.dnLarge, "weld", body.source, "weld")];
  const ends = [{ side: "left", c: cfg.left, axial: al, dn: row.dnLarge, od: D, origin: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3, axis: [-1, 0, 0] as Vec3 }, { side: "right", c: cfg.right, axial: ar, dn: row.dnSmall ?? row.dnLarge, od: d, origin: [L, offset[1], offset[2]] as Vec3, rotation: [0, 0, 180] as Vec3, axis: [1, 0, 0] as Vec3 }];
  for (const e of ends) {
    const p = lookup(`${e.side}-${e.c.connection}`, e.c.part), fd = p ? context.flanges[p.id] : undefined;
    if (p && (p.dn !== e.dn || p.material !== row.material || p.pn !== pn && !p.compatiblePns?.includes(pn) && !(p.kind === "collar" && pn === 10 && p.pn === 16))) issues.push(`${p.id}: исполнение конца не согласовано с DN/PN/материалом сохранённой вставки.`);
    let shape: InsertionShape = { kind: "marker" }, fidelity: InsertionPiece["fidelity"] = "missing";
    if (p && e.c.connection === "flanged" && positive(p.thicknessMm) && positive(fd?.outerDiameterMm) && positive(p.boreDiameterMm)) {
      const bore = cfg.flangeBores?.find(b => b.side === e.side)?.targetBoreMm ?? p.boreDiameterMm;
      shape = { kind: "flange", lengthMm: p.thicknessMm, outerMm: fd.outerDiameterMm, innerMm: bore, boltCircleMm: fd.boltCircleMm, boltHoleMm: fd.boltHoleDiameterMm, boltHoles: fd.holes }; fidelity = "parametric";
      if (!fd.boltCircleMm || !fd.holes || !fd.boltHoleDiameterMm) { issues.push(`${p.id}: нет полной схемы крепёжных отверстий (K/n/d).`); fidelity = "outline"; }
    } else if (p && e.c.connection === "collar" && positive(p.lengthMm) && positive(p.outerDiameter) && positive(p.wallThickness) && positive(p.lipOuterDiameterMm) && positive(p.thicknessMm)) {
      shape = { kind: "collar", lengthMm: p.lengthMm, outerMm: p.outerDiameter, innerMm: p.outerDiameter - 2 * p.wallThickness, lipOuterMm: p.lipOuterDiameterMm, lipThicknessMm: p.thicknessMm }; fidelity = "outline";
    } else if (e.c.connection === "threaded") issues.push(`${e.side}: резьбовой конец требует подтверждённой модели и плоскости резьбового сопряжения; произвольная резьба не создаётся.`);
    else issues.push(`${p?.id ?? e.side}: не хватает размеров концевой детали для 3D.`);
    const end = add(e.side, p, e.origin, e.rotation, shape, fidelity);
    if (p && e.c.connection === "collar" && !applyModel(end, p)) warnings.push(`${p.id}: контур воротника без неподтверждённых радиусов; несовпадающие по стенке модели не используются.`);
    const external = point(e.side, e.origin, e.axis, e.dn, e.c.connection, end.source);
    external.provisional = fidelity === "missing";
    if (fd) Object.assign(external, { boreMm: fd.boreDiameterMm, boltCircleMm: fd.boltCircleMm, boltHoles: fd.holes, boltHoleMm: fd.boltHoleDiameterMm });
    if (p?.thread) external.thread = p.thread;
    if (p?.threadGender) external.gender = p.threadGender;
    ports.push(external);
    end.ports = [point("face", [0, 0, 0], [-1, 0, 0], e.dn, e.c.connection, end.source), point("base-joint", [e.axial, 0, 0], [1, 0, 0], e.dn, "weld", end.source, "weld")];
    joints.push({ a: { piece: "base", port: `${e.side}-weld` }, b: { piece: e.side, port: "base-joint" }, kind: e.c.connection === "collar" ? "butt" : "seat", confirmed: !!p && fidelity !== "missing" });
    if (e.c.connection === "collar") {
      const loose = context.catalog.parts.find(p => insertPartIdentity(p) === e.c.looseFlange) ?? context.catalog.parts.filter(p => p.kind === "looseFlange" && p.dn === e.dn && p.material === row.material && (p.pn === pn || p.compatiblePns?.includes(pn))).sort((a, b) => Number(b.pn === pn) - Number(a.pn === pn) || a.id.localeCompare(b.id))[0], dims = loose ? context.flanges[loose.id] : undefined;
      if (loose && p && positive(p.thicknessMm) && positive(dims?.thicknessMm) && positive(dims.outerDiameterMm) && positive(dims.boreDiameterMm)) {
        const fits = dims.boreDiameterMm >= e.od && positive(p.lipOuterDiameterMm) && dims.boreDiameterMm < p.lipOuterDiameterMm;
        if (!fits) issues.push(`${loose.id}: свободный фланец не согласован с шейкой и бортом воротника.`);
        warnings.push(`${loose.id}: положение свободного фланца принято за бортом воротника; контакт со скруглением и необходимость фаски требуют проверки перед изготовлением.`);
        const sign = e.side === "left" ? 1 : -1;
        add(`${e.side}-loose`, loose, [e.origin[0] + sign * p.thicknessMm, e.origin[1], e.origin[2]], e.rotation, { kind: "flange", lengthMm: dims.thicknessMm, outerMm: dims.outerDiameterMm, innerMm: dims.boreDiameterMm, boltCircleMm: dims.boltCircleMm, boltHoles: dims.holes, boltHoleMm: dims.boltHoleDiameterMm }, "parametric", true);
        Object.assign(external, { boltCircleMm: dims.boltCircleMm, boltHoles: dims.holes, boltHoleMm: dims.boltHoleDiameterMm });
      } else issues.push(`${e.side}: нет размеров вспомогательного свободного фланца.`);
    }
  }
  if (row.geometry === "eccentric") warnings.push(`${INSERTION_3D_DECISIONS} Смещение осей ${eccentric} мм; угол ${angle}°. Это не измеренный профиль перехода.`);
  if (row.withSensorNipple) {
    const nipple = lookup("sensor-nipple", cfg.sensor.part);
    const center: Vec3 = [al + B / 2, offset[1] / 2, offset[2] / 2 + (D + d) / 4];
    const tube = add("sensor-nipple", nipple, center, [0, -90, 0], nipple && positive(nipple.outerDiameter) ? { kind: "tube", lengthMm: 110, outerMm: nipple.outerDiameter, ...(positive(nipple.wallThickness) ? { innerMm: nipple.outerDiameter - 2 * nipple.wallThickness } : {}) } : { kind: "marker" }, "outline");
    tube.source += `; ${INSERTION_3D_DECISIONS}`;
    const sensor = point("sensor", [center[0], center[1], center[2] + 110], [0, 0, 1], 15, "threaded", tube.source, "sensor");
    sensor.thread = '1/2"'; sensor.gender = "male"; sensor.provisional = true; sensor.occupiedBy = "sensor-plug";
    ports.push(sensor);
    tube.ports = [point("thread", [110, 0, 0], [1, 0, 0], 15, "threaded", tube.source, "sensor")];
    tube.ports[0].provisional = true;
    const capId = row.bom.find(b => b.role === "sensor-plug")?.componentId, cap = context.catalog.sensorPlugs?.find(p => p.id === capId);
    const marker = add("sensor-plug", undefined, sensor.point, [0, 0, 0], { kind: "marker" }, "missing");
    marker.name = cap?.name ?? "Заглушка DN15: геометрия не определена"; marker.componentId = capId ?? marker.id; marker.source = cap?.source ?? marker.source;
    marker.ports = [point("thread", [0, 0, 0], [0, 0, -1], 15, "threaded", marker.source, "sensor")]; marker.ports[0].provisional = true; marker.ports[0].gender = "female"; marker.ports[0].thread = '1/2"';
    joints.push({ a: { piece: tube.id, port: "thread" }, b: { piece: marker.id, port: "thread" }, kind: "thread", confirmed: false });
    issues.push(`${capId ?? "Заглушка DN15"}: нет габаритов и глубины навинчивания; показан условный маркер, подключение занято заглушкой.`);
    issues.push(`${nipple?.id ?? "Сгон DN15"}: не определены профиль врезки и глубина приварки. Начало 110 мм показано на наружном контуре; плоскость резьбы предварительная.`);
    if (!positive(nipple?.wallThickness)) issues.push(`${nipple?.id ?? "Сгон DN15"}: не подтверждена толщина стенки для 3D.`);
  }
  // Conservative envelope for fitting the camera; never used as the finished axial length.
  const radius = Math.max(D / 2, ...pieces.map(p => (p.shape.lipOuterMm ?? p.shape.outerMm ?? 0) / 2));
  const bounds: Bounds = [0, Math.min(0, offset[1]) - radius, Math.min(0, offset[2]) - radius, L, Math.max(0, offset[1]) + radius, Math.max(radius + Math.max(0, offset[2]), ...ports.map(p => p.point[2] + (p.purpose === "sensor" ? 15 : 0)))];
  return { version: 1, geometry: { version: 1, ruleVersion: INSERTION_3D_RULE_VERSION, kind: row.geometry, baseLengthMm: B, totalLengthMm: L, eccentricAngleDeg: angle, pieces, ports, joints, bounds }, source: { recordId: record?.id ?? null, identityKey: row.identityKey, revision: record?.revision ?? 0, name: row.name, pn, material, price: row.price }, status: issues.length ? "incomplete" : "layout", issues: [...new Set(issues)], warnings: [...new Set(warnings)] };
}

/** Only physical data participates: a price/name/source-record revision change must reuse geometry. */
export function insertionGeometrySignature(t: Omit<InsertionTemplate, "geometryKey">): string {
  return JSON.stringify(t.geometry, (key, value) => ["source", "name"].includes(key) ? undefined : value);
}
export function insertionComponent(template: InsertionTemplate, id: string): Component {
  const b = template.geometry.bounds;
  return { id, name: template.source.name, kind: "equipment", equipmentId: template.source.recordId ? `calculated-insertion:${template.source.recordId}` : undefined, sourceKey: "manual", sourceNote: `${template.status === "incomplete" ? "Неполная геометрия" : "Компоновочный шаблон"}. ${template.issues.join(" ")} ${template.warnings.join(" ")}`, position: [0, 0, 0], rotation: [0, 0, 0], hidden: false, locked: false, opacity: 1, bounds: b, parameters: { length: template.geometry.totalLengthMm, width: b[4] - b[1], height: b[5] - b[2], diameter: b[4] - b[1], routeOffset: 0 }, ports: template.geometry.ports, insertion: { template, hiddenPieceIds: [] } };
}

export function connectionCompatibility(a: ConnectionPoint, b: ConnectionPoint): string[] {
  const issues: string[] = [];
  if (a.provisional || b.provisional) issues.push("Предварительное положение подключения");
  if (a.occupiedBy || b.occupiedBy) issues.push("Подключение занято");
  if (a.dn !== b.dn) issues.push("Разные DN");
  if (a.pn !== b.pn) issues.push("Разные PN: совместимость требует проверки");
  if (a.connection === "threaded" || b.connection === "threaded") {
    if (a.connection !== b.connection || !a.thread || a.thread !== b.thread || !a.gender || !b.gender || a.gender === b.gender) issues.push("Несовместимая резьба");
  } else if ([a.connection, b.connection].includes("weld") && a.connection !== b.connection) issues.push("Разные способы соединения");
  else for (const k of ["boltCircleMm", "boltHoles", "boltHoleMm"] as const) if (!a[k] || !b[k] || !same(a[k]!, b[k]!)) issues.push(`Не согласована схема крепежа: ${k}`);
  return issues;
}

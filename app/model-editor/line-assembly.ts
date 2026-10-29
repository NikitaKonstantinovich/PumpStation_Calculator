import type { ProjectConfig, SpecEntity, SpecItem, InputEntity } from "../project-config";
import type { Assembly, Component, PortRef, ProfileCatalog, Vec3 } from "./model";
import type { LineCatalog, LineGeometry, LineJoint } from "./line-types";
import { applyCollectorTemplate, moveCollectorBranchX } from "./collector-template";

const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3;
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
const mul = (a: Vec3, n: number): Vec3 => a.map(v => v * n) as Vec3;
const dot = (a: Vec3, b: Vec3) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => mul(a, 1 / (Math.hypot(...a) || 1));
const length = (a: Vec3, b: Vec3) => Math.hypot(...sub(a, b));
function rotate(p: Vec3, r: Vec3): Vec3 {
  const [x, y, z] = r.map(a => a * Math.PI / 180), u = p[0] * Math.cos(z) - p[1] * Math.sin(z), v = p[0] * Math.sin(z) + p[1] * Math.cos(z), w = -u * Math.sin(y) + p[2] * Math.cos(y);
  return [u * Math.cos(y) + p[2] * Math.sin(y), v * Math.cos(x) - w * Math.sin(x), v * Math.sin(x) + w * Math.cos(x)];
}
const world = (c: Component, p: Vec3) => add(c.position, rotate(p, c.rotation));
function transformedBounds(bounds: NonNullable<Component["bounds"]>, rotation: Vec3, position: Vec3): NonNullable<Component["bounds"]> {
  const points: Vec3[] = [];
  for (const x of [bounds[0], bounds[3]]) for (const y of [bounds[1], bounds[4]]) for (const z of [bounds[2], bounds[5]]) points.push(add(rotate([x, y, z], rotation), position));
  return [...[0, 1, 2].map(i => Math.min(...points.map(p => p[i]))), ...[0, 1, 2].map(i => Math.max(...points.map(p => p[i])))] as NonNullable<Component["bounds"]>;
}

/** Frame-to-frame rotation aligns both axis and up, including vertical pump outlets. */
export function mountingRotation(localAxis: Vec3, targetAxis: Vec3, localUp: Vec3 = [0, 0, 1], targetUp: Vec3 = [0, 0, 1]): Vec3 {
  const frame = (axis: Vec3, up: Vec3) => {
    const x = norm(axis), hint: Vec3 = Math.abs(dot(x, norm(up))) > .999 ? Math.abs(x[2]) < .99 ? [0, 0, 1] : [0, 1, 0] : up;
    const y = norm(cross(hint, x)), z = cross(x, y); return [x, y, z];
  };
  const a = frame(localAxis, localUp), b = frame(targetAxis, targetUp);
  const m = [0, 1, 2].map(i => [0, 1, 2].map(j => b.reduce((s, v, k) => s + v[i] * a[k][j], 0)));
  const y = Math.asin(Math.max(-1, Math.min(1, m[0][2])));
  const x = Math.abs(m[0][2]) < .9999999 ? Math.atan2(-m[1][2], m[2][2]) : Math.atan2(m[2][1], m[1][1]);
  const z = Math.abs(m[0][2]) < .9999999 ? Math.atan2(-m[0][1], m[0][0]) : 0;
  return [x, y, z].map(v => Math.abs(v) < 1e-12 ? 0 : v * 180 / Math.PI) as Vec3;
}

type Entry = { row: SpecItem; sequence: number; index: number; quantity: number; auxiliary: boolean };
/** Assembly roles are emitted by suction/discharge/vibration rules; no equipment is reselected here. */
export function lineEntries(rows: SpecItem[], prefix: string, side: "suction" | "discharge", count: number, data?: LineCatalog): Entry[] {
  const entries: Entry[] = [];
  const order: Record<string, number> = { "pump-gasket": 1, "vibration-pump-gasket": 1, "vibration-compensator": 4, "vibration-insertion-gasket": 6,
    "pump-flange": 9, "adapter-flange": 9, "after-vibration-insertion-flange": 9, "union": 12, "adapter": 12, "insertion": 12, "pump-insertion": 12, "after-vibration-insertion": 12,
    "insertion-reducer-gasket": 17, "reducer-small-flange": 18, "reducer": 20, "reducer-large-flange": 22, "check-flange": 24, "valve-flange": side === "suction" ? 24 : 85,
    "between-valves-insertion": 55, "between-valves-nipple": 55 };
  for (const row of rows) {
    if (row.section !== side || row.quantity <= 0) continue;
    const option = row.option ?? "", role = row.assemblyRole?.replace(`${prefix}-`, "");
    const valve = option === `${prefix}${side === "suction" ? "SuctionValve" : "DischargeValve"}`;
    const check = side === "discharge" && option === `${prefix}CheckValve`;
    if (valve || check) { entries.push({ row, sequence: check ? 35 : 75, index: 0, quantity: row.quantity / count, auxiliary: false }); continue; }
    if (!row.assemblyRole?.startsWith(`${prefix}-`) || /flax|error/.test(role ?? "")) continue;
    const qty = row.quantity / count;
    if (!Number.isInteger(qty) || qty < 1) { entries.push({ row, sequence: 95, index: 0, quantity: qty, auxiliary: true }); continue; }
    if (/fasteners|limit-switch/.test(role!)) { entries.push({ row, sequence: 95, index: 0, quantity: qty, auxiliary: true }); continue; }
    for (let index = 0; index < qty; index++) {
      let sequence = order[role!] ?? order[role!.replace(/-(weldFlange|looseFlange|collar)$/, "")];
      if (role === "check-gaskets") sequence = index === 0 ? 30 : 40;
      if (role === "valve-gaskets") sequence = index === 0 ? 70 : 80;
      if (role?.startsWith("between-valves-flanges")) sequence = index === 0 ? 50 : 60;
      if (role?.startsWith("after-vibration-insertion-flanges")) sequence = index === 0 ? 9 : 15;
      const loose = role?.endsWith("-looseFlange") === true;
      entries.push({ row, sequence: sequence ?? 95, index, quantity: 1, auxiliary: loose || sequence === undefined });
    }
  }
  const covered = new Map<SpecItem, number>();
  for (const entry of entries) {
    const template = entry.row.equipmentId && data?.items[entry.row.equipmentId]?.template;
    if (!template) continue;
    const role = entry.row.assemblyRole?.replace(`${prefix}-`, "");
    const roots = role === "between-valves-insertion" ? ["between-valves-flanges"] : role === "after-vibration-insertion" ? ["after-vibration-insertion-flange", "after-vibration-insertion-flanges"] : role === "reducer" ? ["reducer-small-flange", "reducer-large-flange", "pump-flange", "check-flange", "valve-flange"] : ["pump-flange", "check-flange", "valve-flange", "adapter-flange"];
    const amounts = new Map<string, number>();
    for (const piece of template.geometry.pieces) amounts.set(piece.componentId, (amounts.get(piece.componentId) ?? 0) + 1);
    for (const row of rows) if (row.section === side && row.equipmentId && roots.some(r => row.assemblyRole?.startsWith(`${prefix}-${r}-`))) {
      const n = Math.min(amounts.get(row.equipmentId) ?? 0, row.quantity / count);
      covered.set(row, n); amounts.set(row.equipmentId, (amounts.get(row.equipmentId) ?? 0) - n);
    }
  }
  return entries.filter(e => e.index >= (covered.get(e.row) ?? 0)).sort((a, b) => a.sequence - b.sequence || (a.row.assemblyRole ?? "").localeCompare(b.row.assemblyRole ?? "") || a.index - b.index);
}

function geometryFor(row: SpecItem, data: LineCatalog, profiles: ProfileCatalog): LineGeometry & { meshUrl?: string; cadSource?: Component["cadSource"] } {
  const source = row.equipmentId && data.items[row.equipmentId];
  const g: LineGeometry = source ? structuredClone(source) : { equipmentId: row.equipmentId ?? "", revision: data.revision, source: row.description ?? "Спецификация", length: null, ports: [], fidelity: "missing", issues: ["Нет геометрии выбранной позиции"] };
  const requestedPn = Number(row.details.match(/соединение PN(\d+)/)?.[1]) || row.selectedPn || Number(row.details.match(/PN(\d+)/)?.[1]);
  if (g.vibrationModels) {
    const mounting = g.vibrationModels.find(model => model.pn === requestedPn);
    Object.assign(g, { length: mounting?.length ?? null, shape: mounting?.shape, bounds: mounting?.bounds, fidelity: mounting?.fidelity ?? "missing", source: mounting?.source ?? g.source,
      issues: mounting?.issues ?? [`Нет подтверждённых монтажных размеров виброкомпенсатора PN${requestedPn}`],
      ports: [{ id: "left", point: [0,0,0], axis: [-1,0,0], connection: "flanged", dn: g.dn, pn: requestedPn, provisional: !mounting?.length },
        { id: "right", point: [mounting?.length ?? 0,0,0], axis: [1,0,0], connection: "flanged", dn: g.dn, pn: requestedPn, provisional: !mounting?.length }] });
    return g;
  }
  const drive = /рукоятк/i.test(row.details) ? "handle" : /редуктор/i.test(row.details) ? "gear" : "none";
  const valve = requestedPn <= 16 && requestedPn > 0 ? g.valveModels?.find(m => m.drive === drive) : undefined;
  if (valve) {
    g.shape = valve.shape; g.length = valve.length; g.fidelity = "cad"; g.source = valve.source;
    const flowUnreviewed = valve.series === "010C" && valve.flowDirection !== "left-to-right";
    g.ports = [{ id: "left", point: [0, 0, 0], axis: [-1, 0, 0], up: [0, 0, 1], provisional: flowUnreviewed, dn: g.dn, pn: requestedPn, connection: "flanged", source: valve.source }, { id: "right", point: [g.length, 0, 0], axis: [1, 0, 0], up: [0, 0, 1], provisional: flowUnreviewed, dn: g.dn, pn: requestedPn, connection: "flanged", source: valve.source }];
    g.issues = g.issues.filter(i => !/Нет подтверждённой геометрии|Неизвестна монтажная длина/.test(i));
    g.issues.push("Геометрия серии и монтажные плоскости проверены по STEP; материал, уплотнение и PN конкретного исполнения требуют сверки с паспортом");
    if (valve.series === "010C") g.issues.push(flowUnreviewed
      ? "Направление стрелки CAD обратного клапана не подтверждено"
      : "Стрелка на корпусе обратного клапана направлена от насоса к напорному коллектору");
    if (Math.abs(valve.length - valve.catalogLength) > .01) g.issues.push(`Расхождение монтажной длины: каталог ${valve.catalogLength} мм / плоскости CAD ${valve.length} мм; использованы фактические плоскости без масштабирования`);
  }
  const gasket = g.gasketModels?.find(m => m.pn === requestedPn);
  if (gasket) {
    g.shape = gasket.shape; g.length = gasket.length; g.fidelity = "cad"; g.source = gasket.source;
    g.ports = [{ id: "left", point: [0, 0, 0], axis: [-1, 0, 0], provisional: false, dn: g.dn, pn: requestedPn, connection: "flanged" }, { id: "right", point: [g.length, 0, 0], axis: [1, 0, 0], provisional: false, dn: g.dn, pn: requestedPn, connection: "flanged" }];
    g.issues = g.issues.filter(i => !/геометрии|диаметры|монтажная длина/.test(i));
  }
  const profile = row.equipmentId ? profiles.equipment?.[`equipment:${row.equipmentId}`] : undefined;
  if (!g.valveModels?.length && profile?.meshUrl && profile.ports.length >= 2) {
    const ends = profile.ports.filter(p => /^(left|right|inlet|outlet|large-end|small-end)$/.test(p.id));
    if (ends.length === 2 && ends.every(p => p.axis && !p.provisional)) {
      const measured = length(ends[0].point, ends[1].point);
      if (g.length && Math.abs(g.length - measured) > 1) g.issues.push(`Расхождение монтажной длины: каталог ${g.length} мм / CAD ${measured.toFixed(2)} мм`);
      const left = ends.find(p => /^(left|inlet|large-end)$/.test(p.id)) ?? ends[0], right = ends.find(p => p !== left)!;
      const rotation = mountingRotation(mul(left.axis!, -1), [1, 0, 0], left.up), position = mul(rotate(left.point, rotation), -1);
      return { ...g, length: measured, ports: [left, right].map((p, i) => ({ ...p, id: i === 0 ? "left" : "right", point: add(rotate(p.point, rotation), position), axis: p.axis ? rotate(p.axis, rotation) : undefined, source: profile.source })),
        shape: { kind: "mesh", meshUrl: profile.meshUrl, modelHash: profile.sourceHash, meshBounds: profile.bounds, modelRotation: rotation, modelPosition: position },
        bounds: transformedBounds(profile.bounds, rotation, position), fidelity: "cad", cadSource: { path: profile.source, hash: profile.sourceHash }, source: profile.source, issues: [...g.issues.filter(i => !/Нет подтверждённой геометрии|Неизвестна монтажная длина/.test(i)), ...profile.warnings] };
    }
    g.issues.push("CAD доступен, но монтажные порты не подтверждены; автоматическая установка CAD не выполнена");
  }
  return g;
}

/** Body dimensions and pipe seating come from the same calculator as the catalogue.
 * Separate specification rows remain separate selectable components. */
function branchGeometry(entries: Entry[], data: LineCatalog, profiles: ProfileCatalog) {
  const geometries = new Map(entries.map(entry => [entry, geometryFor(entry.row, data, profiles)]));
  const chain = entries.filter(entry => !entry.auxiliary);
  const isEnd = (entry: Entry) => ["collar", "weldFlange"].includes(geometries.get(entry)?.kind ?? "");
  for (const [index, entry] of chain.entries()) {
    const g = geometries.get(entry)!;
    if (!g.insertionBodies?.length || g.template) continue;
    // Never reach across a valve/gasket to borrow an unrelated end fitting.
    const left = chain[index - 1], right = chain[index + 1];
    if (!left || !right || !isEnd(left) || !isEnd(right)) continue;
    const pn = Number(entry.row.details.match(/PN(\d+)/)?.[1]) || entry.row.selectedPn;
    const candidates = g.insertionBodies.filter(b => b.pn === pn && b.leftPartId === left.row.equipmentId && b.rightPartId === right.row.equipmentId);
    if (candidates.length !== 1) { g.issues.push("Нет однозначного расчёта трубы для выбранных концевых деталей и PN"); continue; }
    const body = candidates[0];
    Object.assign(g, { kind: "pipe", length: body.length, wall: body.wall, outerDiameter: body.outer, fidelity: "parametric", source: body.source,
      shape: { kind: "tube", lengthMm: body.length, outerMm: body.outer, innerMm: body.outer - 2 * body.wall },
      ports: [{ id: "left", point: [0, 0, 0], axis: [-1, 0, 0], connection: "weld", dn: g.dn, pn: body.pn, material: body.material, provisional: false }, { id: "right", point: [body.length, 0, 0], axis: [1, 0, 0], connection: "weld", dn: g.dn, pn: body.pn, material: body.material, provisional: false }],
      issues: [...body.issues, `Труба ${body.pipeId}: размеры и посадки из калькулятора вставок. Цена и материал старой строки спецификации этим расчётом не подтверждаются`] });
    for (const [end, axial] of [[left, body.leftAxial], [right, body.rightAxial]] as const) {
      const geometry = geometries.get(end)!;
      const neck = geometry.ports.find(p => p.id === "right");
      if (neck) { neck.point = [axial, 0, 0]; neck.connection = "weld"; neck.plane = "weld-end"; }
      geometry.mountingDepth = axial;
    }
  }
  return geometries;
}

function reverseEnd(entry: Entry, prefix: string) {
  const role = entry.row.assemblyRole?.replace(`${prefix}-`, "") ?? "";
  if (/^(between-valves-flanges|after-vibration-insertion-flanges)-/.test(role)) return entry.index === 1;
  return /^(check-flange|valve-flange|reducer-large-flange)-/.test(role);
}

/** A loose flange bears on the BACK of the collar lip and adds no series length. */
function seatLooseFlanges(branch: Component[], joints: LineJoint[]) {
  for (const flange of branch.filter(c => c.line?.role.endsWith("-looseFlange"))) {
    const role = flange.line!.role.replace(/-looseFlange$/, "-collar");
    const collar = branch.find(c => c.line?.role === role && c.line.instance === flange.line!.instance);
    const seat = collar?.ports.find(p => p.id === "flange-seat"), face = flange.ports.find(p => p.id === "left");
    if (!collar || !seat || !face) {
      flange.line!.issues.push("Для соосной посадки свободного фланца не подтверждён борт парного воротника");
      continue;
    }
    flange.rotation = [...collar.rotation];
    flange.position = sub(world(collar, seat.point), rotate(face.point, flange.rotation));
    flange.line!.baseline = { position: [...flange.position], rotation: [...flange.rotation] };
    const placement = "Свободный фланец соосен воротнику и расположен за бортом; фаска и контакт со скруглением требуют проверки";
    flange.line!.issues = flange.line!.issues.filter(i => !i.startsWith("Положение вспомогательной детали"));
    flange.line!.issues.push(placement);
    flange.sourceNote = flange.sourceNote.replace("Положение вспомогательной детали/крепежа не подтверждено; показано отдельно от размерной цепи", placement);
    if (flange.shape?.innerMm && collar.shape?.outerMm && collar.shape?.lipOuterMm
      && (flange.shape.innerMm < collar.shape.outerMm || flange.shape.innerMm >= collar.shape.lipOuterMm)) flange.line!.issues.push("Посадочный диаметр свободного фланца не согласован с шейкой/бортом воротника");
    joints.push({ id: `${flange.id}-seat`, a: { componentId: collar.id, portId: seat.id }, b: { componentId: flange.id, portId: face.id }, kind: "seat", overlap: 0, provisional: seat.provisional === true || face.provisional === true });
  }
}

export function addLineAssemblies(base: Assembly, project: ProjectConfig, profiles: ProfileCatalog, data: LineCatalog): Assembly {
  const rows = (project.entities["station-spec"] as SpecEntity).items;
  const components = base.components.filter(c => !c.routing && !c.id.startsWith("spec-")).map(c => structuredClone(c));
  const joints: LineJoint[] = [], endpoints = new Map<string, Array<{ pumpId: string; point: Vec3; axis: Vec3; from: PortRef; provisional: boolean }>>();
  const represented = new Set<string>();
  for (const pump of components.filter(c => c.kind === "pump")) {
    const circuit = pump.id.startsWith("pump-2-") ? 2 : 1, prefix = circuit === 1 ? "primary" : "secondary";
    const input = project.entities[circuit === 1 ? "system-input" : "system-input-2"] as InputEntity;
    const count = (input.workingPumpCount ?? 0) + (input.reservePumpCount ?? 0);
    if (count <= 0) continue;
    for (const side of ["suction", "discharge"] as const) {
      const port = pump.ports.find(p => p.id === (side === "suction" ? "inlet" : "outlet"));
      const entries = lineEntries(rows, prefix, side, count, data);
      const geometries = branchGeometry(entries, data, profiles), branch: Component[] = [];
      let point = port ? world(pump, port.point) : pump.position, axis: Vec3 = port?.axis ? norm(rotate(port.axis, pump.rotation)) : [side === "suction" ? -1 : 1, 0, 0];
      let previous: PortRef = { componentId: pump.id, portId: port?.id ?? "missing" }, provisional = !port || port.provisional === true || !port.axis;
      for (const entry of entries) {
        const { row, index, quantity, auxiliary } = entry, role = row.assemblyRole ?? row.option ?? row.position;
        const g = geometries.get(entry)!;
        const id = `line-${pump.id}-${side}-${role}-${index}`;
        const ports = g.ports.length >= 2 ? g.ports : [{ id: "left", point: [0, 0, 0] as Vec3, axis: [-1, 0, 0] as Vec3, provisional: true }, { id: "right", point: [0, 0, 0] as Vec3, axis: [1, 0, 0] as Vec3, provisional: true }];
        let a = ports.find(p => p.id === "left" || p.id === "inlet" || p.id === "large-end") ?? ports[0];
        let b = ports.find(p => p !== a && /^(right|outlet|small-end)$/.test(p.id)) ?? ports[1];
        // Reducers lead out from the pump's smaller end. Check valves follow actual flow.
        if (g.kind === "reducer" || /reducer$/.test(role) || ["collar", "weldFlange"].includes(g.kind ?? "") && reverseEnd(entry, prefix) || side === "suction" && /CheckValve/.test(role)) [a, b] = [b, a];
        const rotation = mountingRotation(a.axis ? mul(a.axis, -1) : norm(sub(b.point, a.point)), axis, a.up);
        const issues = [...g.issues, ...(row.status !== "selected" ? [row.description || row.details] : [])].filter(Boolean);
        if (auxiliary) issues.push("Положение вспомогательной детали/крепежа не подтверждено; показано отдельно от размерной цепи");
        if (quantity !== 1) issues.push(`Количество на ветвь: ${quantity}. Группа требует размещения отдельных элементов по сверловке`);
        const start = auxiliary && !role.endsWith("-looseFlange") ? add(point, [0, 0, 100 + index * 20]) : point;
        const c: Component = { id, name: row.name, kind: g.kind === "pipe" && g.shape?.kind === "tube" && !g.template ? "pipe" : "equipment", equipmentId: row.equipmentId, sourceKey: `equipment:${row.equipmentId ?? role}`,
          sourceNote: [g.source, ...issues].join(". "), position: sub(start, rotate(a.point, rotation)), rotation, hidden: false, locked: false, opacity: 1,
          parameters: { length: g.length ?? 1, width: 1, height: 1, diameter: g.shape?.outerMm ?? 1, routeOffset: 0, ...(g.wall ? { wallThickness: g.wall } : {}) }, ports,
          bounds: g.bounds, shape: g.shape, meshUrl: g.meshUrl, cadSource: g.cadSource,
          ...(g.template ? { insertion: { template: g.template, hiddenPieceIds: [] } } : {}),
          line: { version: 1, circuit, pumpId: pump.id, side, role, specPosition: row.position, equipmentId: row.equipmentId, instance: index, quantity, sequence: entry.sequence, fidelity: g.fidelity, length: g.length, issues,
            ports: auxiliary ? null : [a.id, b.id], baseline: { position: [0, 0, 0], rotation }, geometryRevision: g.revision, auxiliary } };
        if (!c.bounds) {
          if (g.shape?.kind === "mesh" && g.shape.meshBounds) c.bounds = transformedBounds(g.shape.meshBounds, g.shape.modelRotation ?? [0,0,0], g.shape.modelPosition ?? [0,0,0]);
          else {
            const r = (g.shape?.outerMm ?? 16) / 2;
            c.bounds = [0, -r, -r, Math.max(g.length ?? 0, 1), r, r];
          }
        }
        c.line!.baseline.position = [...c.position];
        components.push(c); branch.push(c); represented.add(`${row.section}:${row.position}`);
        if (!auxiliary) {
          provisional ||= !g.length || a.provisional === true || b.provisional === true;
          const thread = a.connection === "threaded";
          const seat = a.connection === "weld" || a.connection === "collar";
          joints.push({ id: `${id}-in`, a: previous, b: { componentId: id, portId: a.id }, provisional, kind: thread ? "thread" : seat ? "seat" : "face", overlap: 0 });
          if (seat && !g.template && g.mountingDepth === undefined && !g.insertionBodies?.length) c.line!.issues.push("Посадка стыка со вставкой требует сохранённого расчёта; осевое перекрытие не назначено");
          point = world(c, b.point); axis = b.axis ? norm(rotate(b.axis, c.rotation)) : axis;
          // An unresolved mounting length stays provisional. It adds no invented
          // 40 mm spacing to the physical chain or the collector position.
          previous = { componentId: id, portId: b.id };
        }
      }
      seatLooseFlanges(branch, joints);
      if (!entries.length) continue;
      const key = `collector-${side}`;
      endpoints.set(key, [...(endpoints.get(key) ?? []), { pumpId: pump.id, point, axis, from: previous, provisional }]);
    }
  }
  for (const [id, ends] of endpoints) {
    let collector = components.find(c => c.id === id); if (!collector) continue;
    const first = ends[0], local = collector.ports.find(p => p.id === first.pumpId);
    if (local?.axis) {
      collector.rotation = mountingRotation(mul(local.axis, -1), first.axis, [1, 0, 0], [0, 1, 0]);
      // Keep the manifold longitudinal axis along the row of pumps (+Y).
      const longitudinal = rotate([1, 0, 0], collector.rotation);
      if (Math.abs(longitudinal[1]) < .99) collector.sourceNote += ". Ориентация коллектора требует проверки относительно ряда насосов";
      collector.position = sub(first.point, rotate(local.point, collector.rotation));
      if (collector.collector) {
        let template = collector.collector.template;
        for (const end of ends) template = moveCollectorBranchX(template, end.pumpId, local.point[0] + dot(sub(end.point, first.point), longitudinal));
        collector = applyCollectorTemplate(collector, template);
        components[components.findIndex(c => c.id === id)] = collector;
      }
    }
    collector.autoPose = { position: [...collector.position], rotation: [...collector.rotation], parametersKey: JSON.stringify(collector.parameters) };
    for (const end of ends) joints.push({ id: `line-end-${id}-${end.pumpId}`, a: end.from, b: { componentId: id, portId: end.pumpId }, provisional: end.provisional || collector.ports.find(p => p.id === end.pumpId)?.provisional !== false, kind: "face", overlap: 0 });
  }
  // Non-branch equipment keeps its existing manual staging location; branch models are not duplicated there.
  for (const c of base.components.filter(c => c.id.startsWith("spec-"))) {
    const row = rows.find(r => c.id.startsWith(`spec-${r.position}-`));
    if (!row || !represented.has(`${row.section}:${row.position}`)) components.push(c);
  }
  return { ...base, components, lineJoints: joints, lineDataRevision: data.revision };
}

import type { Assembly, Component, Vec3 } from "./model-editor/model";
import type { InsertionPiece, InsertionShape } from "./model-editor/insertion-types";
import type { ModelEntity, ProjectConfig, SpecItem, SpecEntity } from "./project-config";

export type CadFormat = "solidworks" | "edrawings";
export type CadGeometry = { kind: string; [key: string]: unknown };
export type CadInstance = {
  id: string; componentId: string; name: string; equipmentId?: string;
  specPosition?: string; pieceId?: string; group: string; parameters: Component["parameters"];
  transform: number[]; hidden: boolean; geometry: CadGeometry;
};
export type CadManifest = {
  version: 1; projectId: string; projectName: string; projectUpdatedAt: string;
  coordinates: "right-handed-z-up-mm"; transformConvention: "solidworks-row-axes-metres";
  sourceFingerprint: string; instances: CadInstance[]; warnings: string[];
};
export type CadOmission = Pick<CadInstance, "id" | "componentId" | "name" | "specPosition" | "pieceId" | "group"> & { code: string; reason: string; remedy: string };
export type CadJob = {
  id: string; projectId: string; snapshotKey?: string; staleReason?: string; omissions?: CadOmission[];
  artifacts?: Partial<Record<CadFormat, "queued" | "ready" | "failed">>; exportError?: string;
  status: "queued" | "building" | "completed" | "partial" | "failed";
  stage: string; completed: number; total: number; error?: string;
  warnings: string[]; createdAt: string;
};
type Pose = { position: Vec3; rotation: Vec3 };
const zero: Vec3 = [0, 0, 0];
// Identical to Three.js Euler XYZ. SW stores the transformed axes as rows.
function rotate(p: Vec3, r: Vec3): Vec3 {
  const [x, y, z] = r.map(n => n * Math.PI / 180), [a, b, c] = p;
  const u = a * Math.cos(z) - b * Math.sin(z), v = a * Math.sin(z) + b * Math.cos(z);
  const w = -u * Math.sin(y) + c * Math.cos(y), t = u * Math.cos(y) + c * Math.sin(y);
  return [t, v * Math.cos(x) - w * Math.sin(x), v * Math.sin(x) + w * Math.cos(x)];
}
/** Native CAD units are metres in the API; the browser scene uses millimetres. */
export function cadTransform(...poses: Pose[]): number[] {
  const apply = (p: Vec3, translate: boolean) => {
    for (const pose of [...poses].reverse()) {
      p = rotate(p, pose.rotation);
      if (translate) p = p.map((n, i) => n + pose.position[i]) as Vec3;
    }
    return p;
  };
  return [...apply([1, 0, 0], false), ...apply([0, 1, 0], false), ...apply([0, 0, 1], false),
    ...apply(zero, true).map(n => n / 1000), 1, 0, 0, 0];
}
const meshHash = (url?: string) => url?.match(/\/model-([a-f0-9]{64})-v1\.stl$/)?.[1];

/** Snapshot only: never rebuild, follow connections, recenter, or auto-layout here. */
export function createCadManifest(project: ProjectConfig): CadManifest {
  const assembly = (project.entities["station-model"] as ModelEntity)?.editor?.assembly;
  return { version: 1, projectId: project.project.id, projectName: project.project.name, projectUpdatedAt: project.project.updatedAt,
    coordinates: "right-handed-z-up-mm", transformConvention: "solidworks-row-axes-metres", sourceFingerprint: assembly?.sourceFingerprint ?? "",
    ...cadContents(assembly, (project.entities["station-spec"] as SpecEntity)?.items) };
}

export function cadContents(assembly?: Assembly | null, spec: SpecItem[] = []): Pick<CadManifest, "instances" | "warnings"> {
  if (!assembly?.components.length) throw new Error("Сначала соберите установку в 3D-редакторе.");
  const instances: CadInstance[] = [], warnings = new Set<string>();
  const ids = new Set<string>();
  const positions = new Map<string, string | null>();
  for (const row of spec) {
    if (row.equipmentId) positions.set(row.equipmentId, positions.has(row.equipmentId) ? null : row.position);
  }
  const add = (c: Component, part: string, geometry: CadGeometry, poses: Pose[] = [], hidden = false, name = part) => {
    const id = JSON.stringify([c.id, part]);
    if (ids.has(id)) throw new Error(`Повторный идентификатор детали: ${c.name}`);
    ids.add(id);
    const circuit = /^pump-([12])-/.exec(c.id)?.[1];
    instances.push({ id, componentId: c.id, pieceId: (c.collector || c.insertion) && part ? part : undefined, name: name ? `${c.name} / ${name}` : c.name,
      specPosition: c.line?.specPosition ?? c.instrumentMount?.specPosition ?? c.tankMount?.specPosition ?? /^spec-(.+?)-equipment:/.exec(c.id)?.[1] ?? positions.get(c.equipmentId ?? "") ?? undefined,
      group: c.line ? `Контур ${c.line.circuit} · ${c.line.pumpId} · ${c.line.side === "suction" ? "всасывание" : "нагнетание"}` : c.instrumentMount?.parentId ?? c.tankMount?.parentId ?? c.valveControl?.parentId ?? (circuit ? `Контур ${circuit}` : c.name),
      parameters: c.parameters,
      equipmentId: c.equipmentId, transform: cadTransform(c, ...poses), hidden: c.hidden || hidden, geometry });
  };
  const shape = (c: Component, p: InsertionPiece, hidden = false) => {
    const s = p.shape;
    if (s.kind === "mesh" && s.modelHash) {
      add(c, p.id, { kind: "native", hash: s.modelHash }, [p, { position: s.modelPosition ?? zero, rotation: s.modelRotation ?? zero }], hidden, p.name);
    } else if (["marker", "reducer-outline"].includes(s.kind) || p.fidelity === "missing" || p.fidelity === "outline") {
      add(c, p.id, { kind: "unavailable", shape: s, reason: "Для детали задана только условная геометрия." }, [p], hidden, p.name);
    } else {
      if (s.thread) warnings.add("Резьба собственных деталей передаётся номинальной поверхностью без винтового профиля.");
      add(c, p.id, { ...s }, [p], hidden, p.name);
    }
  };
  for (const c of assembly.components) {
    if (/fasteners-(bolts|studs|nuts|washers)$/.test(c.line?.role ?? "")) continue; // BOM rows, not physical instances.
    if (c.orphaned) warnings.add(`${c.name}: элемент оставлен в компоновке после изменения спецификации.`);
    const hash = c.cadSource?.hash ?? meshHash(c.meshUrl);
    if (hash) { add(c, "", { kind: "native", hash, ...(c.cadSource ? { source: c.cadSource.path } : {}) }); continue; }
    if (c.fastener) {
      const b = c.fastener, d = b.dimensions;
      if (b.status !== "ready" || !d) { add(c, "", { kind: "unavailable", reason: b.issues.join(" ") || "Крепёж не рассчитан." }); continue; }
      warnings.add("Резьба крепежа передаётся номинальной поверхностью без винтового профиля.");
      const protrusion = d.ends === 2 ? (d.length - b.grip - 2 * (d.nut + d.washer)) / 2 : 0;
      const start = d.ends === 2 ? -(d.nut + d.washer + protrusion) : 0;
      b.centers.forEach((p, i) => {
        const emit = (role: string, x: number, g: CadGeometry) => add(c, `${i + 1}/${role}`, g, [{ position: [x, p[1], p[2]], rotation: zero }]);
        emit("rod", start, { kind: "rod", lengthMm: d.length, outerMm: d.diameter, headMm: d.ends === 1 ? d.head : 0, flatsMm: d.flats });
        (d.ends === 2 ? [-d.washer, b.grip] : [b.grip]).forEach((x, j) => {
          emit(`washer-${j}`, x, { kind: "tube", lengthMm: d.washer, outerMm: d.washerOuter, innerMm: d.washerInner });
          emit(`nut-${j}`, j === 0 && d.ends === 2 ? -d.washer - d.nut : b.grip + d.washer,
            { kind: "hex", lengthMm: d.nut, flatsMm: d.flats, innerMm: d.diameter });
        });
      });
    } else if (c.collector) {
      const { template: t, hiddenPieceIds } = c.collector;
      for (const issue of t.issues) warnings.add(`${c.name}: ${issue}`);
      add(c, "main", !t.main ? { kind: "unavailable", reason: "Нет геометрии магистрали." } : { kind: "collector-main", ...t.main, branches: t.branches }, [], hiddenPieceIds.includes("main"));
      for (const b of t.branches) {
        if (b.thread) warnings.add("Резьба собственных деталей передаётся номинальной поверхностью без винтового профиля.");
        add(c, b.id, !t.main ? { kind: "unavailable", reason: "Не заданы размеры магистрали для посадки патрубка." } : { kind: "collector-branch", main: t.main, branch: b }, [], hiddenPieceIds.includes(b.id));
      }
      for (const p of t.pieces) shape(c, p, hiddenPieceIds.includes(p.id));
      for (const assumption of t.assumptions) warnings.add(`${c.name}: ${assumption}`);
    } else if (c.insertion) {
      if (!c.insertion.template.geometry.pieces.length) add(c, "", { kind: "unavailable", reason: "Не определён состав вставки." });
      for (const p of c.insertion.template.geometry.pieces) shape(c, p, c.insertion.hiddenPieceIds.includes(p.id));
      for (const issue of c.insertion.template.issues) warnings.add(`${c.name}: ${issue}`);
    } else if (c.shape) {
      shape(c, { id: "body", name: c.name, componentId: c.id, role: "body", auxiliary: false, position: zero, rotation: zero,
        ports: [], source: c.sourceNote, fidelity: c.line?.fidelity ?? "parametric", shape: c.shape });
    } else if (c.kind === "pipe" && !c.routing) {
      if (!c.parameters.wallThickness) { add(c, "", { kind: "unavailable", reason: "Не задана толщина стенки трубы." }); continue; }
      const s: InsertionShape = { kind: "tube", lengthMm: c.parameters.length, outerMm: c.parameters.diameter,
        innerMm: c.parameters.diameter - 2 * c.parameters.wallThickness };
      add(c, "", { ...s }, [{ position: [-c.parameters.length / 2, 0, 0], rotation: zero }]);
    } else {
      // Frame/envelope dimensions cannot stand in for an actual fabrication model.
      add(c, "", { kind: "catalogue", equipmentId: c.equipmentId ?? "", parameters: c.parameters, ...(c.routing ? { routing: c.routing } : {}) });
    }
  }
  if (!instances.length) throw new Error("В компоновке нет физических деталей для сохранения.");
  return structuredClone({ instances, warnings: [...warnings] });
}

export const cadJobActive = (job: CadJob | null) => job?.status === "queued" || job?.status === "building";
export const cadReady = (job: CadJob | null, key: string | null) => !!key && job?.snapshotKey === key && !job.staleReason &&
  (job.status === "completed" || job.status === "partial") && job.completed > 0;

export function cadSnapshotData(instances: CadInstance[]) {
  // Visibility is captured at build time. Camera, selection and display states do not invalidate the build.
  const input = instances.map(p => ({ id: p.id, equipmentId: p.equipmentId, name: p.name, group: p.group,
    specPosition: p.specPosition, transform: p.transform, parameters: p.parameters, geometry: p.geometry }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return JSON.stringify(input, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value);
}

export const snapshotKey = (instances: CadInstance[]) => digestSnapshot(cadSnapshotData(instances));

export async function digestSnapshot(canonical: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

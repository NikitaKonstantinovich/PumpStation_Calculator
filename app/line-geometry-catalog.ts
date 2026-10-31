import type { AssemblyComponent } from "./suction-catalog";
import type { InsertCatalog } from "./component-insert-calculations";
import { generateInsertCalculations } from "./component-insert-calculations";
import type { InsertGeometryContext } from "./model-editor/insertion-template";
import type { LineGeometry } from "./model-editor/line-types";
import type { InsertionShape } from "./model-editor/insertion-types";
import type { Port } from "./model-editor/model";
import { field, number, itemDn } from "./line-spec-parts";
import valveDimensions from "./suction-fasteners.json";
import gasketModels from "../data/line-gasket-models.json";
import valveModels from "../data/line-valve-models.json";
import type { Bounds, Vec3 } from "./model-editor/model";
import { vibrationExecutions } from "./vibration-dimensions";
import { eccentricOffset } from "./model-editor/eccentric-offset";

const positive = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Read the selected row, never select a replacement by name, DN or price. */
export function lineGeometry(item: AssemblyComponent, catalog: InsertCatalog, context: InsertGeometryContext): LineGeometry {
  const part = catalog.parts.find(p => p.id === item.id), flange = context.flanges[item.id], cad = context.models[item.id];
  const get = (pattern: RegExp) => number(field(item, pattern));
  const source = part ? Object.values(part.dimensionSources).join("; ") || part.source : `Каталог: ${item.id}`;
  const result: LineGeometry = { equipmentId: item.id, revision: catalog.version, source, length: null, ports: [], fidelity: "missing", issues: [], kind: part?.kind, dn: itemDn(item) ?? undefined, pn: get(/^PN$/i) ?? undefined };
  const vibrations = vibrationExecutions(item);
  if (vibrations.length) {
    result.kind = "vibration-compensator";
    result.vibrationModels = vibrations.map(execution => {
      const confirmed = execution.status === "confirmed", length = confirmed ? execution.lengthMm! : null, cad = confirmed ? execution.cad : undefined;
      return { pn: execution.pn, length, source: `${execution.source}${cad ? `; STEP: ${cad.source}; проверены уплотнительные торцы` : ""}`,
        fidelity: cad ? "cad" as const : "missing" as const,
        shape: cad ? { kind: "mesh" as const, meshUrl: `/model-assets/model-${cad.sourceHash}-v1.stl`, modelHash: cad.sourceHash, meshBounds: cad.bounds as Bounds, modelRotation: [0,0,0] as Vec3, modelPosition: [-cad.planesMm[0],0,0] as Vec3 }
          : length ? { kind: "marker" as const, lengthMm: length } : undefined,
        bounds: cad ? [0,cad.bounds[1],cad.bounds[2],length!,cad.bounds[4],cad.bounds[5]] as Bounds : length ? [0,-8,-8,length,8,8] as Bounds : undefined,
        issues: [...(!confirmed ? [execution.reason, "Неизвестна монтажная длина выбранного исполнения"] : !cad ? [execution.reason, "Монтажная длина подтверждена; точная геометрия корпуса отсутствует"] : []),
          ...(execution.separateGasket === false ? ["KMS уплотняется собственным эластомером; отдельные прокладки не предусмотрены. Ответные фланцы должны соответствовать руководству производителя."] : [])] };
    });
    // Selection must happen later using the row's selected PN. Never publish
    // PN16 geometry as a generic body for an unresolved PN25 price execution.
    return result;
  }
  const legacyDn = Number(item.id.match(/^suction-table:ff-(\d+)$/)?.[1]);
  if (legacyDn) {
    result.dn = legacyDn;
    // The legacy price row has no length. Reuse the existing engineering calculation,
    // and let the assembly choose only a variant with its exact selected end parts.
    result.insertionBodies = generateInsertCalculations({ dnFrom: legacyDn, dnTo: legacyDn, materials: ["aisi304", "st20"], withSensorNipple: false, includeEccentric: false }, catalog)
      .filter(r => r.geometry === "straight").flatMap(r => {
        const pipe = catalog.parts.find(p => p.id === r.bom.find(b => b.role === "base")?.componentId);
        const left = r.bom.find(b => b.role === `left-${r.leftConnection}`)?.componentId;
        const right = r.bom.find(b => b.role === `right-${r.rightConnection}`)?.componentId;
        const al = r.configuration.axialLeftMm, ar = r.configuration.axialRightMm;
        if (!pipe || !left || !right || !positive(r.pn) || !positive(r.baseLengthMm) || !positive(pipe.outerDiameter) || !positive(pipe.wallThickness)
          || pipe.wallThickness * 2 >= pipe.outerDiameter || al === null || ar === null || al < 0 || ar < 0) return [];
        return [{ leftPartId: left, rightPartId: right, pipeId: pipe.id, pn: r.pn, material: r.material, length: r.baseLengthMm,
          outer: pipe.outerDiameter, wall: pipe.wallThickness, leftAxial: al, rightAxial: ar,
          source: `Расчёт геометрии вставки ${r.name}; основа ${pipe.id}; ${r.dimensions.filter(d => /Длина трубы|Осевая добавка|наружный диаметр|толщина стенки/.test(d.name)).map(d => `${d.name}: ${d.value} ${d.unit}; ${d.source ?? ""}`).join("; ")}`,
          issues: r.warnings }];
      });
  }
  let shape: InsertionShape | undefined;
  const length = part?.lengthMm ?? get(/^(?:Строительная длина|Длина|Длина изделия|Длина вставки|L), мм$/i);
  const outer = part?.outerDiameter ?? get(/^(?:Наружный диаметр|Диаметр), мм$/i);
  const wall = part?.wallThickness ?? get(/^Толщина(?: стенки| 1)?, мм$/i);
  const inner = positive(outer) && positive(wall) ? outer - 2 * wall : get(/^Внутренний диаметр, мм$/i);
  if (positive(outer)) result.outerDiameter = outer;
  if (positive(wall)) result.wall = wall;
  result.length = length;
  const series = /\b017W\b(?!\.)/.test(item.family) ? "017W" : /010[СC]/i.test(item.family) ? "010C" : null;
  if (series && ["затворы", "обратные-клапаны"].includes(item.catalogId)) result.valveModels = valveModels.rows.filter(m => m.series === series && m.dn === result.dn).map(m => ({
    drive: m.drive, series: m.series, source: m.source, length: m.length, catalogLength: m.catalogLength,
    flowDirection: "flowDirection" in m && m.flowDirection === "left-to-right" ? "left-to-right" as const : undefined,
    shape: { kind: "mesh", meshUrl: `/model-assets/model-${m.sourceHash}-v1.stl`, modelHash: m.sourceHash, meshBounds: m.bounds as Bounds, modelPosition: m.position as Vec3, modelRotation: m.rotation as Vec3 },
  }));
  if (part?.kind === "pipe" || part?.kind === "nipple") {
    if (positive(length) && positive(outer) && positive(inner) && inner < outer) {
      shape = { kind: "tube", lengthMm: length, outerMm: outer, innerMm: inner }; result.wall = (outer - inner) / 2;
    } else result.issues.push(...(!positive(wall) ? ["Не задана толщина стенки"] : []));
  } else if (part?.kind === "reducer") {
    if (positive(length) && positive(outer) && positive(part.outerDiameterSmall)) {
      shape = { kind: "reducer-outline", lengthMm: length, outerMm: outer, innerMm: positive(inner) ? inner : undefined, smallOuterMm: part.outerDiameterSmall,
        smallInnerMm: positive(part.wallThicknessSmall) ? part.outerDiameterSmall - 2 * part.wallThicknessSmall : undefined,
        offset: part.geometry === "eccentric" ? eccentricOffset(outer, part.outerDiameterSmall) : [0, 0, 0] };
      result.fidelity = "outline"; result.issues.push("Профиль перехода показан компоновочной оболочкой; точная форма не подтверждена");
      if (!positive(wall) || !positive(part.wallThicknessSmall)) result.issues.push("Не задана толщина стенки одного или обоих концов перехода; показан только контур");
    }
  } else if (part?.kind === "weldFlange" || part?.kind === "looseFlange") {
    result.length = flange?.thicknessMm ?? part.thicknessMm;
    if (positive(result.length) && positive(flange?.outerDiameterMm) && positive(flange?.boreDiameterMm) && positive(flange?.holes) && positive(flange?.boltCircleMm) && positive(flange?.boltHoleDiameterMm)) {
      shape = { kind: "flange", lengthMm: result.length, outerMm: flange.outerDiameterMm, innerMm: flange.boreDiameterMm, boltCircleMm: flange.boltCircleMm, boltHoles: flange.holes, boltHoleMm: flange.boltHoleDiameterMm,
        ...(flange.faceHeightMm !== undefined && flange.faceDiameterMm !== undefined ? { faceHeightMm: flange.faceHeightMm, faceDiameterMm: flange.faceDiameterMm } : {}) };
    } else result.issues.push("Не подтверждены полный профиль и сверловка фланца");
  } else if (part?.kind === "collar") {
    result.lipThickness = part.thicknessMm ?? undefined;
    if (positive(length) && positive(outer) && positive(inner) && positive(part.lipOuterDiameterMm) && positive(part.thicknessMm)) {
      shape = { kind: "collar", lengthMm: length, outerMm: outer, innerMm: inner, lipOuterMm: part.lipOuterDiameterMm, lipThicknessMm: part.thicknessMm };
      result.fidelity = "outline"; result.issues.push("Профиль воротника и скругление требуют подтверждения CAD");
    }
  } else if (item.catalogId === "прокладки") {
    result.kind = "gasket";
    result.length = get(/^(?:Толщина|Толщина прокладки), мм$/i);
    // Legacy "Диаметр" is nominal DN here; gasket thickness is axial, not pipe wall.
    const gasketOuter = get(/^Наружный диаметр(?: прокладки)?, мм$/i), gasketInner = get(/^Внутренний диаметр(?: прокладки)?, мм$/i);
    if (positive(result.length) && positive(gasketOuter) && positive(gasketInner) && gasketInner < gasketOuter) shape = { kind: "tube", lengthMm: result.length, outerMm: gasketOuter, innerMm: gasketInner };
    else result.issues.push("Не подтверждены наружный/внутренний диаметры и толщина прокладки");
    result.gasketModels = gasketModels.rows.filter(r => r.componentId === item.id && r.name === field(item, /^Наименование$/i) && r.dn === result.dn && r.execution === field(item, /^Исполнение$/i) && Math.abs(r.geometry.thickness - (result.length ?? 0)) < 1e-5).map(r => ({ pn: r.modelPn, length: r.geometry.thickness, source: `${gasketModels.source}; ${r.source}`, shape: { kind: "mesh", meshUrl: `/model-assets/model-${r.sourceHash}-v1.stl`, modelHash: r.sourceHash, meshBounds: r.geometry.bounds as Bounds, modelPosition: r.geometry.position as Vec3, modelRotation: r.geometry.rotation as Vec3 } }));
  }
  // This existing reference is specific to the selected valve model, not a generic DN length.
  if (!positive(result.length) && /\b017W\b|\b010[СC]\b|\b012F\b/i.test(item.family)) {
    const reference = valveDimensions.find(r => r.dn === result.dn);
    result.length = /\b017W\b/i.test(item.family) ? reference?.wafer017WLength ?? null : /\b010[СC]\b/i.test(item.family) ? reference?.wafer010CLength ?? null : null;
    if (positive(result.length)) result.source += `; ${reference?.source ?? "Справочник строительных длин выбранной модели"}`;
  }
  if (cad && part && shape) {
    shape = { kind: "mesh", meshUrl: `/model-assets/model-${cad.hash}-v1.stl`, modelHash: cad.hash, meshBounds: cad.bounds, modelPosition: cad.position, modelRotation: cad.rotation };
    result.fidelity = "cad"; result.issues = []; result.source += `; ${cad.source}`;
  }
  if (shape) {
    result.shape = shape;
    if (result.fidelity === "missing") result.fidelity = "parametric";
  } else result.issues.push("Нет подтверждённой геометрии выбранного исполнения");
  if (!positive(result.length)) result.issues.push("Неизвестна монтажная длина");
  if (part) result.issues.push(...part.warnings);
  const threaded = /резьб|американ|ниппель|шаров/i.test(item.family) || part?.kind === "nipple";
  const connection = threaded ? "threaded" : ["pipe", "reducer", "collar"].includes(part?.kind ?? "") ? "weld" : "flanged";
  const provisional = !positive(result.length) || threaded || !shape || result.fidelity === "outline";
  if (threaded) result.issues.push("Не подтверждены монтажные плоскости и глубина навинчивания резьбы");
  const common: Partial<Port> = { connection, dn: result.dn, pn: result.pn, material: part?.material, source: result.source, provisional, plane: threaded ? "thread-reference" : connection === "weld" ? "weld-end" : "mating-face", up: [0, 0, 1], purpose: "connection" };
  result.ports = [{ ...common, id: "left", point: [0, 0, 0], axis: [-1, 0, 0] }, { ...common, id: "right", point: [result.length ?? 0, shape?.offset?.[1] ?? 0, shape?.offset?.[2] ?? 0], axis: [1, 0, 0], ...(part?.dnSmall ? { dn: part.dnSmall } : {}) }];
  if (part?.kind === "collar") {
    Object.assign(result.ports[0], { connection: "flanged", plane: "mating-face" });
    if (positive(result.lipThickness)) result.ports.push({ ...common, id: "flange-seat", point: [result.lipThickness, 0, 0], axis: [1, 0, 0], connection: "collar", plane: "mating-face" });
  }
  if (part?.kind === "looseFlange") for (const port of result.ports) port.connection = "collar";
  return result;
}

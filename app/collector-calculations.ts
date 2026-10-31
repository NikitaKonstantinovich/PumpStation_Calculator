import { baseConfigurationIdentity, collectorNippleCounts } from "./base-values";
import type { CollectorMaterial, StationType, ValveConnection } from "./project-config";
import { checkInletPressure, dnVelocityLimit, type InletPressureCheck } from "./dn-defaults";
import type { PipePaintingRate } from "./component-painting";
import type { BaseVersions, VelocityRule } from "./base-values";
import { collectorInstrumentPortErrors, collectorInstrumentPortIdentity, type CollectorInstrumentPort } from "./hydraulic-port-ledger";
import { collectorSpacingConfirmed, collectorSpacingIsManual } from "./collector-spacing";

export type CollectorType = "suction" | "discharge";
export type CollectorCircuit = { flow: number | null; working: number | null; reserve: number | null; pumpId?: string; pumpModel?: string; dn: number | null; connection: ValveConnection; spacing: number; pn: number; radius?: number | null; spacingStatus?: string; spacingNote?: string; spacingBase?: number | null; spacingManual?: boolean; spacingConfirmation?: string };
export type CollectorConfiguration = { type: CollectorType; dn: number | null; pn: number; material: CollectorMaterial; connection: ValveConnection; eccentric: boolean; stationType: StationType; simultaneous: boolean; jockey: boolean; primary: CollectorCircuit; secondary: CollectorCircuit | null; instrumentPorts?: CollectorInstrumentPort[]; instrumentRuleIssue?:string; sectionBreaks?: number; baseVersions?:BaseVersions; velocityRules?:VelocityRule[] };
export type ComponentKind = "pipe" | "weldFlange" | "looseFlange" | "collar" | "nipple" | "plug";
export type CollectorComponent = { id: string; kind: ComponentKind; name: string; dn: number; pn: number | null; material: CollectorMaterial | "brass"; threadGender?: "female" | "male"; price: number | null; outerDiameter: number | null; innerDiameter: number | null; requiredPipeOuterDiameterMm?: number; source: string };
export type CollectorValveBolt = { dn: number; pn: number; material: CollectorMaterial; model: "017W"; length: number | null; minimumLengthMm: number | null; componentId: string | null; diameter: number; source: string; warnings: string[] };
export const COLLECTOR_BRANCH_LENGTH_RULE = "017W-standard-bolt-v1";
export const currentCollectorLengthRule = (calculation?: CollectorCalculation | null) => calculation?.branchLengthRule === COLLECTOR_BRANCH_LENGTH_RULE;
export type CollectorCatalog = { valveBolts?: CollectorValveBolt[]; version: string; components: CollectorComponent[]; bolts: Array<{ dn: number; pn: number; length: number; source: string }>; paintingRates?: PipePaintingRate[]; weldRates?: {aisi304:number;st20:number} };
export type CollectorBomItem = { role: string; componentId: string | null; kind: ComponentKind | "welding" | "painting"; name: string; quantity: number | null; unit: "м" | "шт."; unitPrice: number | null; cost: number | null; source: string | null };
export type WeldOperation = { role: string; name: string; count: number; lengthMm: number; cost: number };
export type CollectorCalculation = { branchLengthRule?: string; branchBoltReferences?: Array<CollectorValveBolt | null>; fingerprint: string; catalogVersion: string; code: string | null; complete: boolean; warnings: string[]; flow: number | null; mode: string; lengthMm: number; branchLengthsMm: Array<number | null>; velocities: { collector: number | null; primary: number | null; secondary: number | null }; bom: CollectorBomItem[]; welds: WeldOperation[]; weldLengthMm: number; weldCost: number; subtotal: number; price: number | null };
export const THREAD_SIZES: Record<number, string> = { 15: '1/2"', 20: '3/4"', 25: '1"', 32: '1¼"', 40: '1½"', 50: '2"' };
export const WELD_RATES = { aisi304: 5000, st20: 2400 } as const;
export const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const countValid = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000;
export const pumpCount = (c: CollectorCircuit) => (c.working ?? 0) + (c.reserve ?? 0);
export const secondaryAllowed = (c: Pick<CollectorConfiguration, "stationType" | "jockey">) => c.stationType === "combined" || (c.stationType === "fire" && c.jockey);
export const activeCircuits = (c: CollectorConfiguration) => [c.primary, ...(secondaryAllowed(c) && c.secondary ? [c.secondary] : [])];
export function connectionValid(dn: number | null, connection: ValveConnection) { return positive(dn) && (connection === "flanged" || (connection === "threaded" && Boolean(THREAD_SIZES[dn]))); }
export function collectorBranchDiameterErrors(c: CollectorConfiguration, catalog?: CollectorCatalog | null): string[] {
  const pipe = (dn: number | null, pn: number) => catalog?.components.find(v => v.kind === "pipe" && v.dn === dn && v.pn === pn && v.material === c.material);
  const main = pipe(c.dn, c.pn);
  return activeCircuits(c).flatMap((circuit, i) => {
    if (positive(c.dn) && positive(circuit.dn) && circuit.dn > c.dn) return [`Контур ${i + 1}: диаметр патрубка DN${circuit.dn} больше диаметра коллектора DN${c.dn}. Увеличьте DN коллектора или уменьшите DN патрубка.`];
    const branch = pipe(circuit.dn, circuit.pn);
    return positive(main?.outerDiameter) && positive(branch?.outerDiameter) && branch.outerDiameter > main.outerDiameter + 1e-6
      ? [`Контур ${i + 1}: наружный диаметр патрубка DN${circuit.dn} (${branch.outerDiameter} мм) больше наружного диаметра коллектора DN${c.dn} (${main.outerDiameter} мм). Седловая врезка невозможна.`] : [];
  });
}
export function configurationWarnings(c: CollectorConfiguration): string[] {
  const warnings: string[] = [];
  if(c.instrumentRuleIssue)warnings.push(c.instrumentRuleIssue);
  if (!["suction", "discharge"].includes(c.type)) warnings.push("Неизвестный тип коллектора");
  if (!["utility", "fire", "combined", "smart"].includes(c.stationType)) warnings.push("Неизвестный тип станции");
  if (!Object.hasOwn(WELD_RATES, c.material)) warnings.push("Неизвестный материал");
  if (![10, 16, 25].includes(c.pn)) warnings.push("Выберите PN10, PN16 или PN25");
  if (c.eccentric && c.type !== "suction") warnings.push("Эксцентрическое исполнение разрешено только для всасывающего коллектора");
  if (!connectionValid(c.dn, c.connection)) warnings.push("Сетевое соединение: укажите DN; резьба разрешена только до 2\" включительно");
  if (secondaryAllowed(c) && !c.secondary) warnings.push("Не заполнен второй контур");
  activeCircuits(c).forEach((circuit, i) => {
    if (!connectionValid(circuit.dn, circuit.connection)) warnings.push(`Контур ${i + 1}: укажите DN; резьба разрешена только до 2" включительно`);
    if (!countValid(circuit.working) || circuit.working < 1 || !countValid(circuit.reserve)) warnings.push(`Контур ${i + 1}: укажите количество рабочих и резервных насосов`);
    if (!positive(circuit.spacing) || circuit.spacing > 100000) warnings.push(`Контур ${i + 1}: укажите межосевое расстояние`);
    if (collectorSpacingIsManual(circuit)) {
      if (!collectorSpacingConfirmed(c, i)) warnings.push(`Контур ${i+1}: подтвердите ручное межосевое расстояние или верните базовое значение.`);
    } else if(circuit.spacingStatus && circuit.spacingStatus !== "confirmed" && circuit.spacingStatus !== "legacy") warnings.push(`Контур ${i+1}: ${circuit.spacingNote ?? "Межосевое расстояние требует уточнения"}`);
    if(positive(circuit.radius) && circuit.spacing-2*circuit.radius<150) warnings.push(`Контур ${i+1}: свободный зазор ${circuit.spacing-2*circuit.radius} мм меньше 150 мм.`);
    if (![10, 16, 25].includes(circuit.pn)) warnings.push(`Контур ${i + 1}: неизвестный PN`);
  });
  if (c.sectionBreaks !== undefined && (!Number.isInteger(c.sectionBreaks) || c.sectionBreaks < 0 || c.sectionBreaks > 30 || (c.sectionBreaks > 0 && !["fire", "combined"].includes(c.stationType)))) warnings.push("Некорректное количество разделительных стыков коллектора");
  for(const port of c.instrumentPorts??[])if(positive(c.dn)&&port.dn>c.dn)warnings.push(`Сгон ${port.id}: DN${port.dn} больше DN${c.dn} коллектора.`);
  for(const port of c.instrumentPorts??[])if(port.threaded===false&&port.state==="capped")warnings.push(`Сгон ${port.id}: для резьбовой заглушки требуется наружная резьба; измените параметры сгона или способ закрытия.`);
  return [...warnings, ...collectorBranchDiameterErrors(c), ...collectorInstrumentPortErrors(c.instrumentPorts)];
}
export function collectorCode(c: CollectorConfiguration): string | null {
  if (configurationWarnings(c).length) return null;
  const circuits = activeCircuits(c);
  const group = (values: string[]) => values[0] + (values[1] !== undefined ? `(${values[1]})` : "");
  const size = (dn: number | null, connection: ValveConnection) => connection === "threaded" ? THREAD_SIZES[dn!] : String(dn);
  return `${c.type === "suction" ? "В" : "Н"}${size(c.dn, c.connection)}_${c.pn}_${group(circuits.map(v => String(pumpCount(v))))}_${group(circuits.map(v => String(v.spacing)))}_${group(circuits.map(v => size(v.dn, v.connection)))}_${c.material === "aisi304" ? "AISI304" : "СТ20"}${c.eccentric ? "_Э" : ""}`;
}
/** Internal database discriminator. Never displayed as the collector's name. */
export function collectorStorageCode(c: CollectorConfiguration): string | null {
  const code = collectorCode(c); if (!code) return null;
  // Keep legacy codes unchanged. Custom connections get a bounded discriminator;
  // the server also compares the complete physical identity before reuse.
  let portsSuffix = "";
  if (c.instrumentPorts !== undefined) {
    let hash = 2166136261;
    for (const character of collectorInstrumentPortIdentity(c.instrumentPorts)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    portsSuffix = `_КИП-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
  let baseSuffix="";
  if(c.baseVersions && [c.baseVersions.spacing,c.baseVersions.welding,c.baseVersions.painting,c.baseVersions.velocity].some(v=>v!=="legacy-v1")){let hash=2166136261;for(const ch of JSON.stringify([c.baseVersions.spacing,c.baseVersions.welding,c.baseVersions.painting,c.baseVersions.velocity])){hash=Math.imul(hash^ch.charCodeAt(0),16777619);}baseSuffix=`_Б-${(hash>>>0).toString(16)}`;}
  return `${code}${portsSuffix}${c.sectionBreaks ? `_СЕК-${c.sectionBreaks + 1}` : ""}${baseSuffix}`;
}
export function collectorFlow(c: CollectorConfiguration): { flow: number | null; mode: string } {
  // Circuit flows already include all working pumps; reserves only add branches.
  // On suction, the first circuit is always the fire circuit for these stations.
  if (c.type === "suction" && (c.stationType === "fire" || c.stationType === "combined")) {
    const simultaneous = c.stationType === "combined" && c.simultaneous;
    const mode = simultaneous ? "Оба контура одновременно" : "Только пожарный контур";
    const q1 = c.primary.flow, q2 = c.secondary?.flow;
    return { flow: positive(q1) && (!simultaneous || positive(q2)) ? q1 + (simultaneous ? q2! : 0) : null, mode };
  }
  const two = secondaryAllowed(c);
  const mode = !two ? "Расчёт по первому контуру" : c.stationType === "fire" ? "Основные насосы и жокей работают раздельно" : c.simultaneous ? "Контуры работают одновременно" : "Расчёт по наибольшему контуру";
  const q1 = c.primary.flow, q2 = c.secondary?.flow;
  if (!positive(q1) || (two && !positive(q2))) return { flow: null, mode };
  return { flow: !two ? q1 : c.stationType === "combined" && c.simultaneous ? q1 + q2! : Math.max(q1, q2!), mode };
}
export const collectorLength = (c: CollectorConfiguration) => activeCircuits(c).reduce((sum, v) => sum + pumpCount(v) * v.spacing, 0);
export const flowSpeed = (flow: number | null, innerDiameterMm: number | null) => positive(flow) && positive(innerDiameterMm) ? flow / 3600 / (Math.PI * (innerDiameterMm / 1000) ** 2 / 4) : null;
export function collectorVelocityWarning(dn: number | null, velocity: number | null | undefined, rules?:VelocityRule[]): string | null {
  if (!positive(dn) || !positive(velocity) || velocity <= dnVelocityLimit(dn,rules) + 1e-9) return null;
  return `Скорость в коллекторе DN${dn} (${velocity.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} м/с) превышает допустимую ${dnVelocityLimit(dn,rules)} м/с. Увеличьте DN коллектора.`;
}
export const branchLength = (outer: number | null, bolt: number | null) => positive(outer) && positive(bolt) ? 0.5 * outer + 1.1 * bolt : null;
export const flangeKinds = (material: CollectorMaterial, dn: number, pn: number): ComponentKind[] => material === "aisi304" && dn <= 200 && pn < 25 ? ["collar", "looseFlange"] : ["weldFlange"];
export const configurationFingerprint = (c: CollectorConfiguration) => JSON.stringify(baseConfigurationIdentity(c));
export function collectorPressureChecks(c: CollectorConfiguration, inletHead: number | null | undefined, catalog?: CollectorCatalog | null, enabled = true): InletPressureCheck[] {
  if (!enabled || c.type !== "suction") return [];
  const checks = [checkInletPressure(inletHead, "Всасывающий коллектор", c.pn, `PN${c.pn}`)];
  if (catalog) {
    const bom = calculateCollector(c, catalog).bom;
    for (const row of bom) {
      if (row.kind === "welding" || row.kind === "painting") continue;
      const component = catalog.components.find(item => item.id === row.componentId);
      checks.push(checkInletPressure(inletHead, row.name, component?.pn, component?.pn ? `PN${component.pn}` : undefined));
    }
  }
  return checks;
}
export function calculateCollector(c: CollectorConfiguration, catalog: CollectorCatalog): CollectorCalculation {
  const warnings = [...new Set([...configurationWarnings(c), ...collectorBranchDiameterErrors(c, catalog)])], bom: CollectorBomItem[] = [], welds: WeldOperation[] = [];
  const rate = (catalog.weldRates ?? WELD_RATES)[c.material], flow = collectorFlow(c);
  if (flow.flow === null) warnings.push("Укажите расход каждого активного контура больше нуля");
  const label = (kind: ComponentKind, dn: number | null, pn: number) => `${({ pipe: "Труба", weldFlange: "Фланец приварной", looseFlange: "Фланец воротниковый", collar: "Воротник", nipple: "Сгон", plug: "Заглушка резьбовая ВР" })[kind]} DN${dn ?? "?"} PN${pn}${kind === "plug" ? " или выше" : ` ${c.material === "aisi304" ? "AISI304" : "СТ20"}`}`;
  const find = (kind: ComponentKind, dn: number | null, pn: number) => catalog.components.find(v => {
    if (v.kind !== kind || v.dn !== dn) return false;
    // Caps screw onto the sgon: their material need not match welded parts.
    // Unknown pressure or a male thread cannot establish a compatible cap.
    if (kind === "plug") return v.threadGender === "female" && positive(v.pn) && v.pn >= pn && (v.material === c.material || v.material === "brass");
    return v.material === c.material && (v.pn === pn || (kind === "nipple" && v.pn === null));
  });
  const add = (role: string, kind: ComponentKind, dn: number | null, pn: number, quantity: number) => {
    const item = find(kind, dn, pn), name = item?.name ?? label(kind, dn, pn);
    if (!item) warnings.push(`Нет компонента: ${label(kind, dn, pn)}`);
    const price = item?.price;
    if (!positive(price)) warnings.push(`Нет цены: ${name}`);
    const row: CollectorBomItem = { role, componentId: item?.id ?? null, kind, name, quantity, unit: kind === "pipe" ? "м" : "шт.", unitPrice: positive(price) ? price : null, cost: positive(price) ? quantity * price : null, source: item?.source ?? null };
    bom.push(row); return item;
  };
  const dimensions = (item: CollectorComponent | undefined, name: string) => {
    if (!item || !positive(item.outerDiameter) || !positive(item.innerDiameter) || item.innerDiameter >= item.outerDiameter) { warnings.push(`Нет достоверных наружного и внутреннего диаметров: ${name}`); return null; }
    return item;
  };
  const weld = (role: string, name: string, count: number, factor: number, diameter: number | null | undefined) => {
    if (!positive(diameter)) { warnings.push(`Нет наружного диаметра для сварки: ${name}`); return; }
    const lengthMm = count * factor * Math.PI * diameter;
    welds.push({ role, name, count, lengthMm, cost: lengthMm / 1000 * rate });
  };
  const paint = (role: string, name: string, dn: number | null, lengthMm: number | null, count = 1) => {
    if (c.material !== "st20") return;
    const candidates = catalog.paintingRates?.filter(rate => rate.dn === dn && rate.material === "st20") ?? [];
    const tariff = candidates.length === 1 ? candidates[0] : undefined;
    const sourced = typeof tariff?.source === "string" && tariff.source.trim().length > 0;
    if (!tariff) warnings.push(`${candidates.length ? "Неоднозначный" : "Отсутствует"} тариф окраски СТ20 DN${dn ?? "?"}, ₽/м`);
    if (tariff) warnings.push(...tariff.warnings);
    if (tariff && (!positive(tariff.pricePerMeter) || !sourced)) warnings.push(`Нет достоверной цены или источника окраски СТ20 DN${dn ?? "?"}`);
    const quantity = positive(lengthMm) && countValid(count) && count > 0 ? count * lengthMm / 1000 : null;
    if (quantity === null) warnings.push(`Не определена длина труб для окраски: ${name}`);
    const unitPrice = tariff && !tariff.warnings.length && sourced && positive(tariff.pricePerMeter) ? tariff.pricePerMeter : null;
    bom.push({ role, componentId: tariff?.id ?? null, kind: "painting", name: `Окраска: ${name}, DN${dn ?? "?"} СТ20`, quantity, unit: "м", unitPrice,
      cost: quantity !== null && unitPrice !== null ? quantity * unitPrice : null,
      source: `${tariff?.source ?? "Тариф не найден"}; ${count} × ${lengthMm ?? "?"} мм / 1000 × тариф DN${dn ?? "?"}` });
  };
  const lengthMm = collectorLength(c);
  const main = dimensions(add("collector-pipe", "pipe", c.dn, c.pn, lengthMm / 1000), label("pipe", c.dn, c.pn));
  paint("painting-collector", "труба коллектора", c.dn, lengthMm);
  const flanges = (role: string, dn: number | null, pn: number, count: number, outer: number | null | undefined) => {
    for (const kind of flangeKinds(c.material, dn ?? 0, pn)) {
      const item = add(`${role}-${kind}`, kind, dn, pn, count);
      if (item?.requiredPipeOuterDiameterMm && positive(outer) && Math.abs(item.requiredPipeOuterDiameterMm - outer) > .001)
        warnings.push(`${item.name}: посадка на трубу Ø${outer} мм не подтверждена; размерный ряд фланца рассчитан под Ø${item.requiredPipeOuterDiameterMm} мм. Требуется подходящее отверстие или согласованное исполнение соединения.`);
    }
    weld(role, `${role === "section-break" ? "Фланцы разделительных стыков" : role === "end" ? "Концевые соединения" : role === "branch1" ? "Фланцы / воротники контура 1" : "Фланцы / воротники контура 2"}`, count, 2, outer);
  };
  if (c.connection === "flanged") flanges("end", c.dn, c.pn, 2, main?.outerDiameter);
  if (c.sectionBreaks && Number.isInteger(c.sectionBreaks) && c.sectionBreaks > 0 && c.sectionBreaks <= 30) flanges("section-break", c.dn, c.pn, 2 * c.sectionBreaks, main?.outerDiameter);
  const branchLengthsMm: Array<number | null> = [], branchBoltReferences: Array<CollectorValveBolt | null> = [], velocities: Array<number | null> = [];
  activeCircuits(c).forEach((circuit, i) => {
    const count = pumpCount(circuit), bolt = catalog.valveBolts?.find(v => v.model === "017W" && v.dn === circuit.dn && v.pn === circuit.pn && v.material === c.material);
    const boltErrors = bolt?.warnings ?? [];
    branchBoltReferences.push(bolt ?? null);
    warnings.push(...boltErrors.map(reason => `Контур ${i + 1}: ${reason}`));
    if (!bolt || !positive(bolt.length)) warnings.push(`Контур ${i + 1}: нет полной длины выбранного болта затвора 017W DN${circuit.dn ?? "?"} PN${circuit.pn} ${c.material === "aisi304" ? "AISI304" : "СТ20"}; справочник двух фланцев не применяется`);
    const length = branchLength(main?.outerDiameter ?? null, boltErrors.length ? null : bolt?.length ?? null);
    branchLengthsMm.push(length);
    const pipe = dimensions(add(`branch${i + 1}-pipe`, "pipe", circuit.dn, circuit.pn, count * (length ?? 0) / 1000), label("pipe", circuit.dn, circuit.pn));
    paint(`painting-branch${i + 1}`, `патрубки контура ${i + 1}`, circuit.dn, length, count);
    velocities.push(flowSpeed(positive(circuit.working) && positive(circuit.flow) ? circuit.flow / circuit.working : null, pipe?.innerDiameter ?? null));
    if (circuit.connection === "flanged") flanges(`branch${i + 1}`, circuit.dn, circuit.pn, count, pipe?.outerDiameter);
    weld(`branch${i + 1}-joint`, `Врезка патрубков контура ${i + 1}`, count, 1.4, pipe?.outerDiameter);
  });
  const defaultNipples=collectorNippleCounts(c.type,c.material,activeCircuits(c).length===2);
  const instrumentRows = c.instrumentPorts === undefined
    ? [[15, defaultNipples.dn15], [20, defaultNipples.dn20]].filter(([,count])=>count>0).map(([dn, count]) => ({ role: `instrument${dn}`, dn, count, state: "capped" }))
    : collectorInstrumentPortErrors(c.instrumentPorts).length ? [] : c.instrumentPorts.map(port => ({ role: `instrument-${port.id}`, dn: port.dn, count: 1, state: port.state }));
  for (const { role, dn, count, state } of instrumentRows) {
    const nipple = add(role, "nipple", dn, c.pn, count);
    if (state === "capped") add(`${role}-plug`, "plug", dn, c.pn, count);
    if (state === "open") warnings.push(`Отвод ${role}: свободное подключение не закрыто и не назначено оборудованию.`);
    // Sgon OD must be supplied by the catalogue/reference, never inferred from nominal DN.
    weld(role, `Приварка сгонов DN${dn}`, count, 1, nipple?.outerDiameter);
  }
  const weldLengthMm = welds.reduce((sum, v) => sum + v.lengthMm, 0), weldCost = weldLengthMm / 1000 * rate;
  bom.push({ role: "welding", componentId: null, kind: "welding", name: "Сварочные работы", quantity: weldLengthMm / 1000, unit: "м", unitPrice: rate, cost: weldCost, source: "Тариф конструктора" });
  const subtotal = bom.reduce((sum, v) => sum + (v.cost ?? 0), 0), uniqueWarnings = [...new Set(warnings)];
  return { branchLengthRule: COLLECTOR_BRANCH_LENGTH_RULE, branchBoltReferences, fingerprint: configurationFingerprint(c), catalogVersion: catalog.version, code: collectorCode(c), complete: !uniqueWarnings.length, warnings: uniqueWarnings, ...flow, lengthMm, branchLengthsMm, velocities: { collector: flowSpeed(flow.flow, main?.innerDiameter ?? null), primary: velocities[0], secondary: velocities[1] ?? null }, bom, welds, weldLengthMm, weldCost, subtotal, price: uniqueWarnings.length ? null : subtotal };
}

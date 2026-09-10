import type { CollectorMaterial, StationType, ValveConnection } from "./project-config";

export type CollectorType = "suction" | "discharge";
export type CollectorCircuit = { flow: number | null; working: number | null; reserve: number | null; pumpId?: string; pumpModel?: string; dn: number | null; connection: ValveConnection; spacing: number; pn: number };
export type CollectorConfiguration = { type: CollectorType; dn: number | null; pn: number; material: CollectorMaterial; connection: ValveConnection; eccentric: boolean; stationType: StationType; simultaneous: boolean; jockey: boolean; primary: CollectorCircuit; secondary: CollectorCircuit | null };
export type ComponentKind = "pipe" | "weldFlange" | "looseFlange" | "collar" | "nipple" | "plug";
export type CollectorComponent = { id: string; kind: ComponentKind; name: string; dn: number; pn: number | null; material: CollectorMaterial; price: number | null; outerDiameter: number | null; innerDiameter: number | null; source: string };
export type CollectorCatalog = { version: string; components: CollectorComponent[]; bolts: Array<{ dn: number; pn: number; length: number; source: string }> };
export type CollectorBomItem = { role: string; componentId: string | null; kind: ComponentKind | "welding"; name: string; quantity: number; unit: "м" | "шт."; unitPrice: number | null; cost: number | null; source: string | null };
export type WeldOperation = { role: string; name: string; count: number; lengthMm: number; cost: number };
export type CollectorCalculation = { fingerprint: string; catalogVersion: string; code: string | null; complete: boolean; warnings: string[]; flow: number | null; mode: string; lengthMm: number; branchLengthsMm: Array<number | null>; velocities: { collector: number | null; primary: number | null; secondary: number | null }; bom: CollectorBomItem[]; welds: WeldOperation[]; weldLengthMm: number; weldCost: number; subtotal: number; price: number | null };
export const THREAD_SIZES: Record<number, string> = { 15: '1/2"', 20: '3/4"', 25: '1"', 32: '1¼"', 40: '1½"', 50: '2"' };
export const WELD_RATES = { aisi304: 5000, st20: 2400 } as const;
export const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const countValid = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000;
export const pumpCount = (c: CollectorCircuit) => (c.working ?? 0) + (c.reserve ?? 0);
export const secondaryAllowed = (c: Pick<CollectorConfiguration, "stationType" | "jockey">) => c.stationType === "combined" || (c.stationType === "fire" && c.jockey);
export const activeCircuits = (c: CollectorConfiguration) => [c.primary, ...(secondaryAllowed(c) && c.secondary ? [c.secondary] : [])];
export function connectionValid(dn: number | null, connection: ValveConnection) { return positive(dn) && (connection === "flanged" || (connection === "threaded" && Boolean(THREAD_SIZES[dn]))); }
export function configurationWarnings(c: CollectorConfiguration): string[] {
  const warnings: string[] = [];
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
    if (![10, 16, 25].includes(circuit.pn)) warnings.push(`Контур ${i + 1}: неизвестный PN`);
  });
  return warnings;
}
export function collectorCode(c: CollectorConfiguration): string | null {
  if (configurationWarnings(c).length) return null;
  const circuits = activeCircuits(c);
  const group = (values: string[]) => values[0] + (values[1] !== undefined ? `(${values[1]})` : "");
  const size = (dn: number | null, connection: ValveConnection) => connection === "threaded" ? THREAD_SIZES[dn!] : String(dn);
  return `${c.type === "suction" ? "В" : "Н"}${size(c.dn, c.connection)}_${c.pn}_${group(circuits.map(v => String(pumpCount(v))))}_${group(circuits.map(v => String(v.spacing)))}_${group(circuits.map(v => size(v.dn, v.connection)))}_${c.material === "aisi304" ? "AISI304" : "СТ20"}${c.eccentric ? "_Э" : ""}`;
}
export function collectorFlow(c: CollectorConfiguration): { flow: number | null; mode: string } {
  const two = secondaryAllowed(c);
  const mode = !two ? "Расчёт по первому контуру" : c.stationType === "fire" ? "Основные насосы и жокей работают раздельно" : c.simultaneous ? "Контуры работают одновременно" : "Расчёт по наибольшему контуру";
  const q1 = c.primary.flow, q2 = c.secondary?.flow;
  if (!positive(q1) || (two && !positive(q2))) return { flow: null, mode };
  return { flow: !two ? q1 : c.stationType === "combined" && c.simultaneous ? q1 + q2! : Math.max(q1, q2!), mode };
}
export const collectorLength = (c: CollectorConfiguration) => activeCircuits(c).reduce((sum, v) => sum + pumpCount(v) * v.spacing, 0);
export const flowSpeed = (flow: number | null, innerDiameterMm: number | null) => positive(flow) && positive(innerDiameterMm) ? flow / 3600 / (Math.PI * (innerDiameterMm / 1000) ** 2 / 4) : null;
export const branchLength = (outer: number | null, bolt: number | null) => positive(outer) && positive(bolt) ? 0.5 * outer + 1.1 * bolt : null;
export const flangeKinds = (material: CollectorMaterial, dn: number, pn: number): ComponentKind[] => material === "aisi304" && dn <= 200 && pn < 25 ? ["collar", "looseFlange"] : ["weldFlange"];
export const configurationFingerprint = (c: CollectorConfiguration) => JSON.stringify(c);
export function calculateCollector(c: CollectorConfiguration, catalog: CollectorCatalog): CollectorCalculation {
  const warnings = configurationWarnings(c), bom: CollectorBomItem[] = [], welds: WeldOperation[] = [];
  const rate = WELD_RATES[c.material], flow = collectorFlow(c);
  if (flow.flow === null) warnings.push("Укажите расход каждого активного контура больше нуля");
  const label = (kind: ComponentKind, dn: number | null, pn: number) => `${({ pipe: "Труба", weldFlange: "Фланец приварной", looseFlange: "Фланец воротниковый", collar: "Воротник", nipple: "Сгон", plug: "Заглушка резьбовая" })[kind]} DN${dn ?? "?"} PN${pn} ${c.material === "aisi304" ? "AISI304" : "СТ20"}`;
  const find = (kind: ComponentKind, dn: number | null, pn: number) => catalog.components.find(v => v.kind === kind && v.dn === dn && v.material === c.material && (v.pn === pn || ((kind === "nipple" || kind === "plug") && v.pn === null)));
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
  const lengthMm = collectorLength(c);
  const main = dimensions(add("collector-pipe", "pipe", c.dn, c.pn, lengthMm / 1000), label("pipe", c.dn, c.pn));
  const flanges = (role: string, dn: number | null, pn: number, count: number, outer: number | null | undefined) => {
    for (const kind of flangeKinds(c.material, dn ?? 0, pn)) add(`${role}-${kind}`, kind, dn, pn, count);
    weld(role, `${role === "end" ? "Концевые соединения" : role === "branch1" ? "Фланцы / воротники контура 1" : "Фланцы / воротники контура 2"}`, count, 2, outer);
  };
  if (c.connection === "flanged") flanges("end", c.dn, c.pn, 2, main?.outerDiameter);
  const branchLengthsMm: Array<number | null> = [], velocities: Array<number | null> = [];
  activeCircuits(c).forEach((circuit, i) => {
    const count = pumpCount(circuit), bolt = catalog.bolts.find(v => v.dn === circuit.dn && v.pn === circuit.pn);
    if (!bolt || !positive(bolt.length)) warnings.push(`Нет длины болта DN${circuit.dn ?? "?"}/PN${circuit.pn} в таблице калькулятора обвязки`);
    const length = branchLength(main?.outerDiameter ?? null, bolt?.length ?? null);
    branchLengthsMm.push(length);
    const pipe = dimensions(add(`branch${i + 1}-pipe`, "pipe", circuit.dn, circuit.pn, count * (length ?? 0) / 1000), label("pipe", circuit.dn, circuit.pn));
    velocities.push(flowSpeed(positive(circuit.working) && positive(circuit.flow) ? circuit.flow / circuit.working : null, pipe?.innerDiameter ?? null));
    if (circuit.connection === "flanged") flanges(`branch${i + 1}`, circuit.dn, circuit.pn, count, pipe?.outerDiameter);
    weld(`branch${i + 1}-joint`, `Врезка патрубков контура ${i + 1}`, count, 1.4, pipe?.outerDiameter);
  });
  for (const [dn, count] of (c.type === "suction" ? [[15, 1]] : [[15, 2], [20, 1]])) {
    const nipple = add(`instrument${dn}`, "nipple", dn, c.pn, count);
    add(`instrument${dn}-plug`, "plug", dn, c.pn, count);
    // Sgon OD must be supplied by the catalogue/reference, never inferred from nominal DN.
    weld(`instrument${dn}`, `Приварка сгонов DN${dn}`, count, 1, nipple?.outerDiameter);
  }
  const weldLengthMm = welds.reduce((sum, v) => sum + v.lengthMm, 0), weldCost = weldLengthMm / 1000 * rate;
  bom.push({ role: "welding", componentId: null, kind: "welding", name: "Сварочные работы", quantity: weldLengthMm / 1000, unit: "м", unitPrice: rate, cost: weldCost, source: "Тариф конструктора" });
  const subtotal = bom.reduce((sum, v) => sum + (v.cost ?? 0), 0), uniqueWarnings = [...new Set(warnings)];
  return { fingerprint: configurationFingerprint(c), catalogVersion: catalog.version, code: collectorCode(c), complete: !uniqueWarnings.length, warnings: uniqueWarnings, ...flow, lengthMm, branchLengthsMm, velocities: { collector: flowSpeed(flow.flow, main?.innerDiameter ?? null), primary: velocities[0], secondary: velocities[1] ?? null }, bom, welds, weldLengthMm, weldCost, subtotal, price: uniqueWarnings.length ? null : subtotal };
}

import type { BindingCatalog } from "./collector-catalog";

export type FlangeBoringPolicy = { source: string; diametralClearanceMm: number | null; clearanceSource: string | null;
  nominalFit?: { source: string; dn: number; material: "aisi304" | "st20"; pns: number[] } };
export type FlangeBoringRate = { id: string; material: "st20" | "aisi304"; dn: number; pn: number; pricePerPiece: number | null; source: string; warnings: string[] };
export type FlangeBoringOperation = {
  side: "left" | "right"; flangeId: string; dn: number; pn: number | null;
  originalBoreMm: number; baseOuterDiameterMm: number; targetBoreMm: number | null;
  diametralClearanceMm: number | null; radialRemovalMm: number | null;
  quantity: 1; rateId: string | null; unitPrice: number | null; cost: number | null; source: string;
};
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const sourced = (v: string | null | undefined) => Boolean(v?.trim());

/** Tariffs are explicit piece services, not pipe painting/welding rates or guessed machining time. */
export function readFlangeBoringRates(data: BindingCatalog): FlangeBoringRate[] {
  return data.items.filter(item => item.catalogId === "работы").flatMap(item => {
    const value = (label: string) => item.fields.find(field => field.headerPath.at(-1) === label)?.value;
    if (value("Назначение") !== "Расточка фланца") return [];
    const material = value("Материал") === "СТ20" ? "st20" : value("Материал") === "AISI304" ? "aisi304" : null;
    const dn = Number(value("DN")), pn = Number(value("PN"));
    if (!material || !positive(dn) || !positive(pn)) return [];
    const prices = item.prices.filter(price => price.currency === "RUB" && /Цена.*(?:₽|руб).*\/шт\.?/i.test(price.label));
    const source = String(value("Источник тарифа") ?? "");
    const valid = prices.length === 1 && positive(prices[0].amount) && sourced(source);
    return [{ id: item.id, material, dn, pn, pricePerPiece: valid ? prices[0].amount : null, source,
      warnings: valid ? [] : [`Не подтверждён тариф расточки ${item.id}: нужны одна цена в ₽/шт. и источник`] }];
  });
}

export function planFlangeBoring(input: {
  side: "left" | "right"; flangeId: string; dn: number; pn: number | null; material: "st20" | "aisi304";
  originalBoreMm: number | null; baseOuterDiameterMm: number | null; originalSource?: string; baseSource?: string;
}, policy: FlangeBoringPolicy, rates: FlangeBoringRate[]) {
  const warnings: string[] = [], side = input.side === "left" ? "левого" : "правого";
  const assumptions: Array<{ code: "flange-nominal-fit"; message: string; source: string }> = [];
  const result = (operation: FlangeBoringOperation | null) => ({ operation, warnings, assumptions });
  if (!sourced(policy.source)) { warnings.push(`Не подтверждено правило расточки ${side} фланца`); return result(null); }
  if (!positive(input.originalBoreMm) || !positive(input.baseOuterDiameterMm) || !sourced(input.originalSource) || !sourced(input.baseSource)) {
    warnings.push(`Нельзя определить расточку ${side} фланца ${input.flangeId}: нужны исходный диаметр отверстия, наружный диаметр основы и их источники`);
    return result(null);
  }
  const clearance = policy.diametralClearanceMm;
  const confirmedClearance = typeof clearance === "number" && Number.isFinite(clearance) && clearance >= 0 && sourced(policy.clearanceSource);
  // An existing positive fit remains usable until a different clearance is explicitly adopted.
  const target = confirmedClearance ? Number((input.baseOuterDiameterMm + clearance).toFixed(9)) : null;
  const nominal = policy.nominalFit;
  if (!confirmedClearance && nominal?.source.trim() && input.dn === nominal.dn && input.material === nominal.material
    && input.pn !== null && nominal.pns.includes(input.pn) && input.originalBoreMm === input.baseOuterDiameterMm) {
    assumptions.push({ code: "flange-nominal-fit", message: `Номинальная посадка ${side} фланца DN${input.dn} PN${input.pn}: отверстие и основа Ø${input.originalBoreMm} мм. Расточка не включена; фактическую посадку проверить при сборке.`, source: nominal.source });
    return result(null);
  }
  if (target !== null ? input.originalBoreMm >= target : input.originalBoreMm > input.baseOuterDiameterMm) return result(null);
  if (!confirmedClearance) warnings.push(`Расточка ${side} фланца ${input.flangeId} под Ø${input.baseOuterDiameterMm} мм предусмотрена; не заданы диаметральный посадочный зазор и его основание, окончательный диаметр отверстия не определён`);
  const candidates = rates.filter(rate => rate.material === input.material && rate.dn === input.dn && rate.pn === input.pn);
  const rate = candidates.length === 1 ? candidates[0] : null;
  if (!rate) warnings.push(`${candidates.length ? "Неоднозначный" : "Отсутствует"} тариф расточки одного фланца ${input.material === "st20" ? "СТ20" : "AISI304"} DN${input.dn} PN${input.pn}, ₽/шт.`);
  if (rate) warnings.push(...rate.warnings);
  const price = rate && !rate.warnings.length && positive(rate.pricePerPiece) && sourced(rate.source) ? rate.pricePerPiece : null;
  if (rate && price === null && !rate.warnings.length) warnings.push(`Нет достоверной цены или источника расточки: ${rate.id}`);
  return result({ side: input.side, flangeId: input.flangeId, dn: input.dn, pn: input.pn,
    originalBoreMm: input.originalBoreMm, baseOuterDiameterMm: input.baseOuterDiameterMm, targetBoreMm: target,
    diametralClearanceMm: confirmedClearance ? clearance : null,
    radialRemovalMm: target !== null ? Number(((target - input.originalBoreMm) / 2).toFixed(9)) : null,
    quantity: 1, rateId: rate?.id ?? null, unitPrice: price, cost: price,
    source: `${policy.source}; исходное отверстие: ${input.originalSource}; наружный Ø основы: ${input.baseSource}; зазор: ${policy.clearanceSource ?? "не задан"}${rate ? `; тариф: ${rate.source}` : ""}` });
}

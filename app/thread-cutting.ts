import researchedRates from "../data/thread-cutting-prices.json";

export const THREAD_CUTTING_SIZES: Record<number, string> = { 15: '1/2"', 20: '3/4"', 25: '1"', 32: '1 1/4"', 40: '1 1/2"', 50: '2"' };
export type ThreadCuttingRate = {
  id: string;
  material: "st20" | "aisi304";
  dn: number;
  thread: string;
  pricePerEnd: number | null;
  priceKind: "listed" | "from" | "confirmed" | "missing";
  date: string;
  source: string;
  note: string;
};

/** Opt-in import: old published snapshots never acquire new prices implicitly. */
export const researchedThreadCuttingRates = (): ThreadCuttingRate[] => structuredClone(researchedRates) as ThreadCuttingRate[];

export function validateThreadCuttingRates(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length !== 12) return ["Нарезка резьбы: нужны 12 строк DN15–50 для Ст20 и AISI304."];
  const errors: string[] = [], keys = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) { errors.push("Некорректная строка нарезки резьбы."); continue; }
    const r = row as ThreadCuttingRate, key = `${r.material}:${r.dn}`;
    if (!["st20", "aisi304"].includes(r.material) || !Object.hasOwn(THREAD_CUTTING_SIZES, r.dn) || r.thread !== THREAD_CUTTING_SIZES[r.dn] || r.id !== `thread-cutting:${key}` || keys.has(key)) errors.push(`Нарезка резьбы ${key}: неверный размер, ID или повтор строки; максимум 2″.`);
    keys.add(key);
    if (!["listed", "from", "confirmed", "missing"].includes(r.priceKind) || (r.priceKind === "missing" ? r.pricePerEnd !== null : typeof r.pricePerEnd !== "number" || !Number.isFinite(r.pricePerEnd) || r.pricePerEnd <= 0)) errors.push(`Нарезка резьбы ${key}: задайте положительный тариф ₽/конец либо статус «Нет цены» с пустым тарифом.`);
    if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0, 10) !== r.date) errors.push(`Нарезка резьбы ${key}: некорректная дата.`);
    if (typeof r.source !== "string" || !r.source.trim() || typeof r.note !== "string" || !r.note.trim()) errors.push(`Нарезка резьбы ${key}: укажите источник и условия применения.`);
  }
  return [...new Set(errors)];
}

export function threadCuttingQuote(rates: ThreadCuttingRate[] | undefined, material: ThreadCuttingRate["material"], dn: number, ends: number) {
  if (!Number.isInteger(ends) || ends < 1 || ends > 2) throw new Error("Количество резьбовых концов: один или два.");
  const matches = rates?.filter(r => r.material === material && r.dn === dn) ?? [];
  const rate = matches.length === 1 ? matches[0] : undefined;
  if (!rate || !Object.hasOwn(THREAD_CUTTING_SIZES, dn) || rate.thread !== THREAD_CUTTING_SIZES[dn] || rate.priceKind === "missing" || typeof rate.pricePerEnd !== "number" || !Number.isFinite(rate.pricePerEnd) || rate.pricePerEnd <= 0) return { cost: null, estimated: true, rate: null, warning: `Нет однозначного тарифа нарезки резьбы ${material} DN${dn}.` };
  return { cost: rate.pricePerEnd * ends, estimated: rate.priceKind !== "confirmed", rate,
    warning: rate.priceKind === "confirmed" ? null : `${rate.priceKind === "from" ? "Цена от" : "Прайс поставщика"} ${rate.pricePerEnd} ₽/конец; стоимость заказа требует уточнения. ${rate.note}` };
}

import type { AssemblyComponent } from "./suction-catalog";

/** Verified characteristics enrich existing source rows only. No new products,
 * price variants or inferred order codes are created here. */
export const HYDRAULIC_REVIEW_DATE = "2026-10-29";
export const WAV_PASSPORT = "https://www.wester.su/netcat_files/1009/1026/Pasport_WAV_WAO.pdf";
export const PRT_PASSPORT = "https://ekfgroup.com/uploads/products/3C2A0D3C44D40CFE811E8E3DF1E97D8A.pdf";
const tanks: Record<string, { model: string; volume: number; thread: string }> = {
  "мембранный-бак-001-r0004": { model: "WAV 8", volume: 8, thread: "G3/4" },
  "мембранный-бак-001-r0005": { model: "WAV 50", volume: 50, thread: "G1" },
  "мембранный-бак-001-r0006": { model: "WAV 80", volume: 80, thread: "G1" },
  "мембранный-бак-001-r0007": { model: "WAV 100", volume: 100, thread: "G1" },
};
export function withHydraulicProductReview(item: AssemblyComponent): AssemblyComponent {
  const fields: Record<string, string | number> = {};
  const tank = tanks[item.id];
  const name = item.fields.find(f => f.headerPath.at(-1) === "Наименование")?.value;
  if (tank && item.catalogId === "мембранный-бак" && name === `Расширительный мембранный бак (гидроаккумулятор) ${tank.model}, Wester`) {
    Object.assign(fields, { "Объём, л": tank.volume, "Допустимое рабочее давление, бар": 10,
      "Присоединительная резьба": tank.thread, "Исполнение резьбы": "НР",
      "Источник проверки характеристик": `${WAV_PASSPORT}; паспорт Wester WAV/WAO, раздел 2 и таблица размеров. Стандартное исполнение 10 бар.`,
      "Дата проверки характеристик": HYDRAULIC_REVIEW_DATE });
  }
  if (/^кипиа-003-r002[123]$/.test(item.id) && item.family === "Преобразователи давления PRT-100, EKF,") {
    Object.assign(fields, { "Выходной сигнал": "4–20 мА", "Питание, В": "12–30 В DC",
      "Источник проверки характеристик": `${PRT_PASSPORT}; таблица 1. Резьба зависит от артикула (G1/2 или M20×1,5); исходная строка артикул не содержит.`,
      "Дата проверки характеристик": HYDRAULIC_REVIEW_DATE });
    const range = String(item.fields.find(f => f.headerPath.at(-1) === "Давление, МПа")?.value ?? "").replace(",", ".").match(/^0…(0\.6|1\.0|1\.6)$/);
    if (range) fields["Давление перегрузки, бар"] = Number(range[1]) * 10 * 1.5;
  }
  const additions = Object.entries(fields).filter(([label]) => !item.fields.some(f => f.headerPath.at(-1) === label))
    .map(([label, value], index) => ({ column: `HYDRAULIC_REVIEW_${index}`, headerPath: [label], value }));
  return additions.length ? { ...item, fields: [...item.fields, ...additions] } : item;
}

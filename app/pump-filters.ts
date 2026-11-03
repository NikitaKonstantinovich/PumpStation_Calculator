export type PumpFilterRow = { type: string; manufacturer: string; series: string };
export type PumpFilterKey = keyof PumpFilterRow;
export type PumpFilters = Partial<Record<PumpFilterKey, string | readonly string[]>>;
export type PumpFilterValues = Record<PumpFilterKey, readonly string[]>;

export const EMPTY_PUMP_FILTERS: PumpFilterValues = { type: [], manufacturer: [], series: [] };
export const PUMP_TYPE_LABELS: Record<string, string> = {
  vertical_multistage: "Вертикальный многоступенчатый",
  horizontal_multistage: "Горизонтальный многоступенчатый",
  end_suction: "Консольный",
  inline: "Вертикальный in-line",
  submersible: "Погружной канализационный",
  unknown: "Не указан",
};
export const pumpTypeLabel = (type: string) => PUMP_TYPE_LABELS[type] ?? type;

export function matchesPumpFilters(row: PumpFilterRow, filters: PumpFilters = {}) {
  return (["type", "manufacturer", "series"] as const).every(key => {
    const selected = filters[key];
    return !selected?.length || (typeof selected === "string" ? row[key] === selected : selected.includes(row[key]));
  });
}

export function pumpFilterOptions(rows: readonly PumpFilterRow[], filters: PumpFilterValues) {
  const sorted = (values: string[], label = (value: string) => value) => [...new Set(values)].sort((a, b) => label(a).localeCompare(label(b), "ru", { numeric: true }));
  return {
    type: sorted(rows.map(row => row.type), pumpTypeLabel),
    manufacturer: sorted(rows.filter(row => matchesPumpFilters(row, { type: filters.type })).map(row => row.manufacturer)),
    series: sorted(rows.filter(row => matchesPumpFilters(row, { type: filters.type, manufacturer: filters.manufacturer })).map(row => row.series)),
  };
}

export function changePumpFilter(rows: readonly PumpFilterRow[], filters: PumpFilterValues, key: PumpFilterKey, values: readonly string[]): PumpFilterValues {
  const next = { ...filters, [key]: values };
  if (key === "type") {
    const available = pumpFilterOptions(rows, next).manufacturer;
    next.manufacturer = next.manufacturer.filter(value => available.includes(value));
  }
  if (key !== "series") {
    const available = pumpFilterOptions(rows, next).series;
    next.series = next.series.filter(value => available.includes(value));
  }
  return next;
}

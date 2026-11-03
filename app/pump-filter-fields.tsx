"use client";
import { CheckboxFilter } from "./checkbox-filter";
import { changePumpFilter, pumpFilterOptions, pumpTypeLabel, type PumpFilterKey, type PumpFilterRow, type PumpFilterValues } from "./pump-filters";

const fields: Array<{ key: PumpFilterKey; label: string; allLabel: string }> = [
  { key: "type", label: "Тип насоса", allLabel: "Все типы" },
  { key: "manufacturer", label: "Производитель насоса", allLabel: "Все производители" },
  { key: "series", label: "Серия насоса", allLabel: "Все серии" },
];

export function PumpFilterFields({ rows, value, onChange }: { rows: readonly PumpFilterRow[]; value: PumpFilterValues; onChange: (value: PumpFilterValues) => void }) {
  const options = pumpFilterOptions(rows, value);
  return <>{fields.map(({ key, label, allLabel }) => <CheckboxFilter key={key} label={label} allLabel={allLabel}
    options={options[key].map(value => ({ value, label: key === "type" ? pumpTypeLabel(value) : value || "Не указан" }))}
    value={value[key]} onChange={values => onChange(changePumpFilter(rows, value, key, values))}/>)}</>;
}

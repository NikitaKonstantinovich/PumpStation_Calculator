"use client";
import { useEffect, useRef } from "react";
import "./checkbox-filter.css";

export type CheckboxFilterOption = { value: string; label: string };

export function CheckboxFilter({ label, allLabel, options, value, onChange }: {
  label: string; allLabel: string; options: readonly CheckboxFilterOption[]; value: readonly string[]; onChange: (value: string[]) => void;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const summary = value.length === 0 ? allLabel : value.length === 1 ? options.find(option => option.value === value[0])?.label ?? value[0] : `${label}: ${value.length}`;
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current?.open && event.target instanceof Node && !root.current.contains(event.target)) root.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && root.current?.open) {
        root.current.open = false;
        root.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return <details ref={root} className="checkbox-filter">
    <summary aria-label={`${label}: ${summary}`} title={summary}><span>{summary}</span><span aria-hidden="true">⌄</span></summary>
    <div className="checkbox-filter__menu" role="group" aria-label={label}>
      <label className="checkbox-filter__all"><input type="checkbox" checked={!value.length} onChange={() => onChange([])}/><span>{allLabel}</span></label>
      <div className="checkbox-filter__options">{options.map(option => <label key={option.value}>
        <input type="checkbox" checked={value.includes(option.value)} onChange={event => onChange(event.target.checked ? [...value, option.value] : value.filter(selected => selected !== option.value))}/><span>{option.label}</span>
      </label>)}</div>
      {!options.length && <p>Нет доступных значений</p>}
    </div>
  </details>;
}

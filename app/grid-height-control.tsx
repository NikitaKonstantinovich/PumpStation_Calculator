"use client";

import { useState } from "react";

const PRESETS = [1, 2, 3];

function CustomGridHeight({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value).replace(".", ","));
  const [error, setError] = useState("");
  const commit = () => {
    const number = Number(draft.replace(",", "."));
    if (!Number.isFinite(number) || number <= 0) {
      setError("Введите число больше нуля.");
      return;
    }
    setError("");
    setDraft(String(number).replace(".", ","));
    if (number !== value) onChange(number);
  };

  return <form className="grid-height-control__custom" onSubmit={event => { event.preventDefault(); commit(); }}>
    <label className="visually-hidden" htmlFor="grid-height-custom">Высота рабочего пространства, экранов</label>
    <input
      id="grid-height-custom"
      type="text"
      inputMode="decimal"
      value={draft}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? "grid-height-error" : "grid-height-help"}
      onChange={event => {
        if (!/^\d*(?:[.,]\d?)?$/.test(event.target.value)) {
          setError("Не более одного знака после запятой.");
          return;
        }
        setDraft(event.target.value);
        setError("");
      }}
      onBlur={commit}
      title="Число больше нуля, не более одного знака после запятой. Enter — применить."
    />
    <span aria-hidden="true">×</span>
    <span id="grid-height-help" className="visually-hidden">Введите число больше нуля с одним знаком после запятой. Нажмите Enter или перейдите к другому полю, чтобы применить.</span>
    {error && <span className="grid-height-control__error" id="grid-height-error" role="alert">{error}</span>}
  </form>;
}

export function GridHeightControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [custom, setCustom] = useState(!PRESETS.includes(value));
  return <div className="grid-height-control">
    <label htmlFor="grid-height-limit">Ограничение высоты экрана</label>
    <div className="grid-height-control__fields">
      <select id="grid-height-limit" value={custom || !PRESETS.includes(value) ? "custom" : String(value)} onChange={event => {
        const isCustom = event.target.value === "custom";
        setCustom(isCustom);
        if (!isCustom) onChange(Number(event.target.value));
      }}>
        {PRESETS.map(preset => <option key={preset} value={preset}>{preset}×</option>)}
        <option value="custom">Другое</option>
      </select>
      {(custom || !PRESETS.includes(value)) && <CustomGridHeight key={value} value={value} onChange={onChange} />}
    </div>
  </div>;
}

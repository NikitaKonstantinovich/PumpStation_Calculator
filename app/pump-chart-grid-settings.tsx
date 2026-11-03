"use client";
import { defaultChartGridSettings, type ChartAxisSettings, type ChartGridSettings } from "./pump-chart-grid";
import "./pump-chart-grid.css";

export function PumpChartGridSettings({ value, onChange, issues }: { value: ChartGridSettings; onChange: (settings: ChartGridSettings) => void; issues: string[] }) {
  const axes = ([ ["flow", "Ось Q · расход, м³/ч", "Q"], ["head", "Ось H · напор, м", "H"] ] as const).map(([axis, title, symbol]) => <fieldset key={axis}>
    <legend>{title}</legend><div className="pump-chart__grid-fields">{([
      ["min", "Минимум"], ["max", "Максимум"], ["step", "Шаг сетки"],
    ] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="number" aria-label={`${label} ${symbol}`} min={0} step="any" placeholder={key === "min" ? "0" : "Авто"}
      value={value[axis][key] ?? ""} onChange={event => {
        const number = event.target.valueAsNumber;
        const next: ChartAxisSettings = { ...value[axis], [key]: Number.isFinite(number) ? number : key === "min" ? 0 : null };
        onChange({ ...value, [axis]: next });
      }}/></label>)}</div>
  </fieldset>);
  return <details className="pump-chart__settings" data-chart-settings="true"><summary>Настройки сетки и осей</summary>
    <div className="pump-chart__settings-body"><p>Пустые поля максимума и шага — автоматический масштаб.</p>{axes}
      <div className="pump-chart__grid-toggles">{([ ["vertical", "Вертикальная сетка"], ["horizontal", "Горизонтальная сетка"], ["labels", "Подписи делений"] ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={value[key]} onChange={event => onChange({ ...value, [key]: event.target.checked })}/>{label}</label>)}</div>
      <div className="pump-chart__grid-appearance"><label><span>Толщина линий</span><select aria-label="Толщина линий сетки" value={value.width} onChange={event => onChange({ ...value, width: Number(event.target.value) })}>{[0.5,1,1.5,2,3,4,5].map(width => <option key={width} value={width}>{width.toLocaleString("ru-RU")}</option>)}</select></label>
        <label><span>Тип линий</span><select value={value.pattern} onChange={event => onChange({ ...value, pattern: event.target.value as ChartGridSettings["pattern"] })}><option value="solid">Сплошные</option><option value="dashed">Штриховые</option><option value="dotted">Пунктирные</option></select></label>
        <label><span>Цвет сетки</span><input type="color" aria-label="Цвет сетки" disabled={value.color === null} value={value.color ?? "#e4e9ec"} onChange={event => onChange({ ...value, color: event.target.value })}/></label>
      </div><label className="pump-chart__grid-theme"><input type="checkbox" checked={value.color === null} onChange={event => onChange({ ...value, color: event.target.checked ? null : "#e4e9ec" })}/>Цвет по теме приложения</label>
      {issues.length > 0 && <p className="pump-chart__grid-error" role="alert">{issues.join(" ")} Пока используется автоматический масштаб. Исправьте значения перед экспортом.</p>}
      <button className="button" type="button" onClick={() => onChange(defaultChartGridSettings())}>Сбросить настройки</button>
    </div>
  </details>;
}

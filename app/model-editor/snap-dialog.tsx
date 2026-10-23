"use client";
import { useEffect, useRef } from "react";
import { defaultSnaps, snapDefinitions, snapGroups, type SnapSettings } from "./snap-settings";

export function SnapDialog({ open, settings, grid, gridStep, onChange, onGrid, onClose, onPlaneFace, references, onClearReferences }: {
  open: boolean; settings: SnapSettings; grid: boolean; gridStep: number;
  onChange: (s: SnapSettings) => void; onGrid: (enabled: boolean, step: number) => void;
  onClose: () => void; onPlaneFace: () => void; references: number; onClearReferences: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const set = (patch: Partial<SnapSettings>) => onChange({ ...settings, ...patch });
  return <dialog ref={dialog} className="snap-dialog" aria-label="Настройки привязок" onCancel={onClose}>
    <div className="snap-dialog__heading"><b>Настройки привязок</b><button onClick={onClose} aria-label="Закрыть настройки привязок">×</button></div>
    <p>Настройки применяются сразу и сохраняются в проекте. Тип остаётся выбранным, даже если сейчас в сборке нет подходящей геометрии.</p>
    <label><input type="checkbox" checked={settings.enabled} onChange={e => set({ enabled: e.target.checked })}/>Объектные привязки</label>
    <div className="snap-dialog__actions">
      <button onClick={() => set({ types: defaultSnaps().types, enabled: true })}>Рекомендуемые</button>
      <button onClick={() => set({ types: Object.fromEntries(snapDefinitions.map(d => [d.id, !("unavailable" in d)])) as SnapSettings["types"], enabled: true })}>Выбрать все доступные</button>
      <button onClick={() => set({ types: Object.fromEntries(snapDefinitions.map(d => [d.id, false])) as SnapSettings["types"] })}>Снять все</button>
    </div>
    <div className="snap-dialog__options">
      <label>Радиус захвата, px<input type="number" min="4" max="40" value={settings.radius} onChange={e => { if (e.target.value) set({ radius: Math.max(4, Math.min(40, Number(e.target.value))) }); }}/></label>
      {(["markers", "labels", "guides"] as const).map((key, i) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={e => set({ [key]: e.target.checked })}/>{["Маркеры", "Подписи", "Направляющие"][i]}</label>)}
    </div>
    <div className="snap-dialog__groups">{snapGroups.map((name, group) => <fieldset key={name}><legend>{name}</legend>
      {group === 4 && <label title="Привязка к сетке независима от объектных привязок"><input type="checkbox" checked={grid} onChange={e => onGrid(e.target.checked, gridStep)}/><span>Сетка<small>Шаг {gridStep} мм; точная объектная привязка имеет приоритет</small></span></label>}
      {snapDefinitions.filter(d => d.group === group).map(d => <label key={d.id} title={"unavailable" in d ? d.unavailable : d.hint} className={"unavailable" in d ? "is-unavailable" : ""}>
        <input type="checkbox" checked={settings.types[d.id]} disabled={"unavailable" in d} onChange={e => set({ types: { ...settings.types, [d.id]: e.target.checked } })}/>
        <span>{d.label}<small>{"unavailable" in d ? d.unavailable : d.hint}</small></span>
      </label>)}
      {group === 4 && <div className="snap-dialog__options">
        <label>Рабочая плоскость<select value={settings.plane} onChange={e => { const plane = e.target.value as SnapSettings["plane"]; if (plane === "face" && !settings.face) onPlaneFace(); else set({ plane }); }}><option>XY</option><option>XZ</option><option>YZ</option><option value="face">Плоская грань</option></select></label>
        <button onClick={onPlaneFace}>Выбрать грань в сцене</button>
        <label>Полярный шаг<select value={[15, 30, 45, 90].includes(settings.polarStep) ? String(settings.polarStep) : "custom"} onChange={e => set({ polarStep: e.target.value === "custom" ? 10 : Number(e.target.value) })}>{[15, 30, 45, 90].map(n => <option key={n} value={n}>{n}°</option>)}<option value="custom">Другой</option></select></label>
        <label>Угловой шаг, °<input type="number" min="1" max="90" value={settings.polarStep} onChange={e => { if (e.target.value) set({ polarStep: Math.max(1, Math.min(90, Number(e.target.value))) }); }}/></label>
      </div>}
    </fieldset>)}</div>
    <p>Перпендикуляр, касательная и направления: сначала выберите «Опора»; для параллельного направления — также «Ребро». «Две опоры» задают середину ровно двух выбранных точек.</p>
    <p>Сохранённые опорные точки: {references} <button disabled={!references} onClick={onClearReferences}>Удалить опорные точки</button></p>
    <button onClick={onClose}>Готово</button>
  </dialog>;
}

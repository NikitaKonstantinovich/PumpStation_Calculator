"use client";
import { useAppNavigationGuard } from "./app-navigation";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountUser } from "./user-types";
import type { Pump } from "./pump-catalog";
import { MANUAL_PUMP_CURVES, MANUAL_PUMP_FIELDS, MANUAL_PUMP_GROUPS, browserAssetPath, manualPumpDraft, manualPumpStatus, parseManualPump, type ManualPumpDraft, type ManualPumpField, type ManualPumpRecord } from "./manual-pump";
import "./item-entry.css";
import { PumpFileUpload } from "./pump-file-upload";
import { PUMP_FILE_KINDS, pumpFilePathKey, type PumpFileKind, type PumpFileReference } from "./pump-files";

export function ItemEntryPanel({ actor, onBack, onSaved }: { actor: AccountUser; onBack: () => void; onSaved: (pump: Pump) => void }) {
  const [draft, setDraft] = useState<ManualPumpDraft>(() => manualPumpDraft());
  const [selected, setSelected] = useState<ManualPumpRecord | null>(null);
  const [records, setRecords] = useState<ManualPumpRecord[]>([]);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<Partial<Record<PumpFileKind, PumpFileReference>>>({});
  const [uploading, setUploading] = useState<Partial<Record<PumpFileKind, boolean>>>({});
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [listError, setListError] = useState(""), [notice, setNotice] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(manualPumpDraft(selected?.pump));
  const locked = busy || Object.values(uploading).some(Boolean);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/pumps?manage=1", { cache: "no-store", signal }), body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось загрузить записи.");
      if (!signal?.aborted) { setRecords(body.records); setListError(""); }
    } catch (reason) { if (!signal?.aborted) setListError(reason instanceof Error ? reason.message : "Не удалось загрузить записи."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    if (actor.role !== "admin") return;
    const controller = new AbortController(), timer = window.setTimeout(() => void refresh(controller.signal), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [actor.role, refresh]);
  useEffect(() => {
    if (!dirty && !Object.values(uploading).some(Boolean)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uploading]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    return records.filter(({ pump }) => `${pump.manufacturer} ${pump.model} ${pump.series} ${pump.article ?? ""}`.toLocaleLowerCase("ru-RU").includes(needle));
  }, [records, query]);
  useAppNavigationGuard(dirty);
  if (actor.role !== "admin") return <main className="item-entry"><h1>Доступ ограничен</h1><p>Заведение позиций доступно только администратору.</p><button className="button" onClick={onBack}>В рабочее пространство</button></main>;
  const confirmDiscard = () => !dirty || window.confirm("Есть несохранённые данные насоса. Продолжить без сохранения?");
  const open = (record: ManualPumpRecord | null) => {
    if (!confirmDiscard()) return;
    if (locked) return;
    setSelected(record); setDraft(manualPumpDraft(record?.pump)); setFiles(record?.pump.assets?.files ?? {}); setError(""); setNotice("");
  };
  const change = (key: string, value: string | boolean) => { setDraft(current => ({ ...current, [key]: value })); setError(""); setNotice(""); };
  const field = (definition: ManualPumpField) => <label key={definition.key} className={definition.kind === "textarea" ? "item-entry__wide" : undefined}>
    <span>{definition.label}</span>
    {definition.kind === "select" ? <select value={String(draft[definition.key] ?? "")} onChange={event => change(definition.key, event.target.value)}>
      {definition.options?.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select> : definition.kind === "textarea" ? <textarea rows={3} value={String(draft[definition.key] ?? "")} maxLength={definition.maxLength ?? 512} onChange={event => change(definition.key, event.target.value)}/> : <input
      type={definition.kind === "number" ? "number" : "text"} step={definition.kind === "number" ? "any" : undefined} min={definition.min} max={definition.max}
      required={definition.key === "model"} maxLength={definition.maxLength ?? 512} value={String(draft[definition.key] ?? "")}
      onChange={event => change(definition.key, event.target.value)}/>}</label>;
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    if (locked) return;
    try { parseManualPump(draft, selected?.pump.id ?? "preview"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Проверьте заполненные поля."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/pumps", { method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: draft, ...(selected ? { id: selected.pump.id, revision: selected.revision } : {}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось сохранить насос.");
      const record = body.record as ManualPumpRecord;
      setSelected(record); setDraft(manualPumpDraft(record.pump)); setFiles(record.pump.assets?.files ?? {});
      setRecords(current => [record, ...current.filter(item => item.pump.id !== record.pump.id)]);
      onSaved(record.pump);
      setNotice(`Насос «${record.pump.model}» сохранён в базе. ${manualPumpStatus(record.pump)}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить насос."); }
    finally { setBusy(false); }
  };
  const photo = browserAssetPath(String(draft.imagePath ?? ""));
  return <main className="item-entry">
    <header className="item-entry__header"><div><p>Администрирование базы оборудования</p><h1>Заведение позиций</h1><p>Добавляйте оборудование вручную и дополняйте сохранённые записи.</p></div><button className="button" disabled={locked} onClick={() => { if (confirmDiscard()) onBack(); }}>В рабочее пространство</button></header>
    <div className="item-entry__tabs" role="tablist" aria-label="Виды позиций"><button role="tab" id="pump-entry-tab" aria-selected="true" aria-controls="pump-entry-panel">Заведение насоса</button></div>
    <div className="item-entry__layout" role="tabpanel" id="pump-entry-panel" aria-labelledby="pump-entry-tab">
      <aside className="item-entry__saved"><div className="item-entry__saved-heading"><h2>Заведённые насосы <small>{records.length}</small></h2><button className="button" disabled={locked} onClick={() => open(null)}>＋ Новый насос</button></div>
        <label>Поиск записей<input type="search" placeholder="Модель, производитель, серия…" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <button className="item-entry__refresh" disabled={loading || locked} onClick={() => void refresh()}>Обновить список</button>
        {listError && <p role="alert" className="item-entry__error">{listError}</p>}
        {loading && <p role="status">Загрузка записей…</p>}
        {!loading && !listError && !filtered.length && <p>{query ? "Насосы не найдены." : "Вручную заведённых насосов пока нет."}</p>}
        <ul>{filtered.map(record => <li key={record.pump.id}><button disabled={locked} aria-current={selected?.pump.id === record.pump.id ? "true" : undefined} onClick={() => open(record)}><b>{record.pump.model}</b><span>{[record.pump.manufacturer, record.pump.series].filter(Boolean).join(" · ") || "Производитель и серия не указаны"}</span><small>{manualPumpStatus(record.pump)}</small></button></li>)}</ul>
      </aside>
      <form className="item-entry__form" onSubmit={save}>
        <div className="item-entry__form-heading"><h2>{selected ? "Редактирование насоса" : "Новый насос"}</h2><span>{dirty ? "Есть несохранённые данные" : selected ? "Сохранено в базе" : "Новая запись"}</span></div>
        <p>Обязательно только поле «Модель / наименование». Остальные данные можно заполнить позже. Для участия в подборе нужны минимум две точки Q–H.</p>
        <fieldset disabled={busy} className="item-entry__fields">
          {MANUAL_PUMP_GROUPS.map(([group, label]) => group === "main" || group === "files" ? <section key={group} className="item-entry__section"><h3>{label}</h3>
            {group === "files" && <><p>Загрузите файлы кнопкой или перетащите их в соответствующую область. Программа сама сохранит их в нужном каталоге. Затем сохраните запись насоса.</p><div className="item-entry__uploads">{PUMP_FILE_KINDS.map(kind => <PumpFileUpload key={kind} kind={kind} file={files[kind]} legacyPath={String(draft[pumpFilePathKey(kind)] ?? "")} disabled={busy}
              onBusy={value => setUploading(current => ({ ...current, [kind]: value }))} onChange={file => { change(pumpFilePathKey(kind), file?.url ?? ""); setFiles(current => ({ ...current, [kind]: file ?? undefined })); }}/>)}</div></>}
            <div className="item-entry__grid">{MANUAL_PUMP_FIELDS.filter(item => item.group === group && !(group === "files" && item.path)).map(field)}</div>
            {group === "files" && photo && <div className="item-entry__image"><img src={photo} alt="Изображение насоса по указанному пути"/></div>}
          </section> : <details key={group} className="item-entry__section"><summary>{label}</summary><div className="item-entry__grid">{MANUAL_PUMP_FIELDS.filter(item => item.group === group).map(field)}</div></details>)}
          <details className="item-entry__section"><summary>Точки характеристик насоса</summary><p>Одна точка на строку: расход Q, м³/ч и значение через точку с запятой. Десятичный разделитель — точка или запятая. Пустые кривые сохраняются без точек.</p><div className="item-entry__grid">{MANUAL_PUMP_CURVES.map(curve => <label key={curve.key}><span>{curve.label} · {curve.unit}</span><textarea rows={6} value={String(draft[curve.key])} placeholder={curve.example} onChange={event => change(curve.key, event.target.value)}/></label>)}</div></details>
          <div className="item-entry__toggles"><label><input type="checkbox" checked={draft.active === true} onChange={event => change("active", event.target.checked)}/>Активная позиция</label><label><input type="checkbox" checked={draft.selectable === true} onChange={event => change("selectable", event.target.checked)}/>Разрешить подбор при наличии кривой</label></div>
        </fieldset>
        {error && <p role="alert" className="item-entry__error">{error}</p>}{notice && <p role="status" className="item-entry__notice">{notice}</p>}
        <footer className="item-entry__actions"><button className="button button--primary" disabled={locked || !dirty} type="submit">{busy ? "Сохранение…" : selected ? "Сохранить изменения" : "Сохранить насос в базу"}</button><button className="button" disabled={locked} type="button" onClick={() => open(null)}>Новая запись</button></footer>
      </form>
    </div>
  </main>;
}

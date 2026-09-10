"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ProjectConfig } from "./project-config";
import { calculateCollector, collectorFlow, collectorLength, configurationFingerprint, pumpCount, type CollectorCatalog, type CollectorType } from "./collector-calculations";
import { synchronizeCollectors, type CollectorCardState, type CollectorOverrides, type CollectorsEntity, type SavedCollector } from "./collector-project";

const money = (v: number | null | undefined) => v == null ? "—" : `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
const measure = (v: number | null | undefined, unit: string) => v == null ? "—" : `${v.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} ${unit}`;
async function api(url: string, body?: unknown) {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ошибка запроса");
  return data;
}
export function useCollectorDatabase(project: ProjectConfig, setProject: Dispatch<SetStateAction<ProjectConfig>>, enabled: boolean) {
  const [catalog, setCatalog] = useState<CollectorCatalog | null>(null), [catalogError, setCatalogError] = useState("");
  const acceptCatalog = useCallback((catalog: CollectorCatalog) => {
    setCatalog(catalog); setCatalogError("");
    setProject(current => {
      const entity = current.entities["station-collectors"] as CollectorsEntity;
      return synchronizeCollectors({ ...current, entities: { ...current.entities, "station-collectors": { ...entity, suction: { ...entity.suction, currentCatalogVersion: catalog.version }, discharge: { ...entity.discharge, currentCatalogVersion: catalog.version } } } });
    });
  }, [setProject]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api("/api/collectors?catalog=1").then(data => { if (active) acceptCatalog(data.catalog); }).catch(error => { if (active) setCatalogError(error.message); });
    return () => { active = false; };
  }, [enabled, acceptCatalog]);
  const entity = project.entities["station-collectors"] as CollectorsEntity;
  const key = JSON.stringify([project.project.id, ...(["suction", "discharge"] as const).map(type => [type, entity[type].code, entity[type].configuration && configurationFingerprint(entity[type].configuration), entity[type].sourceFingerprint])]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const [, ...entries] = JSON.parse(key) as [string, ...Array<[CollectorType, string | null, string | null]>];
    for (const [type, code, fingerprint] of entries) {
      if (!code) continue;
      const apply = (patch: Partial<CollectorCardState>) => { if (active) setProject(current => {
        const collectors = current.entities["station-collectors"] as CollectorsEntity, state = collectors[type];
        if (current.project.id !== JSON.parse(key)[0] || state.code !== code || !state.configuration || configurationFingerprint(state.configuration) !== fingerprint) return current;
        return synchronizeCollectors({ ...current, entities: { ...current.entities, "station-collectors": { ...collectors, [type]: { ...state, ...(catalog ? { currentCatalogVersion: catalog.version } : {}), ...patch } } } });
      }); };
      api(`/api/collectors?code=${encodeURIComponent(code)}`).then(data => apply({ database: data.collector, databaseStatus: data.collector ? "found" : "missing", databaseError: undefined })).catch(error => apply({ database: null, databaseStatus: "error", databaseError: error.message }));
    }
    return () => { active = false; };
  }, [key, enabled, setProject, catalog]);
  return { catalog, catalogError, setCatalog: acceptCatalog };
}

type Props = { entity: CollectorsEntity; catalog: CollectorCatalog | null; catalogError: string; onCatalog: (catalog: CollectorCatalog) => void; onChange: (type: CollectorType, patch: Partial<CollectorCardState>, expectedFingerprint?: string) => void };
export function CollectorConstructor(props: Props) {
  return <div className="collector-constructor">{(["suction", "discharge"] as const).map(type => <CollectorCard key={type} {...props} type={type} state={props.entity[type]}/>)}</div>;
}
function CollectorCard({ type, state, catalog, catalogError, onCatalog, onChange }: Props & { type: CollectorType; state: CollectorCardState }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const c = state.configuration, recommended = state.recommended;
  if (!c || !recommended) return <article className="collector-card">Подготовка параметров…</article>;
  const fingerprint = configurationFingerprint(c), preview = catalog ? calculateCollector(c, catalog) : null;
  const stale = state.status === "stale" || Boolean(state.calculation && catalog && state.calculation.catalogVersion !== catalog.version);
  const calculation = !stale && state.calculation?.fingerprint === fingerprint ? state.calculation : null;
  const saved = state.databaseStatus === "found" && state.database?.code === state.code ? state.database : null;
  const values = preview ?? calculation;
  const pricedCalculation = calculation ?? (saved ? preview : null);
  const patch = (value: Partial<CollectorCardState>) => onChange(type, value);
  const override = (key: keyof CollectorOverrides, value: number | string | undefined) => { const overrides = { ...state.overrides, [key]: value }; if (value === undefined) delete overrides[key]; patch({ overrides }); };
  const dnControl = (label: string, key: "dn" | "primaryDn" | "secondaryDn", value: number | null, source: number | null) => <label className="collector-field"><span>{label}</span><input type="number" min="15" max="1200" step="1" value={value ?? ""} onChange={e => override(key, e.target.value ? Number(e.target.value) : 0)}/><small>Из расчёта DN: {source ?? "не задано"}{state.overrides[key] !== undefined ? " · Вручную" : " · Автоматически"}</small>{state.overrides[key] !== undefined && <button className="collector-reset" onClick={() => override(key, undefined)}>Вернуть значение из расчёта DN</button>}</label>;
  const connectionControl = (label: string, key: "connection" | "primaryConnection" | "secondaryConnection", value: string, dn: number | null) => <label className="collector-field"><span>{label}</span><select value={value} onChange={e => override(key, e.target.value)}><option value="flanged">Фланцевое</option><option value="threaded" disabled={!dn || dn > 50}>Резьбовое · до 2&quot;</option></select>{state.overrides[key] !== undefined && <button className="collector-reset" onClick={() => override(key, undefined)}>Вернуть из расчёта DN</button>}</label>;
  const run = async (action: "calculate" | "create" | "refresh" | "lookup") => {
    setBusy(true); setMessage("");
    try {
      if (action === "lookup") {
        const data = await api(`/api/collectors?code=${encodeURIComponent(state.code!)}`);
        onChange(type, { database: data.collector, databaseStatus: data.collector ? "found" : "missing", databaseError: undefined }, fingerprint);
      } else {
        const data = await api("/api/collectors", { action, configuration: c, code: state.code });
        if (data.catalog) onCatalog(data.catalog);
        if (action === "calculate") onChange(type, { calculation: data.calculation, calculationSourceFingerprint: state.sourceFingerprint, currentCatalogVersion: data.calculation.catalogVersion, status: data.calculation.complete ? "complete" : "incomplete" }, fingerprint);
        else {
          const collector = data.collector as SavedCollector;
          onChange(type, { database: collector, databaseStatus: "found", databaseError: undefined, calculation: collector.calculation, calculationSourceFingerprint: state.sourceFingerprint, currentCatalogVersion: collector.calculation.catalogVersion, status: "complete" }, fingerprint);
          setMessage(action === "create" ? "Коллектор сохранён в базе" : "Цена и состав обновлены");
        }
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось выполнить действие"); }
    finally { setBusy(false); }
  };
  return <article className="collector-card" aria-label={type === "suction" ? "Всасывающий коллектор" : "Напорный коллектор"}>
    <header><h2>{type === "suction" ? "Всасывающий коллектор" : "Напорный коллектор"}</h2><code>{state.code ?? "Заполните параметры для формирования кода"}</code><p className={saved ? "collector-success" : "collector-warning"}>{saved ? "Есть в базе" : state.databaseStatus === "error" ? state.databaseError : state.databaseStatus === "unchecked" && state.code ? "Проверка базы…" : "Коллектор отсутствует в базе — выполните расчёт в конструкторе"}</p></header>
    <p className="collector-mode">{collectorFlow(c).mode}</p>
    <div className="collector-fields">
      {dnControl("DN коллектора", "dn", c.dn, recommended.dn)}
      {connectionControl("Подключение к сети", "connection", c.connection, c.dn)}
      <label className="collector-field"><span>PN коллектора</span><select value={c.pn} onChange={e => override("pn", Number(e.target.value))}>{[10,16,25].map(pn => <option key={pn} value={pn}>PN{pn}</option>)}</select><small>Из расчёта DN: PN{recommended.pn}</small>{state.overrides.pn !== undefined && <button className="collector-reset" onClick={() => override("pn", undefined)}>Вернуть из расчёта DN</button>}</label>
      <label className="collector-field"><span>Материал</span><select value={c.material} onChange={e => override("material", e.target.value)}><option value="aisi304">AISI304</option><option value="st20">СТ20</option></select><small>Из расчёта DN: {recommended.material === "aisi304" ? "AISI304" : "СТ20"}</small>{state.overrides.material && <button className="collector-reset" onClick={() => override("material", undefined)}>Вернуть из расчёта DN</button>}</label>
    </div>
    {type === "suction" && <label className="collector-checkbox"><input type="checkbox" checked={c.eccentric} onChange={e => patch({ eccentric: e.target.checked })}/>Эксцентрическое исполнение</label>}
    {[c.primary, ...(c.secondary ? [c.secondary] : [])].map((circuit, i) => <section key={i} className="collector-circuit"><h3>Контур {i + 1}</h3><p>DN коллектора этого контура из расчёта DN: {(type === "suction" ? (i ? state.dnSource?.secondarySuctionCollectorDn : state.dnSource?.suctionCollectorDn) : (i ? state.dnSource?.secondaryDischargeCollectorDn : state.dnSource?.dischargeCollectorDn)) ?? "автоподбор"}</p><p>{circuit.pumpModel ?? circuit.pumpId ?? "Модель насоса не выбрана"}</p><p>{circuit.working ?? "—"} рабочих + {circuit.reserve ?? "—"} резервных · {pumpCount(circuit)} патрубков · PN{circuit.pn} · {measure(circuit.flow, "м³/ч")}</p><div className="collector-fields">
      {dnControl("DN патрубков", i ? "secondaryDn" : "primaryDn", circuit.dn, (i ? recommended.secondary : recommended.primary)?.dn ?? null)}
      {connectionControl("Присоединение к насосам", i ? "secondaryConnection" : "primaryConnection", circuit.connection, circuit.dn)}
      <label className="collector-field"><span>Межосевое расстояние, мм</span><input type="number" min="1" max="100000" value={circuit.spacing} onChange={e => patch(i ? { spacing2: Number(e.target.value) } : { spacing1: Number(e.target.value) })}/></label>
      {i === 1 && <label className="collector-field"><span>PN контура 2</span><select value={circuit.pn} onChange={e => override("secondaryPn", Number(e.target.value))}>{[10,16,25].map(pn => <option key={pn} value={pn}>PN{pn}</option>)}</select><small>Из расчёта DN: PN{recommended.secondary?.pn}</small>{state.overrides.secondaryPn && <button className="collector-reset" onClick={() => override("secondaryPn", undefined)}>Вернуть из расчёта DN</button>}</label>}
    </div><p>Длина патрубка: {measure(values?.branchLengthsMm[i], "мм")} · скорость: {measure(i ? values?.velocities.secondary : values?.velocities.primary, "м/с")}</p></section>)}
    <dl className="collector-metrics"><div><dt>Расчётный расход</dt><dd>{measure(collectorFlow(c).flow, "м³/ч")}</dd></div><div><dt>Длина коллектора</dt><dd>{measure(collectorLength(c), "мм")}</dd></div><div><dt>Скорость в коллекторе</dt><dd>{measure(values?.velocities.collector, "м/с")}</dd></div></dl>
    <p className="collector-note">Длина патрубка = 0,5 × наружный Ø коллектора + 1,1 × длина болта из таблицы обвязки. Крепёж учитывается отдельно в общей спецификации.</p>
    {(catalogError || stale) && <p className="collector-warning">{catalogError || "Расчёт устарел — выполните повторный расчёт"}</p>}
    {!!values?.warnings.length && <div className="collector-warning"><b>Расчёт неполный</b><ul>{values.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
    <details open><summary>Текущий состав</summary>{values && <BomTable items={values.bom}/>}</details>
    <details><summary>Сварные швы · {measure(values?.weldLengthMm, "мм")} · {money(values?.weldCost)}</summary><div className="collector-table-wrap"><table><thead><tr><th>Операция</th><th>Кол-во</th><th>Шов, мм</th><th>Цена</th></tr></thead><tbody>{values?.welds.map(weld => <tr key={weld.role}><td>{weld.name}</td><td>{weld.count}</td><td>{measure(weld.lengthMm, "")}</td><td>{money(weld.cost)}</td></tr>)}</tbody></table></div><p>Тариф: {money(c.material === "aisi304" ? 5000 : 2400)} / м</p></details>
    {saved && <details><summary>Сохранённый состав · {new Date(saved.priceUpdatedAt).toLocaleString("ru-RU")}</summary><p>PN коллектора: {saved.configuration.pn} · PN патрубков: {saved.configuration.primary.pn}{saved.configuration.secondary ? ` / ${saved.configuration.secondary.pn}` : ""}</p><BomTable items={saved.calculation.bom}/></details>}
    <dl className="collector-prices"><div><dt>Цена из базы</dt><dd>{money(saved?.price)}</dd></div><div><dt>{pricedCalculation?.complete ? "Текущая расчётная цена" : "Расчёт неполный · промежуточная сумма"}</dt><dd>{money(pricedCalculation?.complete ? pricedCalculation.price : pricedCalculation?.subtotal)}</dd></div><div><dt>Разница с базой</dt><dd>{money(saved && pricedCalculation?.price != null ? pricedCalculation.price - saved.price : null)}</dd></div></dl>
    <div className="collector-actions"><button className="button button--primary" disabled={busy || !state.code} onClick={() => void run("calculate")}>Рассчитать</button><button className="button" disabled={busy || !state.code} onClick={() => void run("lookup")}>Проверить базу</button>{saved ? <button className="button" disabled={busy} onClick={() => void run("refresh")}>Обновить цену в базе</button> : <button className="button" disabled={busy || !calculation?.complete || stale || state.databaseStatus !== "missing"} onClick={() => void run("create")}>Создать позицию в базе</button>}</div>
    <p role="status">{busy ? "Выполняется расчёт…" : message}</p>
  </article>;
}
function BomTable({ items }: { items: NonNullable<CollectorCardState["calculation"]>["bom"] }) {
  return <div className="collector-table-wrap"><table><thead><tr><th>Компонент</th><th>Количество</th><th>Цена за ед.</th><th>Сумма</th></tr></thead><tbody>{items.map(item => <tr key={item.role}><td>{item.name}<small>{item.source}</small></td><td>{measure(item.quantity, item.unit)}</td><td>{money(item.unitPrice)}</td><td>{money(item.cost)}</td></tr>)}</tbody></table></div>;
}

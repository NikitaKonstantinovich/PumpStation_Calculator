"use client";

import { useEffect, useRef, useState } from "react";
import { CollectorConstructor } from "../collector-constructor";
import { configurationFingerprint, type CollectorCatalog, type CollectorType } from "../collector-calculations";
import type { CollectorCardState, CollectorsEntity } from "../collector-project";
import type { SettingsEntity } from "../project-config";
import { pressureChecksEnabled } from "../pressure-check-policy";
import type { ParameterWrite, View } from "./schema";
import type { CollectorViewData } from "./collector-nodes";

type Props = { view: View; disabled: boolean; change: (key: string, value: unknown) => void; writes?: (values: ParameterWrite[]) => void };
export function CollectorNodeView({ view, disabled, change, writes }: Props) {
  const data = (view as View & { collector?: CollectorViewData }).collector;
  const [catalogNotice, setCatalogNotice] = useState("");
  const binding = data?.stateBinding;
  const blocked = disabled || !binding || !binding.active || !binding.editable || binding.mode !== "user";
  const latest = useRef({ data, blocked, change, writes });
  useEffect(() => { latest.current = { data, blocked, change, writes }; }, [data, blocked, change, writes]);
  const lookupKey = JSON.stringify(data ? [blocked, data.commands.actions.includes("lookup"), ...(["suction", "discharge"] as const).map(type => { const state = data.result.entity[type]; return [type, state.code, state.configuration && configurationFingerprint(state.configuration), state.databaseStatus]; })] : null);
  function update(type: CollectorType, patch: Partial<CollectorCardState>, expected?: string) {
    const current = latest.current, d = current.data, b = d?.stateBinding;
    if (current.blocked || !d || !b) return;
    const state = d.result.entity[type];
    if (expected && (!state.configuration || configurationFingerprint(state.configuration) !== expected)) return;
    const value: CollectorsEntity = { ...d.result.entity, [type]: { ...state, ...patch } };
    latest.current = { ...current, data: { ...d, result: { ...d.result, entity: value } } };
    if (current.writes) current.writes([{ binding: b, value }]); else current.change(b.key, value);
  }
  useEffect(() => {
    const d = latest.current.data;
    if (!d || latest.current.blocked || !d.commands.actions.includes("lookup")) return;
    const controller = new AbortController();
    for (const type of ["suction", "discharge"] as const) {
      const state = d.result.entity[type];
      if (!state.code || !state.configuration || state.databaseStatus !== "unchecked") continue;
      const fingerprint = configurationFingerprint(state.configuration);
      fetch(`/api/collectors?code=${encodeURIComponent(state.code)}&configuration=${encodeURIComponent(JSON.stringify(state.configuration))}`, { cache: "no-store", signal: controller.signal })
        .then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error ?? "Не удалось проверить базу коллекторов"); return body; })
        .then(body => { if (!controller.signal.aborted) update(type, { database: body.collector, databaseStatus: body.collector ? "found" : "missing", databaseError: undefined }, fingerprint); })
        .catch(error => { if (!controller.signal.aborted) update(type, { database: null, databaseStatus: "error", databaseError: error instanceof Error ? error.message : String(error) }, fingerprint); });
    }
    return () => controller.abort();
  }, [lookupKey]);
  if (!data?.result.project) return <p role="status">{data?.result.issues.map(issue => issue.message).join(" · ") || "Подключите результат расчёта DN"}</p>;
  const settings = data.result.project.entities["station-settings"] as SettingsEntity;
  const acceptCatalog = (catalog: CollectorCatalog) => {
    if (catalog.version !== data.result.catalog?.version) setCatalogNotice("Справочник коллекторов изменился. Обновите справочники инструмента, затем проверьте расчёт: используется закреплённая версия.");
  };
  const confirmCalculation = (type: CollectorType, state: CollectorCardState, fingerprint: string) => {
    const calculation = latest.current.data?.calculations[type];
    if (!calculation || calculation.fingerprint !== fingerprint || calculation.catalogVersion !== latest.current.data?.result.catalog?.version) throw Error("Подключите актуальную ноду расчёта состава и стоимости коллекторов.");
    update(type, { calculation, calculationSourceFingerprint: state.sourceFingerprint, currentCatalogVersion: calculation.catalogVersion, status: calculation.complete ? "complete" : "incomplete" }, fingerprint);
  };
  return <section className="nt-collector-constructor" aria-label="Конструктор коллекторов">
    {catalogNotice && <p role="status" className="collector-warning">{catalogNotice}</p>}
    {!data.commands.actions.length && <p className="collector-note">Действия с базой не подключены в нодовом редакторе.</p>}
    <fieldset disabled={blocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} aria-label="Настройки и действия конструктора коллекторов">
      <CollectorConstructor canCustomize={data.canCustomize} pressureChecksEnabled={pressureChecksEnabled(settings)}
        entity={data.result.entity} inletHead={settings.inletHead} catalog={data.result.catalog}
        catalogError={data.result.catalog ? "" : "Справочник комплектующих коллекторов не загружен"}
        previewByType={data.calculations} allowedActions={data.commands.actions} onCalculate={confirmCalculation} onCatalog={acceptCatalog} onChange={update}/>
    </fieldset>
  </section>;
}

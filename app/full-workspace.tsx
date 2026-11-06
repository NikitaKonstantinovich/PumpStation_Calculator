"use client";
import "./engineering/native-server";
import {getCircuitDnConfig,refreshSuctionSpecification} from "./station-hydraulic-calculation";
import {EngineeringEditor} from "./engineering/editor";
import {loadProgram} from "./engineering/client";
import {currentPublication,INITIAL_VERSION,setBrowserPublication} from "./engineering/runtime";
import {calculationMethod} from "./project-config";
import {ProjectSession,projectApi,type ProjectCard,type ProjectFile} from "./project-session";
import {mergeProjectChanges} from "./project-merge";
import {ProjectHistory} from "./project-history";
import { SpecificationHydraulicOption } from "./specification-hydraulic-options";
import { SpecificationInsertion } from "./specification-insertions";
import { AllowedPumpPanel, downloadBlob, loadComponentsDatabase, loadedComponentsDatabase, resetComponentsDatabase } from "./allowed-pump-tools";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FloatingPanel, GridWorkspace, Icon } from "./workspace-panels";
import { ModelTool } from "./model-editor/tool";
import { CadExportMenu } from "./cad-export-menu";
import { CadProvider } from "./cad-build-state";
import Link from "next/link";
import { AppSettings } from "./app-settings";
import { useTheme } from "./use-theme";
import { GridHeightControl } from "./grid-height-control";
import { CircuitInputFields } from "./circuit-input-fields";
import { createProject, DEFAULT_PANELS, projectFilename, withUpdatedTimestamp, type CollectorMaterial, type DnEntity, type InputEntity, type PanelKind, type PanelState, type ProjectConfig, type ProjectEntity, type SettingsEntity, type ShutoffValveType, type SpecEntity, type SpecItem, type SpecSection, type ValveConnection, type ValvePn, type WorkspaceGrid, type WorkspaceMode } from "./project-config";
import { CalculationToggle, PressureCheckToggle } from "./pressure-check-toggle";
import { canUseGeometry } from "./user-types";
import { pressureChecksEnabled } from "./pressure-check-policy";
import { CollectorConstructor, useCollectorDatabase } from "./collector-constructor";
import { synchronizeCollectors, type CollectorsEntity } from "./collector-project";
import { replaceSpecificationRole } from "./specification-items";
import { specificationItemPresentation, specificationIssueId, specificationSection, visibleSpecificationItems } from "./specification-presentation";
import { specificationExportRows, specificationExportBlob, type SpecificationExportFormat } from "./specification-export";
import { PANEL_INFO, ENTITY_BY_TOOL } from "./tool-registry";
import { collectProjectIssues, openIssueInFirstPanel, type ToolIssue } from "./diagnostics";
import { DiagnosticSurface, DiagnosticsProvider, IssuesTool, IssueNotice, IssueMessages, IssueNavigationMessage, useDiagnosticRegistry } from "./diagnostics-ui";
import { configurationFingerprint } from "./collector-calculations";
import { STANDARD_DN, dnVelocityLimit, flowVelocity, recommendedDn, defaultCollectorMaterial } from "./dn-defaults";
import { AccountScreen } from "./account-ui";
import { BaseValuesPanel } from "./base-values-panel";
import { ItemEntryPanel } from "./item-entry-panel";
import { EquipmentAdminPanel } from "./equipment-admin-panel";
import { loadPumpCatalog, mergePumpCatalog } from "./pump-catalog-client";
import { HelpCenter } from "./help-center";
import { AIAssistant } from "./ai-assistant";
import { BaseValuesUpdateNotice, fetchPublishedBaseValues, usePublishedBaseValues } from "./base-values-update";
import { UsersPanel } from "./users-panel";
import { ComponentCalculator } from "./component-calculator";
import { canEditAllSettings, canEditProjectOptions, type AccountUser, type UserRole } from "./user-types";
import { canEditSetting, parseAccessibleProject, projectAccessError } from "./project-access";
import { CabinetConfigurator, type SmartCabinet } from "./cabinet-configurator";
import { PumpNozzleFields } from "./pump-nozzle-fields";
import { suctionFingerprint } from "./suction-spec";
import { dischargeFingerprint } from "./discharge-spec";
import type { Pump } from "./pump-catalog";
import { smartCabinetSpecificationPrice, type ControlCabinet } from "./control-cabinet-selection";
import { synchronizeStationSpecification, cabinetSourceFingerprint } from "./station-specification";
import { repairSavedInstrumentSpecification } from "./saved-instrument-specification";
import { refreshSavedSpecificationInsertions } from "./saved-insertion-specification";
import { assessSpecification, specificationHasPrice, specificationLineTotal } from "./specification-readiness";

const isSecondaryEnabled = (settings: SettingsEntity) => settings.stationType === "combined" || (settings.stationType === "fire" && settings.jockeyPump);
const SPEC_GROUPS: Array<{ title: string; sections: Array<{ id: SpecSection; title?: string }> }> = [
  { title: "Насосы", sections: [{ id: "pump" }] },
  { title: "Шкаф управления", sections: [{ id: "control" }] },
  { title: "Рама", sections: [{ id: "frame" }] },
  { title: "Сборочный комплект гидравлики", sections: [{ id: "suction", title: "Всасывающая линия" }, { id: "discharge", title: "Напорная линия" }] },
  { title: "Сборочный комплект электрики", sections: [{ id: "electrical" }] },
];

// Sketch mappings are kept separately so source/legacy coverage can be verified.
function InstallationSettings({ role, settings, input, secondaryInput, onInputChange, onSecondaryInputChange, onChange }: { role: UserRole; settings: SettingsEntity; input: InputEntity; secondaryInput: InputEntity; onInputChange: (patch: Partial<InputEntity>) => void; onSecondaryInputChange: (patch: Partial<InputEntity>) => void; onChange: (patch: Partial<SettingsEntity>) => void }) {
  const fullAccess = canEditAllSettings(role), optionsAccess = canEditProjectOptions(role);
  const isFireRelated = settings.stationType === "fire" || settings.stationType === "combined";
  const changeType = (stationType: SettingsEntity["stationType"]) => onChange({ stationType, combinedCircuitsSimultaneous: stationType === "combined" ? settings.combinedCircuitsSimultaneous : false, isolatingValves: stationType === "fire" || stationType === "combined" ? settings.isolatingValves : false, jockeyPump: stationType === "fire" ? settings.jockeyPump : false });
  const numberValue = (value:string,fallback:number,min:number,max:number) => { const parsed=Number(value.replace(",",".")); return Number.isFinite(parsed)?Math.min(max,Math.max(min,parsed)):fallback; };
  const toggle = (key: keyof Pick<SettingsEntity, "combinedCircuitsSimultaneous" | "membraneTank" | "vibrationCompensators" | "collectorPlugs" | "isolatingValves" | "jockeyPump">, label: string, disabled = false, description?: string) => <label className={`settings-form__option ${disabled ? "settings-form__option--disabled" : ""}`}><span><b>{label}</b>{(description || disabled) && <small>{description ?? "Недоступно для выбранного типа"}</small>}</span><input type="checkbox" checked={Boolean(settings[key])} disabled={disabled} onChange={event=>onChange({ [key]: event.target.checked })}/><i aria-hidden="true"/></label>;
  return <div className="settings-form">
    {!fullAccess && <p className="access-note">{role === "base" ? "base: стандартное исполнение. Опции доступны с plus; все настройки — с pro." : "plus: доступны опции проекта. Остальные настройки — с pro."}</p>}
    <label className="settings-form__field"><span>Тип насосной установки</span><select disabled={!fullAccess} value={settings.stationType} onChange={event=>changeType(event.target.value as SettingsEntity["stationType"])}><option value="utility">Хоз-пит</option><option value="fire">Пожаротушение</option><option value="combined">Совмещённая</option><option value="smart">SMART</option></select></label>
    <section aria-label="Параметры контура 1"><div className="settings-form__heading"><b>Контур 1</b><small>Параметры подбора насосов</small></div><CircuitInputFields input={input} onChange={onInputChange} showStaticHead={false}/></section>
    {isSecondaryEnabled(settings)&&<section aria-label="Параметры контура 2"><div className="settings-form__heading"><b>Контур 2</b><small>{settings.stationType==="fire"?"Жокей-насос":"Второй контур подбора"}</small></div><CircuitInputFields input={secondaryInput} onChange={onSecondaryInputChange} showStaticHead={false}/></section>}
    <fieldset className="access-fields" disabled={!fullAccess} aria-label="Расширенные настройки проекта">
    <div className="settings-form__heading"><b>Всасывающий коллектор</b><small>Автоподбор КИП</small></div>
    <label className="settings-form__field"><span>Напор на входе</span><span className="settings-form__number"><input aria-label="Напор на входе" type="number" step="any" placeholder="Не указан" value={settings.inletHead??""} onChange={event=>{const value=event.target.valueAsNumber;onChange({inletHead:Number.isFinite(value)?value:null});}}/><i>м</i></span><small>Максимальный статический напор на уровне приборов. При напоре до 5 м включительно или пустом поле учитывается разрежение. Уставки реле задаются при наладке.</small><IssueNotice id="settings/inlet-head"/></label>
    <div className="settings-form__heading"><b>Курсы валют</b><small>Рублей за единицу валюты</small></div>
    <IssueMessages tool="settings" prefix="settings/rates/"/>
    <div className="settings-form__numbers"><label aria-label="Курс доллара США"><span><b>Доллар США</b><small>USD</small></span><span className="settings-form__number"><input type="number" min="0.01" max="10000" step="0.01" value={settings.usdRate} onChange={event=>onChange({usdRate:numberValue(event.target.value,settings.usdRate,.01,10000)})}/><i>₽</i></span></label><label aria-label="Курс китайского юаня"><span><b>Китайский юань</b><small>CNY</small></span><span className="settings-form__number"><input type="number" min="0.01" max="10000" step="0.01" value={settings.cnyRate} onChange={event=>onChange({cnyRate:numberValue(event.target.value,settings.cnyRate,.01,10000)})}/><i>₽</i></span></label></div>
    <div className="settings-form__heading"><b>Скидки производителей</b><small>Применяются к оборудованию</small></div>
    <IssueMessages tool="settings" prefix="settings/discounts/"/>
    <div className="settings-form__numbers"><label aria-label="Скидка CNP"><span><b>CNP</b><small>Скидка производителя</small></span><span className="settings-form__number"><input type="number" min="0" max="100" step="0.1" value={settings.manufacturerDiscounts.cnp} onChange={event=>onChange({manufacturerDiscounts:{...settings.manufacturerDiscounts,cnp:numberValue(event.target.value,settings.manufacturerDiscounts.cnp,0,100)}})}/><i>%</i></span></label><label aria-label="Скидка Aquastrong"><span><b>Aquastrong</b><small>Скидка производителя</small></span><span className="settings-form__number"><input type="number" min="0" max="100" step="0.1" value={settings.manufacturerDiscounts.aquastrong} onChange={event=>onChange({manufacturerDiscounts:{...settings.manufacturerDiscounts,aquastrong:numberValue(event.target.value,settings.manufacturerDiscounts.aquastrong,0,100)}})}/><i>%</i></span></label></div>
    <div className="settings-form__numbers">{([["onis","ONIS",0],["vandjord","VANDJORD",25],["wellmix","Wellmix",35]] as const).map(([key,label,fallback])=><label key={key} aria-label={`Скидка ${label}`}><span><b>{label}</b><small>Скидка производителя</small></span><span className="settings-form__number"><input type="number" min="0" max="100" step="0.1" value={settings.manufacturerDiscounts[key]??fallback} onChange={event=>onChange({manufacturerDiscounts:{...settings.manufacturerDiscounts,[key]:numberValue(event.target.value,settings.manufacturerDiscounts[key]??fallback,0,100)}})}/><i>%</i></span></label>)}</div>
    </fieldset>
    <fieldset className="access-fields" disabled={!optionsAccess} aria-label="Опции проекта">
    <div className="settings-form__heading"><b>Опции</b><small>Состав автоматически переносится в спецификацию</small></div>
    {settings.stationType === "combined" && <label className="settings-form__nested"><span>Расчёт всасывающего коллектора</span><select value={settings.combinedCircuitsSimultaneous ? "both" : "fire"} onChange={event=>onChange({combinedCircuitsSimultaneous:event.target.value === "both"})}><option value="fire">Только пожарный контур</option><option value="both">Оба контура одновременно</option></select></label>}
    {toggle("membraneTank", "Мембранный бак")}
    {settings.membraneTank && <label className="settings-form__nested"><span>Объём бака</span><select value={settings.membraneTankVolume} onChange={event=>onChange({ membraneTankVolume: Number(event.target.value) as 8|50|80|100 })}><option value={8}>8 л</option><option value={50}>50 л</option><option value={80}>80 л</option><option value={100}>100 л</option></select></label>}
    {toggle("vibrationCompensators", "Виброкомпенсаторы")}
    {toggle("collectorPlugs", "Заглушки на коллектора")}
    {toggle("isolatingValves", "Разделительные затворы на коллекторах", !isFireRelated)}
    {toggle("jockeyPump", "Жокей-насос", settings.stationType !== "fire")}
    </fieldset>
    <div className={`settings-form__secondary ${isSecondaryEnabled(settings) ? "settings-form__secondary--active" : ""}`}><span aria-hidden="true">{isSecondaryEnabled(settings) ? "✓" : "×"}</span><div><b>Второй контур подбора</b><small>{isSecondaryEnabled(settings) ? "Подбор, гидравлическая кривая и карточка насоса 2 доступны" : "Доступен для совмещённой установки или пожаротушения с жокей-насосом"}</small></div></div>
  </div>;
}

function Specification({ project, issues, entity, settings, onDnChange, onSettingsChange }: { project: ProjectConfig; issues: ToolIssue[]; entity: SpecEntity; settings: SettingsEntity; onDnChange?: (patch: Partial<DnEntity>) => void; onSettingsChange?: (patch: Partial<SettingsEntity>) => void }) {
  const warningDialogRef = useRef<HTMLDialogElement>(null);
  const exportMenuRef = useRef<HTMLDetailsElement>(null);
  const exportingRef = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [warning, setWarning] = useState<{name:string;message:string;severity:"error"|"warning"}>({ name: "", message: "", severity:"warning" });
  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !exportMenuRef.current?.contains(event.target)) exportMenuRef.current?.removeAttribute("open");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && exportMenuRef.current?.open) {
        exportMenuRef.current.open = false;
        exportMenuRef.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  const formatMoney = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const sectionFor = specificationSection;
  const visibleItems = visibleSpecificationItems(entity, settings);
  const readiness = assessSpecification(project, visibleItems, issues);
  const knownTotal = readiness.knownTotal;
  const exportSpecification = async (format: SpecificationExportFormat) => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    setExportError("");
    exportMenuRef.current?.removeAttribute("open");
    exportMenuRef.current?.querySelector("summary")?.focus();
    try {
      const rows = specificationExportRows(visibleItems, SPEC_GROUPS, readiness);
      downloadBlob(await specificationExportBlob(rows, format), `Спецификация.${format}`);
    } catch {
      setExportError("Не удалось выгрузить спецификацию. Попробуйте ещё раз.");
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };
  const sectionItems=(sections:SpecSection[])=>visibleItems.filter(item=>sections.includes(sectionFor(item)));
  const subtotal=(items:SpecItem[])=>items.reduce((sum,item)=>sum+specificationLineTotal(item),0);
  const subtotalLabel=(items:SpecItem[])=>`${formatMoney(subtotal(items))} ₽`;
  const sectionSummary=(items:SpecItem[])=><span className="spec-table__section-summary" title="Сумма известных цен представленных позиций; полнота состава указана выше"><i>{items.length} поз.</i><strong>{subtotalLabel(items)}</strong></span>;
  const renderItem = (item: SpecItem) => {
    const hasPrice = specificationHasPrice(item);
    const presentation = specificationItemPresentation(item);
    const cabinetNotFound=sectionFor(item)==="control"&&item.description==="Шкаф управления не найден в базе",cabinetPowerWarning=sectionFor(item)==="control"&&Boolean(item.description?.startsWith("Предупреждение:"));
    const selectionWarning=!cabinetNotFound&&(Boolean(item.technicalStatus&&item.technicalStatus!=="ready")||item.status==="confirmation"||Boolean(item.description?.startsWith("Предупреждение:")));
    return <div data-issue-id={specificationIssueId(item)} className={`spec-table__row spec-table__row--item ${selectionWarning ? "spec-table__row--warning" : item.status === "selected" ? "spec-table__row--selected" : ""} ${cabinetNotFound?"spec-table__row--cabinet-missing":""} ${cabinetPowerWarning?"spec-table__row--cabinet-oversized":""}`} key={`${item.position}-${item.name}`}>
      <span className="spec-table__cell spec-table__cell--position">{item.position}</span>
      <span className="spec-table__cell spec-table__cell--name"><b>{item.name}{presentation.hasWarning&&<button type="button" className={`spec-table__warning spec-table__warning--${presentation.severity} ${selectionWarning?"spec-table__warning--power":""}`} aria-label={`${presentation.severity==="error"?"Ошибка":"Предупреждение"}: ${item.name}`} title="Показать сообщение" onClick={()=>{setWarning({name:item.name,message:presentation.warningText,severity:presentation.severity});warningDialogRef.current?.showModal();}}><i aria-hidden="true">!</i></button>}</b><small>{presentation.details}</small></span>
      <span className="spec-table__cell spec-table__cell--quantity">{item.quantity > 0 ? item.quantity : "—"}</span>
      <span className="spec-table__cell spec-table__cell--unit">{item.unit ?? "шт."}</span>
      <span className={`spec-table__cell spec-table__cell--price ${hasPrice ? "" : "spec-table__cell--empty"}`}>{hasPrice ? formatMoney(item.price!) : ""}</span>
      <span className={`spec-table__cell spec-table__cell--sum ${hasPrice ? "" : "spec-table__cell--empty"}`}>{hasPrice && item.quantity > 0 ? formatMoney(specificationLineTotal(item)) : ""}</span>
      <span className="spec-table__cell spec-table__cell--description">{presentation.description || "—"}</span>
      <SpecificationHydraulicOption item={item} settings={settings} onChange={onSettingsChange}/><SpecificationInsertion item={item} database={loadedComponentsDatabase} designs={(project.entities["station-dn"] as DnEntity).insertionDesigns} onChange={onDnChange}/><IssueNavigationMessage id={specificationIssueId(item)}/>
    </div>;
  };

  return <div className="spec-sheet">
    <dialog ref={warningDialogRef} className={`spec-warning-dialog spec-warning-dialog--${warning.severity}`} aria-label="Ошибки и предупреждения по позиции">
      <header><div><small>{warning.severity==="error"?"ТРЕБУЕТ ИСПРАВЛЕНИЯ":"ТРЕБУЕТ ПРОВЕРКИ"}</small><h2>{warning.name}</h2></div><button type="button" className="icon-button" aria-label="Закрыть сообщение" onClick={()=>warningDialogRef.current?.close()}>×</button></header>
      <p>{warning.message}</p>
      <form method="dialog"><button className="button button--primary">Понятно</button></form>
    </dialog>
    <div className="spec-sheet__summary">
      <IssueMessages tool="spec" prefix="spec/database/"/>
      <span><b>{readiness.ready ? "Спецификация готова" : "Черновик"}</b> · {visibleItems.length} позиций</span>
      <div className="spec-sheet__actions">
        <span className="spec-sheet__total"><small>{readiness.costComplete ? "Полная стоимость состава" : "Известная часть стоимости"}</small><b>{formatMoney(knownTotal)} ₽</b></span>
        <details ref={exportMenuRef} className="chart-export spec-export" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))event.currentTarget.open=false;}}>
          <summary aria-disabled={exporting} aria-busy={exporting} onClick={event=>{if(exporting)event.preventDefault();}}>{exporting?"Выгрузка…":"Выгрузить"} <span aria-hidden="true">⌄</span></summary>
          <div className="chart-export__menu spec-export__menu" aria-label="Форматы выгрузки спецификации">
            <button type="button" disabled={exporting} onClick={()=>void exportSpecification("csv")}>CSV</button>
            <button type="button" disabled={exporting} onClick={()=>void exportSpecification("xlsx")}>XLSX</button>
          </div>
        </details>
      </div>
      {exportError&&<p className="spec-export__error" role="alert">{exportError}</p>}
    </div>
    <div className="spec-sheet__note" data-issue-id="spec/readiness">
      <p>Состав: <b>{readiness.compositionComplete ? "полный" : "не завершён"}</b> · Техническая проверка: <b>{readiness.technicalReady ? "пройдена" : "не завершена"}</b> · Стоимость: <b>{readiness.costComplete ? "полная" : "неполная"}</b>.</p>
      {!readiness.ready && <details><summary>Причины незавершённости ({readiness.findings.length})</summary><ul>{readiness.findings.map(finding => <li key={finding.id} data-issue-id={finding.id}>{finding.message}</li>)}</ul></details>}
    </div>
    <div className="spec-table" role="table" aria-label="Спецификация насосной установки">
      <div className="spec-table__row spec-table__row--head" role="row"><span>№</span><span>Наименование</span><span>Кол-во</span><span>Ед.</span><span>Цена, ₽</span><span>Сумма, ₽</span><span>Описание</span></div>
      {SPEC_GROUPS.map(group => {const groupItems=sectionItems(group.sections.map(section=>section.id));return <div className="spec-table__group" key={group.title}>
        <div className="spec-table__section spec-table__section--main"><b>{group.title}</b>{sectionSummary(groupItems)}</div>
        {group.sections.map(section => {const items=sectionItems([section.id]);return <div className="spec-table__subsection" key={section.id}>
          {section.title && <div className="spec-table__section spec-table__section--sub"><b>{section.title}</b>{sectionSummary(items)}</div>}
          {items.map(renderItem)}
        </div>;})}
      </div>;})}
    </div>
  </div>;
}

function DnCalculator({role,entity,input,secondaryInput,settings,onChange,onAddValves,catalogue}:{catalogue:Pump[];role:UserRole;entity:DnEntity;input:InputEntity;secondaryInput:InputEntity;settings:SettingsEntity;onChange?:(patch:Partial<DnEntity>)=>void;onAddValves?:()=>void}){
  const primary=getCircuitDnConfig(entity,input,settings,false,catalogue.find(p=>p.id===input.selectedPumpId)),secondary=isSecondaryEnabled(settings)?getCircuitDnConfig(entity,secondaryInput,settings,true,catalogue.find(p=>p.id===secondaryInput.selectedPumpId)):null;
  if(!primary)return <div data-issue-id="dn/empty" className="dn-calculator__empty"><span aria-hidden="true">Ø</span><b>Сначала задайте рабочую точку</b><p>Укажите расход станции и количество рабочих насосов в инструменте «Подбор насосов».</p></div>;
  const circuits=[primary,...(secondary?[secondary]:[])];
  const reset=()=>{
    const patch:Partial<DnEntity>={collectorMaterial:defaultCollectorMaterial(settings)};
    for(const circuit of circuits){
      for(const row of circuit.rows)patch[row.field]=row.subtitle==="Расход контура"?recommendedDn(circuit.stationFlow,settings.baseValues?.values.velocity):null;
      patch[circuit.connectionField]=null;patch[circuit.pnField]=16;
      patch[circuit.suctionTypeField]=null;patch[circuit.dischargeTypeField]=null;
    }
    onChange?.(patch);
  };
  const patchField=<K extends keyof DnEntity>(field:K,value:DnEntity[K])=>onChange?.({[field]:value} as Partial<DnEntity>);
  return <div className="dn-calculator">
    <header className="dn-calculator__summary"><div><small>РАСЧЁТ DN И ПОДБОР АРМАТУРЫ</small><b>{secondary?2:1} {secondary?"контура":"контур"} · {settings.stationType==="combined"?"цвет по назначению контура":settings.stationType==="fire"?"приоритет красного исполнения":"приоритет синего исполнения"}</b><span>DN, материал коллекторов, PN, тип соединения и приводы сохраняются в проекте</span></div><div className="dn-calculator__actions"><button className="button" disabled={!canEditAllSettings(role)} onClick={reset}>Заполнить по умолчанию</button><button className="button button--primary" onClick={onAddValves}>Добавить арматуру в спецификацию</button></div></header>
    {!canEditAllSettings(role) && <p className="access-note">Стандартное исполнение подбирается автоматически. Ручные изменения доступны с pro.</p>}
    <fieldset className="access-fields" disabled={!canEditAllSettings(role)} aria-label="Ручные настройки DN">
    <div className="dn-calculator__material"><label><span>Материал коллекторов</span><select value={entity.collectorMaterial??defaultCollectorMaterial(settings)} onChange={event=>onChange?.({collectorMaterial:event.target.value as CollectorMaterial})}><option value="st20">Ст20</option><option value="aisi304">AISI 304</option></select></label><p><b>{settings.stationType==="fire"?"Пожарная НС":"Стандарт проекта"}</b><span>{settings.stationType==="fire"?"По умолчанию применяется Ст20":"По умолчанию применяется AISI 304"}</span></p></div>
    {circuits.map(circuit=><section className="dn-circuit" key={circuit.id}><header className="dn-circuit__header"><div><small>{circuit.id==="secondary"?"ВТОРОЙ КОНТУР":"КОНТУР 1"}</small><b>{circuit.title}</b><span>Q = {circuit.stationFlow.toLocaleString("ru-RU",{maximumFractionDigits:2})} м³/ч · {circuit.workingPumpCount} раб. + {circuit.totalPumpCount-circuit.workingPumpCount} рез.</span></div><i className={circuit.color==="red"?"dn-circuit__color dn-circuit__color--red":"dn-circuit__color dn-circuit__color--blue"}>{circuit.color==="red"?"Красная арматура":"Синяя в приоритете"}</i></header>
      <div className="dn-calculator__controls"><label><span>Соединение арматуры</span><select value={circuit.connection} onChange={event=>{const connection=event.target.value as ValveConnection;onChange?.({[circuit.connectionField]:connection,[circuit.suctionTypeField]:connection==="threaded"?"ball":"butterfly",[circuit.dischargeTypeField]:connection==="threaded"?"ball":"butterfly"} as Partial<DnEntity>);}}><option value="threaded" disabled={!circuit.threadedAllowed}>Резьбовое · до 2″</option><option value="flanged">Фланцевое</option></select><small>{circuit.forcedFlanged?"Для этого типа НС разрешено только фланцевое соединение":circuit.threadedAllowed?"Резьба — стандарт до DN50":"Для выбранного DN требуется фланец"}</small></label><label><span>Рабочее давление</span><select value={circuit.pn} onChange={event=>patchField(circuit.pnField,Number(event.target.value) as ValvePn)}><option value={10}>PN10</option><option value={16}>PN16</option><option value={25}>PN25</option></select></label><label><span>Запорная арматура на всасе</span><select value={circuit.suctionValveType} onChange={event=>patchField(circuit.suctionTypeField,event.target.value as ShutoffValveType)}><option value="butterfly" disabled={circuit.connection==="threaded"}>Затвор дисковый</option><option value="ball">Шаровой кран</option></select></label><label><span>Запорная арматура на напоре</span><select value={circuit.dischargeValveType} onChange={event=>patchField(circuit.dischargeTypeField,event.target.value as ShutoffValveType)}><option value="butterfly" disabled={circuit.connection==="threaded"}>Затвор дисковый</option><option value="ball">Шаровой кран</option></select></label></div>

      <PumpNozzleFields pump={catalogue.find(p=>p.id===(circuit.id==="secondary"?secondaryInput:input).selectedPumpId)} entity={entity} input={circuit.id==="secondary"?secondaryInput:input} secondary={circuit.id==="secondary"} title={circuit.title} onChange={onChange}/>
      <p>Всас: {circuit.suction.connection==="threaded"?"резьбовая арматура":"фланцевая арматура"}. {circuit.suction.locked?"DN крана равен DN патрубка и изменяется вместе с ним.":circuit.suction.nozzleDefault?"Для многоступенчатого насоса DN арматуры по умолчанию равен DN впускного патрубка; доступно ручное изменение.":"DN арматуры и коллекторов рассчитываются отдельно от патрубков насоса."}</p>
      <p>Напор: {circuit.discharge.connection==="threaded"?"резьбовая арматура":"фланцевая арматура"}. {circuit.discharge.locked?"DN крана и обратного клапана равен DN напорного патрубка.":circuit.discharge.nozzleDefault?"Для многоступенчатого насоса DN арматуры по умолчанию равен DN выпускного патрубка; доступно ручное изменение.":"Между обратным клапаном и затвором устанавливается отдельная вставка ФФ."}</p>
      {settings.vibrationCompensators
        ? <p>На каждой стороне насоса: насос → виброкомпенсатор → прямая или переходная вставка → арматура. При изменении DN переходная вставка заменяет прямую. Уплотнения и крепёж учитываются для каждого соединения.</p>
        : <p>Фланцевая арматура крепится прямо к насосу при одинаковых DN или непосредственно к переходу при изменении DN.</p>}
      {circuit.suction.errors.map((error,index)=><p data-issue-id={`dn/${circuit.id}/suction/${index}`} key={error} role="alert" className="dn-calculator__error">{error}</p>)}
      {circuit.discharge.errors.map((error,index)=><p data-issue-id={`dn/${circuit.id}/discharge/${index}`} key={error} role="alert" className="dn-calculator__error">{error}</p>)}
      {circuit.suction.inletPressureCheck && <p data-issue-id={`dn/${circuit.id}/pressure`} className="collector-note">{circuit.suction.inletPressureCheck.message}</p>}
      <div className="dn-calculator__grid">{circuit.rows.map(row=>{const dn=circuit.values[row.field],velocity=flowVelocity(row.flow,dn),limit=dnVelocityLimit(dn,settings.baseValues?.values.velocity),valid=velocity<=limit+1e-9;return <section data-issue-id={`dn/${circuit.id}/${row.field}`} className="dn-calculator__card" key={row.field}><div className="dn-calculator__card-title"><span><b>{row.title}</b><small>{row.subtitle} · {row.flow.toLocaleString("ru-RU",{maximumFractionDigits:2})} м³/ч</small></span><i className={valid?"dn-calculator__status dn-calculator__status--ok":"dn-calculator__status dn-calculator__status--warning"}>{valid?"В пределах":"Выше предела"}</i></div><div className="dn-calculator__values"><label><span>Условный проход</span><select value={dn} disabled={(circuit.suction.locked && /[Ss]uctionValveDn$/.test(row.field)) || (circuit.discharge.locked && /[Dd]ischargeValveDn$/.test(row.field))} onChange={event=>{const next=Number(event.target.value);onChange?.({[row.field]:next} as Partial<DnEntity>);}} aria-label={`Ду: ${circuit.title}, ${row.title}`}>{[15,20,...STANDARD_DN].map(value=><option key={value} value={value}>Ду {value}</option>)}</select></label><span className="dn-calculator__speed"><small>Скорость потока</small><b>{velocity.toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2})} <i>м/с</i></b><em>Допустимо до {limit} м/с</em></span></div></section>;})}</div>
    </section>)}
    {isSecondaryEnabled(settings)&&!secondary&&<div className="dn-calculator__secondary-empty"><b>Контур 2 ожидает рабочую точку</b><span>Заполните «Подбор насосов 2» — DN и арматура появятся автоматически.</span></div>}
    </fieldset>
    <footer className="dn-calculator__note"><span>i</span><p><b>Правила автоподбора</b>{settings.baseValues?.values.velocity.map(r=>`DN${r.fromDn}–${r.toDn??"∞"}: до ${r.limit} м/с`).join("; ")??"До DN250 — 2 м/с, выше — 3 м/с"}. Резьба до DN50 (2″) включительно — по умолчанию для первого контура хоз-пит и SMART и для второго контура. При необходимости можно выбрать фланцевое соединение. Затворы до DN125 подбираются с рукояткой, от DN150 — с редуктором. Обратный клапан подбирается по DN напорной арматуры, PN и материалу коллектора. Шаровой кран — всегда латунный с ручкой-рычагом, независимо от цвета и материала коллектора.</p></footer>
  </div>;
}

function PanelContent({ project, issues, role, assistantPanel, collectorPanel, modelPanel, id, entity, input, secondaryInput, settings, catalogue, onInputChange, onSecondaryInputChange, onSettingsChange, onDnChange, onAddValves, onAddToSpec, onCabinetConfigured, locked }: { project: ProjectConfig; issues: ToolIssue[]; role: UserRole; assistantPanel?: React.ReactNode; collectorPanel?: React.ReactNode; modelPanel?: React.ReactNode; id: PanelKind; entity: ProjectEntity; input: InputEntity; secondaryInput:InputEntity; settings: SettingsEntity; catalogue:Pump[]; onInputChange?: (patch: Partial<InputEntity>) => void; onSecondaryInputChange: (patch: Partial<InputEntity>) => void; onSettingsChange?: (patch: Partial<SettingsEntity>) => void; onDnChange?:(patch:Partial<DnEntity>)=>void; onAddValves?:()=>void; onAddToSpec?:()=>void; onCabinetConfigured?:(cabinet:SmartCabinet)=>void; locked?:boolean }) {
  if (id === "assistant") return assistantPanel;
  if (id === "issues") return <IssuesTool/>;
  if (locked) return <div className="tool-lock"><b>Второй контур заблокирован</b></div>;
  if (id === "input" || id === "input2" || id === "chart" || id === "chart2" || id === "sketch" || id === "sketch2" || id === "components") return <AllowedPumpPanel automaticSpecification id={id} input={input} settings={settings} catalogue={catalogue} onInputChange={onInputChange} onAddToSpec={onAddToSpec}/>;
  if (id === "settings") return <InstallationSettings role={role} settings={settings} input={input} secondaryInput={secondaryInput} onInputChange={patch=>onInputChange?.(patch)} onSecondaryInputChange={onSecondaryInputChange} onChange={patch=>onSettingsChange?.(patch)}/>;
  if (id === "dn") return <DnCalculator catalogue={catalogue} role={role} entity={entity as DnEntity} input={input} secondaryInput={secondaryInput} settings={settings} onChange={onDnChange} onAddValves={onAddValves}/>;
  if (id === "collectors") return collectorPanel;
  if (id === "model") return modelPanel;
  if (id === "spec") return <Specification project={project} issues={issues} entity={entity as SpecEntity} settings={settings} onDnChange={onDnChange} onSettingsChange={onSettingsChange}/>;
  if (id === "cabinet") return <CabinetConfigurator input={input} catalogue={catalogue} onUse={onCabinetConfigured}/>;
  return (
    <div className="model-view"><div className="model-view__stage"><span className="model-view__pipe model-view__pipe--one"/><span className="model-view__pipe model-view__pipe--two"/><span className="model-view__pump model-view__pump--one"/><span className="model-view__pump model-view__pump--two"/><span className="model-view__pump model-view__pump--three"/><b>3D</b></div><div className="model-view__actions"><button>⟳</button><button>⊕</button><button>⌖</button></div></div>
  );
}

type StoredProject=ProjectCard;
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toLocaleUpperCase("ru-RU")).join("")||"ПС";

function ProjectsPage({user,projects,onBack,onOpen,onCreate,onDelete,onLogout}:{user:AccountUser;projects:StoredProject[];onBack:()=>void;onOpen:(project:StoredProject)=>void;onCreate:()=>void;onDelete:(project:StoredProject)=>void;onLogout:()=>void}){
  return <div className="projects-page"><header className="projects-header"><button className="brand brand-button" onClick={onBack}><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></button><div className="projects-header__actions"><span className="save-state">{user.email}</span><button className="avatar" title={user.name}>{initials(user.name)}</button><button className="button" onClick={onLogout}>Выйти</button></div></header><main className="projects-main"><div className="projects-main__title"><div><h1>Мои проекты</h1><p>Откройте сохранённый расчёт и продолжите работу с того же места.</p></div><button className="button button--primary" style={{width:"auto"}} onClick={onCreate}>＋ Новый проект</button></div>{projects.length?<div className="projects-grid">{projects.map(project=><article className="project-card" key={project.id}><span className="project-card__icon">▦</span><h2>{project.name}</h2><p>Изменён {new Date(project.updatedAt).toLocaleString("ru-RU",{dateStyle:"medium",timeStyle:"short"})}</p><p>{project.id}</p><div className="project-card__actions"><button onClick={()=>onOpen(project)}>Открыть проект</button><button onClick={()=>onDelete(project)} aria-label={`Удалить ${project.name}`}>Удалить</button></div></article>)}</div>:<div className="projects-empty"><span>▦</span><b>У вас пока нет сохранённых проектов</b><p>Создайте первый проект, чтобы начать расчёт насосной станции.</p></div>}</main></div>;
}

export default function Home() {
  const [sidebar, setSidebar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme, colorProfile, setColorProfile] = useTheme();
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeSettings = () => { setSettingsOpen(false); requestAnimationFrame(() => menuButton.current?.focus()); };
  const [config, setConfig] = useState<ProjectConfig>(() => createProject("Насосная станция № 24", { id:"PS-NEW", timestamp:"2000-01-01T00:00:00.000Z" }));
  const [activeTab, setActiveTab] = useState("Проект");
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  const ribbonTools = useRef<HTMLDivElement>(null);
  const toggleRibbon = () => {
    if (!ribbonCollapsed) {
      ribbonTools.current?.querySelectorAll("details[open]").forEach(menu => menu.removeAttribute("open"));
    }
    setRibbonCollapsed(collapsed => !collapsed);
  };
  const [detached, setDetached] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("Все изменения сохранены");
  const [account,setAccount]=useState<AccountUser|null>(null);
  const role = account?.role ?? "base";
  const {latest:latestBaseValues,error:baseValuesError}=usePublishedBaseValues(Boolean(account));
  const [bootError,setBootError]=useState("");
  const accessError = account ? projectAccessError(config, role) : null;
  const [accessNotice,setAccessNotice]=useState("");
  const [accountLoading,setAccountLoading]=useState(true);
  const [projects,setProjects]=useState<StoredProject[]>([]);
  const [nextPage,setNextPage]=useState<number|null>(null);
  const [historyVisible,setHistoryVisible]=useState(false);
  const [snapshot,setSnapshot]=useState(false);
  const importMode=useRef<"new"|"replace">("new");
  const libraryVersion=useRef<string|undefined>(undefined);
  const history = useRef<ProjectConfig[]>([]);
  const historyIndex = useRef(-1);
  const [historyState, setHistoryState] = useState({ canUndo:false, canRedo:false });
  const session=useRef<ProjectSession|null>(null);
  const [activeSession,setActiveSession]=useState<ProjectSession|null>(null);
  const [conflicted,setConflicted]=useState(false);
  const activate=useCallback((user:AccountUser,project:ProjectConfig,revision:number,freeze:boolean)=>{
    session.current?.dispose();
    if (freeze && (project.entities["station-spec"] as SpecEntity).items.some(item => item.insertionAssembly)) resetComponentsDatabase();
    if(libraryVersion.current && !project.project.modelLibraryVersion){
      project={...project,project:{...project.project,modelLibraryVersion:libraryVersion.current}};
    }
    const active=new ProjectSession(user.id,project,revision,
      message=>{if(session.current===active){setSaveMessage(message);setConflicted(active.blocked);}},
      card=>setProjects(cards=>[card,...cards.filter(other=>other.id!==card.id)]),
      (next,previous)=>{
        if(session.current!==active)return;
        setConfig(current=>{
          if(current.project.id!==next.project.id)return current;
          const merged=mergeProjectChanges(previous,current,next);
          if(merged.conflicts.length)active.retainConflict(current);
          return merged.conflicts.length?current:merged.config;
        });
        setSnapshot(true);
        // Undo must not roll back changes received from another window.
        history.current=[next];historyIndex.current=0;setHistoryState({canUndo:false,canRedo:false});
      },next=>parseAccessibleProject(next,user.role));
    session.current=active;setActiveSession(active);setConflicted(false); setSnapshot(freeze); setConfig(project);
    history.current=[project];historyIndex.current=0;setHistoryState({canUndo:false,canRedo:false});
    setSaveMessage(revision?"Сохранено на сервере":"Есть изменения");
    return active;
  },[]);
  useEffect(()=>activeSession?.connect(),[activeSession]);
  const [view,setView]=useState<"workspace"|"projects"|"users"|"component-calculator"|"base-values"|"item-entry"|"equipment-admin"|"geometry-nodes"|"help">(()=>{const requested=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("view"):null;return requested==="projects"||requested==="users"||requested==="component-calculator"||requested==="base-values"||requested==="item-entry"||requested==="equipment-admin"||requested==="geometry-nodes"||requested==="help"?requested:"workspace";});
  const [catalogue,setCatalogue] = useState<Pump[]>([]);
  const [controlCabinets,setControlCabinets] = useState<ControlCabinet[]>([]);
  const [smartCabinets,setSmartCabinets] = useState<SmartCabinet[]>([]);
  const synchronizeFullProject = useCallback((project: ProjectConfig, components = loadedComponentsDatabase) => synchronizeStationSpecification(project, {
    pumps: catalogue.length ? catalogue : null, cabinets: controlCabinets.length ? controlCabinets : null,
    smartCabinets: smartCabinets.length ? smartCabinets : null, components,
  }, refreshSuctionSpecification), [catalogue, controlCabinets, smartCabinets]);
  const setAccessibleConfig = useCallback<React.Dispatch<React.SetStateAction<ProjectConfig>>>(change => setConfig(current => {
    const next = typeof change === "function" ? change(current) : change;
    if(projectAccessError(next,role)) return current;
    return snapshot?next:synchronizeFullProject(next);
  }), [role, snapshot, synchronizeFullProject]);
  const [assetErrors,setAssetErrors] = useState<Record<string,string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  const panels = config.workspace.windows;
  const zoom = config.workspace.zoom;
  const workspaceMode=config.workspace.mode;
  const workspaceGrid=config.workspace.grid;
  const gridHeightScreens=config.workspace.gridHeightScreens;
  const inputEntity = config.entities["system-input"] as InputEntity;
  const inputEntity2 = config.entities["system-input-2"] as InputEntity;
  const settingsEntity = config.entities["station-settings"] as SettingsEntity;
  const secondaryEnabled = isSecondaryEnabled(settingsEntity);
  const { catalog: collectorCatalog, catalogError: collectorCatalogError, setCatalog: setCollectorCatalog } = useCollectorDatabase(config, setConfig, Boolean(account) && !snapshot, catalogue);
  const derivedIssues = useMemo(()=>collectProjectIssues(config,catalogue,collectorCatalog,smartCabinets,{...assetErrors,"collectors/catalog":collectorCatalogError}),[config,catalogue,collectorCatalog,smartCabinets,assetErrors,collectorCatalogError]);
  const diagnostics = useDiagnosticRegistry(config,derivedIssues);
  const suctionItems=(config.entities["station-spec"] as SpecEntity).items;
  const suctionSource=JSON.stringify([config.project.id,suctionFingerprint(config),dischargeFingerprint(config),suctionItems.map(item=>[item.equipmentId,item.option,item.assemblyRole])]), suctionEnabled=Boolean(account)&&suctionItems.some(item=>item.section==="suction"||item.section==="discharge"||item.section==="pump");
  useEffect(()=>{
    if(!suctionEnabled)return;
    let active=true;
    const projectId=config.project.id;
    void loadComponentsDatabase().then(database=>{if(active)setConfig(current=>current.project.id!==projectId?current:snapshot?
      repairSavedInstrumentSpecification(refreshSavedSpecificationInsertions(current,database.items),{...database,pumps:catalogue}):synchronizeFullProject(current,database));}).catch(()=>{setSaveMessage("Не удалось обновить комплектацию гидравлических линий");setAssetErrors(current=>({...current,"components/database":"Не удалось обновить комплектацию гидравлических линий"}));});
    return()=>{active=false;};
  },[snapshot,suctionEnabled,suctionSource,synchronizeFullProject,catalogue,config.project.id,activeSession]);

  useEffect(() => {
    const params=new URLSearchParams(window.location.search),panel=params.get("panel"),requestedProject=params.get("project");
    let active=true;
    void (async()=>{
      const response=await fetch("/api/auth",{cache:"no-store"});
      if(!response.ok)throw new Error("Не удалось загрузить учётную запись");
      const {user}=await response.json() as {user:AccountUser};
      if(!active)return;
      setAccount(user);
      const page=await projectApi<{projects:StoredProject[];next:number|null;modelLibraryVersion?:string}>();
      const id=requestedProject??page.projects[0]?.id;
      let file:ProjectFile|undefined;
      if(id) file=await projectApi<ProjectFile>("?id="+encodeURIComponent(id));
      let loaded:ProjectConfig;
      try {
        loaded=file?parseAccessibleProject(file.config,user.role):createProject("Новая насосная станция",{baseValues:await fetchPublishedBaseValues()});
      } catch(error) {
        if(!active)return;
        setAccessNotice("Сохранённый проект оставлен в базе. "+(error instanceof Error?error.message:"Не удалось открыть проект."));
        loaded=createProject("Новая насосная станция",{baseValues:await fetchPublishedBaseValues()});
        file=undefined;
      }
      if(!active)return;
      setProjects(page.projects);setNextPage(page.next);setAccount(user);
      libraryVersion.current=page.modelLibraryVersion;
      const program=await loadProgram(file?(loaded.project.graphVersion??INITIAL_VERSION):undefined);
      if(!active)return;
      setBrowserPublication(program);loaded.project.graphVersion=program.version;
      activate(user,loaded,file?.revision??0,Boolean(file));
      if(!params.has("view") && file){params.set("project",loaded.project.id);window.history.replaceState({},"","/?"+params.toString());}
      if(panel&&loaded.workspace.windows.some(item=>item.id===panel))setDetached(panel);
      hydrated.current=true;
    })().catch(error=>{if(active)setBootError(error instanceof Error?error.message:"Не удалось загрузить проект");}).finally(()=>{if(active)setAccountLoading(false);});
    return ()=>{active=false;};
  }, [activate]);
  useEffect(() => {
    if (!account?.id) return;
    const controller = new AbortController();
    const heartbeat = async () => {
      try {
        const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "heartbeat" }), signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) { setAccount(null); return; }
        if (!response.ok) return;
        const { user } = await response.json() as { user: AccountUser };
        if (!controller.signal.aborted) setAccount(current => current && JSON.stringify(current) === JSON.stringify(user) ? current : user);
      } catch { /* A transient connection failure does not sign the user out. */ }
    };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 30_000);
    const visible = () => { if (document.visibilityState === "visible") void heartbeat(); };
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [account?.id]);
  useEffect(() => {
    const navigate = () => { const requested = new URLSearchParams(window.location.search).get("view"); setView(requested === "projects" || requested === "users" || requested === "component-calculator" || requested === "base-values" || requested === "item-entry" || requested === "equipment-admin" || requested === "geometry-nodes" || requested === "help" ? requested : "workspace"); setSidebar(false); };
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, []);
  useEffect(()=>{loadPumpCatalog().then((data:Pump[])=>{setCatalogue(data);setConfig(current=>{if(session.current?.revision)return current;const entities={...current.entities};for(const id of ["system-input","system-input-2"]){const input=entities[id] as InputEntity,pump=data.find(p=>p.id===input.selectedPumpId);if(pump)entities[id]={...input,selectedPumpModel:`${pump.manufacturer} ${pump.model}`};}return synchronizeCollectors({...current,entities},undefined,data);});}).catch(()=>{setSaveMessage("Не удалось загрузить каталог насосов");setAssetErrors(current=>({...current,"input/database":"Не удалось загрузить каталог насосов","input2/database":"Не удалось загрузить каталог насосов","spec/database/pumps":"Не удалось загрузить каталог насосов"}));});},[]);
  useEffect(()=>{fetch("/control-cabinets.json",{cache:"no-store"}).then(response=>response.ok?response.json():Promise.reject()).then((data:ControlCabinet[])=>setControlCabinets(data)).catch(()=>{setSaveMessage("Не удалось загрузить каталог шкафов управления");setAssetErrors(current=>({...current,"spec/database/cabinets":"Не удалось загрузить каталог шкафов управления"}));});},[]);
  useEffect(()=>{fetch("/control-cabinet-database.json",{cache:"no-store"}).then(response=>response.ok?response.json():Promise.reject()).then((data:{cabinets:SmartCabinet[]})=>setSmartCabinets(data.cabinets)).catch(()=>{setSaveMessage("Не удалось загрузить базу NS Smart");setAssetErrors(current=>({...current,"cabinet/database":"Не удалось загрузить базу NS Smart","spec/database/smart":"Не удалось загрузить базу NS Smart"}));});},[]);
  // A render-time transaction also covers imports, undo and asynchronous catalog/collector updates.
  // React retries this render before committing a mixed configuration to the UI.
  const stationInputs = [config.entities, config.station, synchronizeFullProject] as const;
  const [previousStationInputs, setPreviousStationInputs] = useState(stationInputs);
  if (stationInputs.some((value, index) => value !== previousStationInputs[index])) {
    setPreviousStationInputs(stationInputs);
    if(!snapshot)setConfig(current => synchronizeFullProject(current));
  }
  useEffect(() => {
    if(hydrated.current && account && !accessError && session.current?.latest.project.id===config.project.id)session.current.update(config);
  },[config,account,accessError]);

  const refreshHistoryState = () => setHistoryState({ canUndo:historyIndex.current>0, canRedo:historyIndex.current<history.current.length-1 });
  const updateConfig = (change: (current: ProjectConfig) => ProjectConfig) => setConfig(current => {
    const changed=change(current);
    if(projectAccessError(changed,role))return current;
    const next=withUpdatedTimestamp(snapshot || changed.entities===current.entities&&changed.station===current.station?changed:synchronizeFullProject(changed));
    if (hydrated.current && JSON.stringify(next)!==JSON.stringify(current)) { history.current=history.current.slice(0,historyIndex.current+1); history.current.push(next); historyIndex.current=history.current.length-1; queueMicrotask(refreshHistoryState); }
    return next;
  });
  const undo = () => { if(historyIndex.current<=0)return; historyIndex.current--; setAccessibleConfig(history.current[historyIndex.current]); refreshHistoryState(); };
  const redo = () => { if(historyIndex.current>=history.current.length-1)return; historyIndex.current++; setAccessibleConfig(history.current[historyIndex.current]); refreshHistoryState(); };
  const setPanels = (change: (panels: PanelState[]) => PanelState[]) => updateConfig(current => ({ ...current, workspace: { ...current.workspace, windows: change(current.workspace.windows) } }));
  const setZoom = (change: number | ((zoom: number) => number)) => updateConfig(current => ({ ...current, workspace: { ...current.workspace, zoom: typeof change === "function" ? change(current.workspace.zoom) : change } }));
  const setWorkspaceMode=(mode:WorkspaceMode)=>updateConfig(current=>{if(mode!=="grid")return {...current,workspace:{...current.workspace,mode}};const visible=current.workspace.windows.filter(panel=>!panel.minimized),cells=current.workspace.grid.cells.map(id=>visible.some(panel=>panel.id===id)?id:null),assigned=new Set(cells.filter((id):id is string=>Boolean(id))),remaining=visible.filter(panel=>!assigned.has(panel.id));for(let index=0;index<cells.length&&remaining.length;index++)if(!cells[index]){const panel=remaining.shift()!;cells[index]=panel.id;assigned.add(panel.id);}const windows=current.workspace.windows.map(panel=>!panel.minimized&&!assigned.has(panel.id)?{...panel,minimized:true}:panel);return {...current,workspace:{...current.workspace,mode,grid:{...current.workspace.grid,cells},windows}};});
  const setWorkspaceGrid=(grid:WorkspaceGrid)=>updateConfig(current=>({...current,workspace:{...current.workspace,grid}}));
  const setGridHeightScreens=(gridHeightScreens:number)=>updateConfig(current=>({...current,workspace:{...current.workspace,gridHeightScreens}}));
  const applyGridTemplate=(columns:number,rows:number)=>updateConfig(current=>{const visible=current.workspace.windows.filter(panel=>!panel.minimized),assigned=current.workspace.grid.cells.map(id=>visible.find(panel=>panel.id===id)?.id).filter((id):id is string=>Boolean(id)),remaining=visible.map(panel=>panel.id).filter(id=>!assigned.includes(id)),ids=[...assigned,...remaining],selected=new Set(ids.slice(0,columns*rows)),windows=current.workspace.windows.map(panel=>!panel.minimized&&!selected.has(panel.id)?{...panel,minimized:true}:{...panel,minimized:selected.has(panel.id)?false:panel.minimized});return {...current,workspace:{...current.workspace,mode:"grid",grid:{columns,rows,columnSizes:Array.from({length:columns},()=>1),rowSizes:Array.from({length:rows},()=>1),cells:Array.from({length:columns*rows},(_,index)=>ids[index]??null)},windows}};});
  const addGridColumn=()=>updateConfig(current=>{const grid=current.workspace.grid;if(grid.columns>=6)return current;const columns=grid.columns+1,cells=Array.from({length:grid.rows},(_,row)=>[...grid.cells.slice(row*grid.columns,(row+1)*grid.columns),null]).flat();return {...current,workspace:{...current.workspace,grid:{...grid,columns,columnSizes:[...grid.columnSizes,1],cells}}};});
  const addGridRow=()=>updateConfig(current=>{const grid=current.workspace.grid;if(grid.rows>=6)return current;return {...current,workspace:{...current.workspace,grid:{...grid,rows:grid.rows+1,rowSizes:[...grid.rowSizes,1],cells:[...grid.cells,...Array.from({length:grid.columns},()=>null)]}}};});
  const focus = (id: string) => setPanels(p => p.map(item => item.id === id ? { ...item, z: Math.max(0,...p.map(v => v.z)) + 1 } : item));
  const change = (next: PanelState) => { if(diagnostics.navigation?.panelId===next.id&&next.activeTool!==diagnostics.navigation.issue.tool)diagnostics.setNavigation(null);setPanels(p => p.map(item => item.id === next.id ? next : item)); };
  const openPanel = (id: string) => {
    const current=session.current;
    if(!current)return;
    // Open synchronously with the click so popup blocking does not interfere
    // while the project (including a newly added panel) is saved first.
    const child=window.open("about:blank","_blank");
    if(!child){setAccessNotice("Браузер заблокировал отдельное окно. Разрешите всплывающие окна для этого сайта.");return;}
    child.opener=null;
    current.update(config);
    void current.flush().then(saved=>{
      if(!saved || session.current!==current){child.close();setAccessNotice("Не удалось сохранить проект перед открытием окна. Проверьте сообщение о сохранении.");return;}
      child.location.replace(`${window.location.pathname}?project=${encodeURIComponent(current.latest.project.id)}&panel=${encodeURIComponent(id)}`);
    }).catch(()=>{child.close();setAccessNotice("Не удалось открыть отдельное окно: проект не сохранён.");});
  };
  const addPanel = () => updateConfig(current=>{const windows=current.workspace.windows,index=windows.length,maxZ=Math.max(0,...windows.map(panel=>panel.z)),panel:PanelState={id:`tool-${Date.now()}`,entityId:"station-model",x:24+(index%5)*34,y:24+(index%5)*34,w:430,h:320,z:maxZ+1};if(current.workspace.mode!=="grid")return {...current,workspace:{...current.workspace,windows:[...windows,panel]}};let grid=current.workspace.grid,cell=grid.cells.findIndex(id=>!id||!windows.some(candidate=>candidate.id===id));if(cell<0&&grid.rows<6){cell=grid.cells.length;grid={...grid,rows:grid.rows+1,rowSizes:[...grid.rowSizes,1],cells:[...grid.cells,...Array.from({length:grid.columns},()=>null)]};}if(cell>=0){const cells=[...grid.cells];cells[cell]=panel.id;grid={...grid,cells};}return {...current,workspace:{...current.workspace,grid,windows:[...windows,panel]}};});
  const createGridTool=(cell:number,activeTool:PanelKind)=>updateConfig(current=>{const windows=current.workspace.windows,maxZ=Math.max(0,...windows.map(panel=>panel.z)),panel:PanelState={id:`grid-tool-${Date.now()}-${cell}`,activeTool,entityId:ENTITY_BY_TOOL[activeTool],x:0,y:0,w:430,h:320,z:maxZ+1},cells=[...current.workspace.grid.cells];cells[cell]=panel.id;return {...current,workspace:{...current.workspace,windows:[...windows,panel],grid:{...current.workspace.grid,cells}}};});
  const minimizePanel = (id:string) => setPanels(current=>current.map(panel=>panel.id===id?{...panel,minimized:true}:panel));
  const restorePanel = (id:string) => updateConfig(current=>{const windows=current.workspace.windows,maxZ=Math.max(0,...windows.map(panel=>panel.z)),nextWindows=windows.map(panel=>panel.id===id?{...panel,minimized:false,z:maxZ+1}:panel);if(current.workspace.mode!=="grid"||current.workspace.grid.cells.includes(id))return {...current,workspace:{...current.workspace,windows:nextWindows}};let grid=current.workspace.grid,cell=grid.cells.findIndex(value=>!value||!windows.some(panel=>panel.id===value));if(cell<0&&grid.rows<6){cell=grid.cells.length;grid={...grid,rows:grid.rows+1,rowSizes:[...grid.rowSizes,1],cells:[...grid.cells,...Array.from({length:grid.columns},()=>null)]};}if(cell>=0){const cells=[...grid.cells];cells[cell]=id;grid={...grid,cells};}return {...current,workspace:{...current.workspace,windows:nextWindows,grid}};});
  const closePanel = (id:string) => updateConfig(current=>({...current,workspace:{...current.workspace,windows:current.workspace.windows.filter(panel=>panel.id!==id),grid:{...current.workspace.grid,cells:current.workspace.grid.cells.map(cell=>cell===id?null:cell)}}}));
  const updateEngineering=(change:(current:ProjectConfig)=>ProjectConfig)=>{
    if(snapshot && !window.confirm("Изменить расчётные параметры сохранённой станции и пересчитать её по доступному каталогу?"))return;
    setSnapshot(false);
    updateConfig(current=>{const next=change(current);return synchronizeFullProject({...next,project:{...next.project,calculationMethod,graphVersion:currentPublication().version,recalculatedAt:new Date().toISOString()}});});
  };
  const updateInput = (patch: Partial<InputEntity>) => updateEngineering(current => ({ ...current, entities: { ...current.entities, "system-input": { ...(current.entities["system-input"] as InputEntity), ...patch, ...(patch.selectedPumpId ? {selectedPumpModel: (()=>{const pump=catalogue.find(p=>p.id===patch.selectedPumpId);return pump?`${pump.manufacturer} ${pump.model}`:undefined;})()} : {}) } } }));
  const updateInput2 = (patch: Partial<InputEntity>) => updateEngineering(current => ({ ...current, entities: { ...current.entities, "system-input-2": { ...(current.entities["system-input-2"] as InputEntity), ...patch, ...(patch.selectedPumpId ? {selectedPumpModel: (()=>{const pump=catalogue.find(p=>p.id===patch.selectedPumpId);return pump?`${pump.manufacturer} ${pump.model}`:undefined;})()} : {}) } } }));
  const updateDn = (patch:Partial<DnEntity>) => updateEngineering(current=>({...current,entities:{...current.entities,"station-dn":{...(current.entities["station-dn"] as DnEntity),...patch}}}));
  const addValvesToSpec=()=>{setSaveMessage("Подбор арматуры и комплектация всасывающей и напорной линий…");void loadComponentsDatabase(true).then(database=>{updateConfig(current=>refreshSuctionSpecification(current,database,true,catalogue));setSaveMessage("Всасывающая и напорная линии заполнены. Позиции без точного исполнения или цены отмечены «Уточнить».");}).catch(()=>setSaveMessage("Не удалось загрузить комплектующие для спецификации"));};
  const updateSettings = (patch: Partial<SettingsEntity>) => updateEngineering(current => {
    if ((Object.keys(patch) as Array<keyof SettingsEntity>).some(key => !canEditSetting(role, key))) return current;
    return { ...current, entities: { ...current.entities, "station-settings": { ...(current.entities["station-settings"] as SettingsEntity), ...patch } } };
  });
  const addSelectedPumpToSpec = () => {
    setSaveMessage("Проверяем актуальность каталога и обновляем спецификацию…");
    const projectId=config.project.id;
    void Promise.all([loadComponentsDatabase(true),loadProgram()]).then(([database,program])=>{
      if(session.current?.latest.project.id!==projectId)return;
      setBrowserPublication(program);setSnapshot(false);
      updateConfig(current=>synchronizeFullProject({...current,project:{...current.project,calculationMethod,graphVersion:currentPublication().version,recalculatedAt:new Date().toISOString()}},database));
      setAssetErrors(current=>{const next={...current};delete next["components/database"];return next;});
      setSaveMessage("Спецификация обновлена по актуальному каталогу. Выбранные насосы и количество синхронизируются автоматически.");
    }).catch(()=>{
      resetComponentsDatabase();
      setConfig(current=>synchronizeFullProject(current));
      setAssetErrors(current=>({...current,"components/database":"Каталог комплектующих недоступен; актуальность состава и цен не подтверждена."}));
      setSaveMessage("Не удалось проверить каталог комплектующих. Зависимые позиции требуют пересчёта.");
    });
  };
  const useConfiguredCabinet=(cabinet:SmartCabinet)=>updateEngineering(current=>{
    const spec=current.entities["station-spec"] as SpecEntity;
    const item:SpecItem={position:"03",option:"controlCabinet",sourceFingerprint:cabinetSourceFingerprint(current),technicalStatus:(current.entities["station-settings"] as SettingsEntity).stationType==="smart"?"ready":"unverified",name:cabinet.name,details:`NS Smart · ${cabinet.pumpCount} нас. × ${cabinet.pumpPowerKw.toLocaleString("ru-RU")} кВт · ${cabinet.enclosureDimensions}`,quantity:1,unit:"шт.",price:smartCabinetSpecificationPrice(cabinet),equipmentId:cabinet.id,description:`${cabinet.items.length} позиций · стоимость по актуальным комплектующим`,section:"control",status:"selected"};
    const items=replaceSpecificationRole(spec.items,"controlCabinet",item);
    setSaveMessage(`Шкаф ${cabinet.name} добавлен в спецификацию`);
    return {...current,entities:{...current.entities,"station-spec":{...spec,items}}};
  });
  const download = () => {
    const blob = new Blob([JSON.stringify(withUpdatedTimestamp(config), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = projectFilename(config); link.click(); URL.revokeObjectURL(url);
  };
  const openFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      if(!account)return;
      const loaded=parseAccessibleProject(JSON.parse(await file.text()),role);
      if(session.current && !await session.current.flush())throw new Error("Сначала сохраните текущий проект или сохраните конфликт как копию.");
      if(importMode.current==="replace") {
        if(!window.confirm("Заменить содержимое открытого проекта импортированным JSON?"))return;
        loaded.project={...loaded.project,id:config.project.id,createdAt:config.project.createdAt};
        const program=await loadProgram(loaded.project.graphVersion??INITIAL_VERSION);setBrowserPublication(program);loaded.project.graphVersion=program.version;
        setSnapshot(true);setConfig(loaded);history.current=[loaded];historyIndex.current=0;refreshHistoryState();
      } else {
        loaded.project={...loaded.project,id:crypto.randomUUID()};
        const program=await loadProgram(loaded.project.graphVersion??INITIAL_VERSION);setBrowserPublication(program);loaded.project.graphVersion=program.version;
        activate(account,loaded,0,true);
      }
      setAccessNotice("");window.history.replaceState({},"","/?project="+encodeURIComponent(loaded.project.id));
    } catch(error){window.alert(error instanceof Error?error.message:"Не удалось открыть проект");}
  };
  const rename = () => { const name=window.prompt("Название проекта",config.project.name)?.trim();if(name)updateConfig(current=>({...current,project:{...current.project,name}})); };
  const openById=async(id:string)=>{
    if(!account)return;
    if(session.current?.latest.project.id!==id && session.current && !await session.current.flush())throw new Error("Сначала сохраните текущий проект или сохраните конфликт как копию.");
    const file=await projectApi<ProjectFile>("?id="+encodeURIComponent(id));
    const loaded=parseAccessibleProject(file.config,role);
    const program=await loadProgram(loaded.project.graphVersion??INITIAL_VERSION);
    setBrowserPublication(program);loaded.project.graphVersion=program.version;
    activate(account,loaded,file.revision,true);
    const params=new URLSearchParams({project:id});
    if(detached && loaded.workspace.windows.some(panel=>panel.id===detached))params.set("panel",detached);
    else setDetached(null);
    setAccessNotice("");setView("workspace");window.history.replaceState({},"","/?"+params.toString());
  };
  const openStoredProject=(card:StoredProject)=>{void openById(card.id).catch(error=>window.alert(error.message));};
  const reloadFromDatabase=()=>{void openById(config.project.id).catch(error=>setAccessNotice(error.message));};
  const saveConflictCopy=()=>{
    const original=session.current;
    if(!account || !original)return;
    const copy={...config,project:{...config.project,id:crypto.randomUUID(),name:config.project.name+" (копия)"}};
    activate(account,copy,0,true).retireAfterCopy(original);
    const params=new URLSearchParams({project:copy.project.id});
    if(detached)params.set("panel",detached);
    window.history.replaceState({},"","/?"+params.toString());
  };
  const newProject=async()=>{try{if(!account)return;if(session.current && !await session.current.flush())throw new Error("Сначала сохраните текущий проект или сохраните конфликт как копию.");const project=createProject("Новая насосная станция",{baseValues:await fetchPublishedBaseValues()});const program=await loadProgram();setBrowserPublication(program);project.project.graphVersion=program.version;activate(account,project,0,false);setView("workspace");window.history.replaceState({},"","/");}catch(error){window.alert(String(error));}};
  const deleteProject=async(card:StoredProject)=>{if(!window.confirm("Удалить проект «"+card.name+"»?"))return;
    try{await projectApi("?id="+encodeURIComponent(card.id)+"&base="+card.revision,undefined,"DELETE");setProjects(current=>current.filter(p=>p.id!==card.id));if(config.project.id===card.id){session.current?.dispose();session.current=null;await newProject();}}catch(error){window.alert(String(error));}
  };
  const logout=async()=>{await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})});window.location.replace("/");};

  const navigateToIssue = (issue:ToolIssue) => {
    const currentIssue=diagnostics.issues.find(candidate=>candidate.id===issue.id);
    if(!currentIssue)return;
    let index=1;
    while(config.workspace.windows.some(panel=>panel.id===`issue-tool-${index}`||panel.id===`issue-tool-${index}-list`))index++;
    const next=openIssueInFirstPanel(config,currentIssue,`issue-tool-${index}`);
    updateConfig(()=>next.project);
    diagnostics.setNavigation(current=>({issue:currentIssue,panelId:next.panelId,token:(current?.token??0)+1,projectId:config.project.id}));
    if(detached){setDetached(null);window.history.replaceState({},"",`/?project=${encodeURIComponent(config.project.id)}`);}
  };
  const diagnosticsValue={...diagnostics,onNavigate:navigateToIssue};
  if(accountLoading)return <main className="auth-page"><section className="auth-intro"><Link className="brand auth-brand" href="/"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></Link></section><section className="auth-panel"><div className="auth-card"><span className="auth-icon">PS</span><h2>Загрузка</h2><p>Подготавливаем рабочее пространство…</p></div></section></main>;
  if(!account){const auth=new URLSearchParams(window.location.search).get("auth"),mode=auth==="verify"?"verify":auth==="reset"?"reset":"login";return <AccountScreen initialMode={mode}/>;}
  const mainMenu = <div className={`sidebar ${sidebar ? "sidebar--open" : ""}`} inert={!sidebar}><button className="sidebar__backdrop" onClick={() => setSidebar(false)} aria-label="Закрыть меню"/><aside className="sidebar__panel"><div className="sidebar__top"><div className="brand"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></div><button className="icon-button" onClick={() => setSidebar(false)}><Icon name="close" /></button></div><div className="user-card"><span className="avatar avatar--large">{initials(account.name)}</span><div><div className="user-card__name"><b>{account.name}</b><span className="user-role">{account.role}</span></div><small>{account.email}</small></div></div><nav className="sidebar__nav"><button className="sidebar__link sidebar__link--active" onClick={()=>setSidebar(false)}>▦ <span>Рабочее пространство</span></button><button className="sidebar__link" onClick={()=>{setView("projects");setSidebar(false);window.history.pushState({},"","/?view=projects");}}>▤ <span>Мои проекты</span><em>{projects.length}</em></button>{account.role==="admin"&&<button className="sidebar__link" onClick={()=>{setView("geometry-nodes");setSidebar(false);window.history.pushState({},"","/?view=geometry-nodes&project="+encodeURIComponent(config.project.id));}}>⌘ <span>Geometry Nodes</span></button>}{account.role==="admin"&&<button className="sidebar__link" onClick={()=>{setView("equipment-admin");setSidebar(false);window.history.pushState({},"","/?view=equipment-admin");}}>⌁ <span>База комплектующих</span></button>}{account.role==="admin"&&<button className="sidebar__link" onClick={()=>{setView("component-calculator");setSidebar(false);window.history.pushState({},"","/?view=component-calculator");}}>⌗ <span>Расчёт комплектующих</span></button>}{account.role==="admin"&&<button className="sidebar__link" onClick={()=>{setView("item-entry");setSidebar(false);window.history.pushState({},"","/?view=item-entry");}}>＋ <span>Заведение позиций</span></button>}{account.role==="admin"&&<button className="sidebar__link" onClick={()=>{setView("base-values");setSidebar(false);window.history.pushState({},"","/?view=base-values");}}>⚙ <span>Базовые значения</span></button>}{account.role==="admin"&&<button className="sidebar__link" onClick={()=>{setView("users");setSidebar(false);window.history.pushState({},"","/?view=users");}}>♙ <span>Список пользователей</span></button>}<button className="sidebar__link" onClick={() => { setSidebar(false); setSettingsOpen(true); }}>⚙ <span>Настройки</span></button><button className="sidebar__link" onClick={logout}>↪ <span>Выйти</span></button></nav><button className="sidebar__footer help-center-entry" onClick={()=>{setView("help");setSidebar(false);window.history.pushState({},"","/?view=help");}}><span className="help-center-entry__icon" aria-hidden="true">?</span><span><b>Центр помощи</b><small>Документация и поддержка</small></span></button></aside></div>;
  if(view==="help")return <HelpCenter onBack={()=>{setView("workspace");window.history.pushState({},"",`/?project=${encodeURIComponent(config.project.id)}`);}}/>;
  if(view==="geometry-nodes")return account.role==="admin"?<><EngineeringEditor openMain={()=>setSidebar(true)} navigation={mainMenu} project={config} pumps={catalogue} back={()=>{setView("workspace");window.history.pushState({},"","/?project="+encodeURIComponent(config.project.id));}}/>{settingsOpen&&<AppSettings theme={theme} onThemeChange={setTheme} profile={colorProfile} onProfileChange={setColorProfile} onClose={closeSettings}/>}</>:<main className="users-page"><h1>Доступ только для администратора</h1><button onClick={()=>{setView("workspace");window.history.replaceState({},"","/");}}>В рабочее пространство</button></main>;
  if(view==="equipment-admin")return <EquipmentAdminPanel actor={account} onBack={()=>{setView("workspace");window.history.pushState({},"","/");}}/>;
  if(view==="item-entry")return <ItemEntryPanel actor={account} onSaved={pump=>setCatalogue(current=>mergePumpCatalog(current.filter(item=>item.id!==pump.id),[pump]))} onBack={()=>{setView("workspace");window.history.pushState({},"","/");}}/>;
  if(view==="base-values")return <BaseValuesPanel actor={account} onBack={()=>{setView("workspace");window.history.pushState({},"","/");}}/>;
  if(bootError)return <main className="base-page"><h1>Не удалось загрузить проект</h1><p role="alert">{bootError}</p><button className="button" onClick={()=>window.location.reload()}>Повторить загрузку</button></main>;
  if(view==="projects")return <><ProjectsPage user={account} projects={projects} onBack={()=>{setView("workspace");window.history.pushState({},"","/");}} onOpen={openStoredProject} onCreate={newProject} onDelete={deleteProject} onLogout={logout}/>{nextPage!==null&&<button onClick={()=>void projectApi<{projects:StoredProject[];next:number|null}>("?offset="+nextPage).then(page=>{setProjects(old=>[...old,...page.projects.filter(p=>!old.some(item=>item.id===p.id))]);setNextPage(page.next);}).catch(e=>window.alert(e.message))}>Загрузить ещё</button>}</>;
  if(view==="component-calculator")return <ComponentCalculator actor={account} onBack={()=>{setView("workspace");window.history.pushState({},"","/");}} onSaved={()=>{resetComponentsDatabase();addSelectedPumpToSpec();}}/>;
  if(view==="users")return account.role==="admin"?<UsersPanel actor={account} onAccountChange={setAccount} onBack={()=>{setView("workspace");window.history.pushState({},"","/");}}/>:<main className="users-page"><div className="users-page__content"><h1>Доступ ограничен</h1><p>Список пользователей доступен только для admin.</p><button className="button" onClick={()=>{setView("workspace");window.history.replaceState({},"","/");}}>В рабочее пространство</button></div></main>;

  if(accessError)return <main className="users-page"><section className="users-page__content"><h1>Настройки проекта недоступны</h1><p>{accessError}</p><p>Сохранённый проект не изменён.</p><button className="button" onClick={()=>setView("projects")}>Мои проекты</button><button className="button" onClick={newProject}>Новый стандартный проект</button></section></main>;

  const geometryAllowed = canUseGeometry(role);
  const geometryEnabled = geometryAllowed && settingsEntity.geometryEnabled === true;
  const modelPanel = geometryEnabled
    ? <ModelTool key={config.project.id} project={config} catalogue={catalogue} entity={config.entities["station-model"] as import("./project-config").ModelEntity} onChange={next => updateConfig(current => current.project.id === config.project.id && (current.entities["station-settings"] as SettingsEntity).geometryEnabled ? { ...current, entities: { ...current.entities, "station-model": next } } : current)}/>
    : <div className="tool-lock"><b>{geometryAllowed ? "Для открытия 3D-редактора включите «Расчёт геометрии» в меню «Расчёт»." : "3D-редактор доступен с уровня pro."}</b></div>;
  const collectorPanel = <CollectorConstructor pressureChecksEnabled={pressureChecksEnabled(settingsEntity)} canCustomize={canEditAllSettings(role)} entity={config.entities["station-collectors"] as CollectorsEntity} inletHead={settingsEntity.inletHead} catalog={collectorCatalog} catalogError={collectorCatalogError} onCatalog={setCollectorCatalog} onChange={(type, patch, expectedFingerprint) => updateEngineering(current => {
    const entity = current.entities["station-collectors"] as CollectorsEntity, state = entity[type];
    if (current.project.id !== config.project.id) return current;
    if (expectedFingerprint && (!state.configuration || configurationFingerprint(state.configuration) !== expectedFingerprint)) return current;
    return { ...current, entities: { ...current.entities, "station-collectors": { ...entity, [type]: { ...state, ...patch } } } };
  })}/>;
  const assistantPanel = <AIAssistant userId={account.id} context={{projectId:config.project.id}}/>;
  if (detached) { const windowState = panels.find(panel => panel.id === detached),tool=windowState?.activeTool; if(!windowState)return null; const secondary=tool==="input2"||tool==="chart2"||tool==="sketch2",entity=tool?config.entities[ENTITY_BY_TOOL[tool]]:undefined,activeInput=secondary?inputEntity2:inputEntity; return <CadProvider key={`${account.id}/${config.project.id}`} enabled={geometryEnabled} project={config}><DiagnosticsProvider value={diagnosticsValue}><main className="detached"><header className="detached__header"><div className="brand"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></div><span>{tool?PANEL_INFO[tool].title:"Пустой инструмент"}</span><div className="detached__saving"><span role="status">{saveMessage}</span><button className="button" onClick={()=>void session.current?.flush()} disabled={conflicted}>Сохранить</button>{conflicted&&<><button className="button" onClick={reloadFromDatabase}>Открыть из базы</button><button className="button" onClick={saveConflictCopy}>Сохранить копию</button></>}</div></header>{accessNotice&&<p className="access-note" role="alert">{accessNotice}</p>}<section className="detached__content"><DiagnosticSurface panelId={windowState.id}>{tool&&entity?<PanelContent project={config} issues={derivedIssues} role={account.role} key={tool} assistantPanel={assistantPanel} collectorPanel={collectorPanel} modelPanel={modelPanel} id={tool} entity={entity} input={activeInput} secondaryInput={inputEntity2} settings={settingsEntity} catalogue={catalogue} onInputChange={secondary?updateInput2:updateInput} onSecondaryInputChange={updateInput2} onSettingsChange={updateSettings} onDnChange={updateDn} onAddValves={addValvesToSpec} onAddToSpec={()=>addSelectedPumpToSpec()} onCabinetConfigured={useConfiguredCabinet} locked={secondary&&!secondaryEnabled}/>:<div className="empty-tool"><span>＋</span><b>Пустой инструмент</b></div>}</DiagnosticSurface></section></main></DiagnosticsProvider></CadProvider>; }

  const minimizedPanels=panels.filter(panel=>panel.minimized);
  const renderWorkspacePanel=(panel:PanelState,mode:WorkspaceMode="free")=>{const tool=panel.activeTool,secondary=tool==="input2"||tool==="chart2"||tool==="sketch2";return <FloatingPanel key={panel.id} panel={panel} zoom={zoom} layoutMode={mode} content={tool?<PanelContent project={config} issues={derivedIssues} role={role} assistantPanel={assistantPanel} collectorPanel={collectorPanel} modelPanel={modelPanel} key={tool} id={tool} entity={config.entities[ENTITY_BY_TOOL[tool]]} input={secondary?inputEntity2:inputEntity} secondaryInput={inputEntity2} settings={settingsEntity} catalogue={catalogue} onInputChange={secondary?updateInput2:updateInput} onSecondaryInputChange={updateInput2} onSettingsChange={updateSettings} onDnChange={updateDn} onAddValves={addValvesToSpec} onAddToSpec={()=>addSelectedPumpToSpec()} onCabinetConfigured={useConfiguredCabinet} locked={secondary&&!secondaryEnabled}/>:<div className="empty-tool"><span>＋</span><b>Пустой инструмент</b><p>Выберите нужный инструмент в списке заголовка.</p></div>} secondaryEnabled={secondaryEnabled} onFocus={()=>focus(panel.id)} onChange={change} onDetach={()=>openPanel(panel.id)} onMinimize={()=>minimizePanel(panel.id)} onClose={()=>closePanel(panel.id)}/>;};
  const workspaceHint=workspaceMode==="free"?"Окна можно перемещать, масштабировать и прикреплять к границам":workspaceMode==="mobile"?"Один инструмент в строке на всю ширину рабочего пространства":`Фиксированная сетка ${workspaceGrid.columns} × ${workspaceGrid.rows}`;
  return <CadProvider key={`${account.id}/${config.project.id}`} enabled={geometryEnabled} project={config}><DiagnosticsProvider value={diagnosticsValue}><div className={`app-shell app-shell--${workspaceMode} ${ribbonCollapsed ? "app-shell--ribbon-collapsed" : ""} ${minimizedPanels.length?"app-shell--tasks":""}`}>
    <header className="app-header">
      <button ref={menuButton} className="icon-button app-header__menu" onClick={() => setSidebar(true)} aria-label="Открыть меню"><Icon name="menu" /></button>
      <Link className="brand" href="/"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></Link>
      <div className="app-header__project"><small>ТЕКУЩИЙ ПРОЕКТ</small><button onClick={rename}>{config.project.name} <span>✎</span></button></div>
      <div className="app-header__actions"><span className="save-state" role="status"><i style={{background:saveMessage==="Сохранено на сервере"?"#48a96a":conflicted?"#d75a57":"#d29b44"}}/>{saveMessage}</span><button className="avatar" onClick={()=>{setSidebar(true)}} title={account.name}>{initials(account.name)}</button></div>
    </header>

    {accessNotice && <p className="access-note" role="status">{accessNotice}<button className="button" onClick={()=>setAccessNotice("")}>Понятно</button></p>}
    <BaseValuesUpdateNotice key={config.project.id} project={config} latest={latestBaseValues} error={baseValuesError} onApply={next=>updateEngineering(()=>next)}/>
    {mainMenu}

    <nav className="ribbon">
      <div className="ribbon__tabs">
        {["Проект", "Вставка", "Расчёт", "Вид"].map(t => <button key={t} className={activeTab === t ? "ribbon__tab ribbon__tab--active" : "ribbon__tab"} onClick={() => { setActiveTab(t); setRibbonCollapsed(false); }}>{t}</button>)}
        <button className="ribbon__toggle" onClick={toggleRibbon} aria-expanded={!ribbonCollapsed} aria-controls="ribbon-tools" aria-label={ribbonCollapsed ? "Развернуть верхнюю панель" : "Свернуть верхнюю панель"} title={ribbonCollapsed ? "Развернуть верхнюю панель" : "Свернуть верхнюю панель"}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 10 4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div id="ribbon-tools" ref={ribbonTools} className="ribbon__tools" hidden={ribbonCollapsed}>
        <div className="tool-group">
          <button onClick={undo} disabled={!historyState.canUndo} title="Назад"><Icon name="undo" /></button>
          <button onClick={redo} disabled={!historyState.canRedo} title="Вперёд"><Icon name="redo" /></button>
        </div>
        <span className="ribbon__divider"/>
        {activeTab === "Проект" && <>
          <div className="tool-group tool-group--labeled">
            <button onClick={newProject}><b>＋</b><small>Новый</small></button>
            <button onClick={() => {importMode.current="new";fileInput.current?.click();}}><b>↥</b><small>Открыть JSON</small></button>
          </div>
          <span className="ribbon__divider"/>
          <div className="tool-group tool-group--labeled">
            <button onClick={()=>void session.current?.flush()}><b>▣</b><small>Сохранить</small></button>
            <button onClick={()=>setHistoryVisible(true)}><small>История версий</small></button>
            <button onClick={()=>{addSelectedPumpToSpec();}}><small>Пересчитать по каталогу</small></button>
            <button onClick={()=>{importMode.current="replace";fileInput.current?.click();}}><small>Заменить из JSON</small></button>
            {conflicted&&<><button onClick={reloadFromDatabase}><small>Открыть версию из базы</small></button><button onClick={saveConflictCopy}><small>Сохранить конфликт как копию</small></button></>}
            <button onClick={download}><b>↓</b><small>Экспорт JSON</small></button>
          </div>
        </>}
    {historyVisible&&activeSession&&<ProjectHistory session={activeSession} onClose={()=>setHistoryVisible(false)} onOpen={openById}/>}
        <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={openFile} />
        {activeTab === "Вставка" && <div className="tool-group tool-group--labeled">
          <button onClick={addPanel}><b>＋</b><small>Добавить инструмент</small></button>
        </div>}
        {activeTab === "Расчёт" && <>
          <PressureCheckToggle enabled={pressureChecksEnabled(settingsEntity)} disabled={!canEditSetting(role,"pressureChecksEnabled")} onChange={enabled=>updateSettings({pressureChecksEnabled:enabled})}/>
          <CalculationToggle label="Расчёт геометрии" hint="Рассчитывать расположение деталей станции и открыть доступ к 3D-редактору" enabled={geometryEnabled} disabled={!geometryAllowed}
            onChange={enabled => updateConfig(current => ({ ...current, entities: { ...current.entities, "station-settings": { ...current.entities["station-settings"] as SettingsEntity, geometryEnabled: enabled } } }))}/>
          <CadExportMenu/>
        </>}
        {activeTab === "Вид" && <>
          <div className="view-modes" role="group" aria-label="Режим рабочего пространства"><button className={workspaceMode==="free"?"view-modes__button view-modes__button--active":"view-modes__button"} onClick={()=>setWorkspaceMode("free")}><b>◇</b><span>Свободные окна</span></button><button className={workspaceMode==="mobile"?"view-modes__button view-modes__button--active":"view-modes__button"} onClick={()=>setWorkspaceMode("mobile")}><b>▤</b><span>Mobile</span></button><details className={`view-grid-menu ${workspaceMode==="grid"?"view-grid-menu--active":""}`}><summary className="view-modes__button"><b>▦</b><span>Сетка</span><i aria-hidden="true">⌄</i></summary><div className="view-grid-menu__list" aria-label="Выбор сетки"><strong>Выберите сетку</strong>{[[2,2],[3,2],[2,3]].map(([columns,rows])=><button key={`${columns}x${rows}`} className={workspaceMode==="grid"&&workspaceGrid.columns===columns&&workspaceGrid.rows===rows?"grid-presets__button grid-presets__button--active":"grid-presets__button"} onClick={event=>{applyGridTemplate(columns,rows);event.currentTarget.closest("details")?.removeAttribute("open");}}><b>{columns} × {rows}</b><small>{columns} столб. · {rows} стр.</small></button>)}</div></details></div>{workspaceMode==="grid"&&<><span className="ribbon__divider"/><GridHeightControl key={config.project.id} value={gridHeightScreens} onChange={setGridHeightScreens} /><span className="ribbon__divider"/><div className="grid-actions"><button onClick={addGridColumn} disabled={workspaceGrid.columns>=6}><b>＋▥</b><small>Столбец</small></button><button onClick={addGridRow} disabled={workspaceGrid.rows>=6}><b>＋▤</b><small>Строка</small></button></div></>}
          <span className="ribbon__divider"/>
          <div className="tool-group tool-group--labeled">
            <button onClick={() => setPanels(() => DEFAULT_PANELS.map(panel => ({ ...panel }))) }><b>▦</b><small>Упорядочить</small></button>
          </div>
        </>}
      </div>
    </nav>

    <main className={`workspace workspace--${workspaceMode}`}><div className="workspace__bar"><div><span className="workspace__status"/><b>Рабочее пространство</b><small>{workspaceHint}</small></div>{workspaceMode==="free"&&<div className="workspace__zoom"><button onClick={() => setZoom(value => Math.max(50, value - 10))} disabled={zoom === 50} aria-label="Уменьшить масштаб">−</button><button className="workspace__zoom-value" onClick={() => setZoom(100)} aria-label="Сбросить масштаб">{zoom}%</button><button onClick={() => setZoom(value => Math.min(150, value + 10))} disabled={zoom === 150} aria-label="Увеличить масштаб">＋</button></div>}</div>{workspaceMode==="free"?<div className="workspace__canvas"><div className="workspace__surface" style={{width:`${10000/zoom}%`,height:`${10000/zoom}%`,transform:`scale(${zoom/100})`}}>{panels.filter(panel=>!panel.minimized).map(panel=>renderWorkspacePanel(panel,"free"))}</div></div>:workspaceMode==="mobile"?<div className="workspace__canvas workspace__canvas--mobile"><div className="workspace-mobile">{panels.filter(panel=>!panel.minimized).map(panel=>renderWorkspacePanel(panel,"mobile"))}</div></div>:<div className="workspace__canvas workspace__canvas--grid"><GridWorkspace grid={workspaceGrid} heightScreens={gridHeightScreens} panels={panels} secondaryEnabled={secondaryEnabled} renderPanel={renderWorkspacePanel} onGridChange={setWorkspaceGrid} onCreate={createGridTool}/></div>}</main>
    {minimizedPanels.length>0&&<div className="window-dock" role="toolbar" aria-label="Свернутые инструменты"><span className="window-dock__label">Свернутые</span>{minimizedPanels.map(panel=><button key={panel.id} onClick={()=>restorePanel(panel.id)}><i aria-hidden="true"/>{panel.activeTool?PANEL_INFO[panel.activeTool].title:"Пустой инструмент"}<span>Развернуть</span></button>)}</div>}
    {settingsOpen && <AppSettings theme={theme} onThemeChange={setTheme} profile={colorProfile} onProfileChange={setColorProfile} onClose={closeSettings} />}
    <footer className="app-footer"><span>Проект: {config.project.id}</span><span>Формат проекта v{config.schemaVersion} · JSON</span><span>RU <i>•</i> {new Date(config.project.updatedAt).toLocaleDateString("ru-RU")}</span></footer>
  </div></DiagnosticsProvider></CadProvider>;
}

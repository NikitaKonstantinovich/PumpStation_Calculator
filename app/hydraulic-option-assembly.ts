import { tankMounting } from "./tank-mounting";
import { baseConfigurationIdentity, baseSettingsIdentity } from "./base-values";
import { hydraulicPortLabel, stationHydraulicPortLedger } from "./station-hydraulic-ports";
import importedHydraulics from "../data/hydraulic-v11-source.json";
import type { ProjectConfig, SettingsEntity, SpecEntity, SpecItem, SpecOption } from "./project-config";
import type { AssemblyComponent } from "./suction-catalog";
import type { CollectorsEntity } from "./collector-project";
import type { CollectorCatalog } from "./collector-calculations";
import { commonDischargeHead } from "./discharge-spec";
import { field, itemName, lineSpecParts, number } from "./line-spec-parts";
import { componentPressureLimit } from "./suction-pressure";
import { equipmentFlangeThickness } from "./line-joint-stack";
import { jointFlangeThickness } from "./joint-flange-dimensions";
import { hydraulicProductName, hydraulicProductPrice, hydraulicProductSummary, selectHydraulicProduct, type HydraulicProductRequirement } from "./hydraulic-option-selection";
import { withHydraulicProductReview } from "./hydraulic-product-review";
import { instrumentCount, normalizeHydraulicOptions, separationEnabled } from "./hydraulic-option-config";
import fastenerReference from "./suction-fasteners.json";
import { INSTRUMENT_CONNECTION_REVISION, addInstrumentSideConnection } from "./instrument-connection";
import { addValveLimitSwitches } from "./valve-limit-switches";
import { tankConnectionDn, tankValve20, TANK_VALVE_20_ID, TANK_ADAPTER_20_25_ID, TANK_LAYOUT_REVISION } from "./tank-connection";
import type { Pump } from "./pump-catalog";
import { INSTRUMENT_PRESSURE_REVISION, transducerSelectionPressure } from "./instrument-pressure";
import { automaticTransducerId, automaticTransducerSummary, selectAutomaticTransducer, pressureTransducerCatalog, TRANSDUCER_SELECTION_REVISION } from "./pressure-transducers";

export type HydraulicAssembly = {
  version: 1;
  location: string;
  accounting: "assembly" | "parts";
  source: string;
  ports: string[];
  parts: SpecItem[];
  requiredRoles: string[];
  findings: string[];
  requirement: HydraulicProductRequirement;
  selectionId?: string;
  candidates: { id: string; name: string; findings: string[] }[];
};
export function hydraulicAssemblyPrice(assembly: HydraulicAssembly): number | null {
  if (assembly.version !== 1 || !["assembly","parts"].includes(assembly.accounting) || !assembly.parts.length) return null;
  if (!assembly.requiredRoles?.length || assembly.requiredRoles.some(role => assembly.parts.filter(part => part.assemblyRole === role).length !== 1)) return null;
  if (assembly.parts.some(part => !Number.isFinite(part.quantity) || part.quantity <= 0 || typeof part.price !== "number" || !Number.isFinite(part.price) || part.price < 0 || part.technicalStatus === "stale")) return null;
  return Math.round(assembly.parts.reduce((sum, part) => sum + part.quantity * part.price!, 0) * 100) / 100;
}
export const hydraulicProductRowPrice = (a: HydraulicAssembly) => a.accounting === "parts"
  ? a.parts.filter(p=>p.assemblyRole==="product").length===1 ? a.parts.find(p=>p.assemblyRole==="product")!.price ?? null : null
  : hydraulicAssemblyPrice(a);
export const hydraulicAssemblyDescription = (a: HydraulicAssembly) => `Источник: ${a.source}. Подключения: ${a.ports.join(", ") || "не определены"}.\n${a.accounting==="parts"?"Изделие и детали подключения учтены отдельными позициями спецификации.":`Состав на 1 узел (включён в цену, повторно не суммируется):\n${a.parts.map(p => `${p.name}; ${p.quantity} ${p.unit ?? "шт."}; цена ${p.price ?? "не определена"} ₽; ${p.equipmentId ?? "нет артикула"}; ${p.description ?? ""}`).join("\n")}`}`;

/** Main row is the purchased product. Its recipe is retained for mounting and
 * completeness checks; each accessory is a separately priced station row. */
export function hydraulicPartsRows(item: SpecItem): SpecItem[] {
  const a=item.hydraulicAssembly!;
  const product=a.parts.find(p=>p.assemblyRole==="product")!;
  const main:SpecItem={...item,name:product.name,unit:product.unit??"шт.",price:product.price??null,
    description:product.description,details:`${product.details} · ${a.ports.map(hydraulicPortLabel).join("; ")}`,
    technicalStatus:product.technicalStatus=== "error"?"error":item.technicalNotes?.length?"unverified":product.technicalStatus,
    status:product.technicalStatus==="ready"&&!item.technicalNotes?.length&&product.price!==null?"selected":"clarify"};
  return [main,...a.parts.filter(p=>p.assemblyRole!=="product").map((p,i):SpecItem=>({...p,
    position:`${item.position}.${String(i+1).padStart(2,"0")}`,generatedBy:"hydraulic-options",assemblyRole:`${a.location}/${p.assemblyRole}`,
    quantity:Number((p.quantity*item.quantity).toFixed(3)),option:undefined,
    hydraulicPart:{location:a.location,role:p.assemblyRole!,option:item.option!},
    details:`${p.details} · ${a.ports.map(hydraulicPortLabel).join("; ")}`,sourceFingerprint:item.sourceFingerprint}))];
}

/** Merged pressure cells describe one source table, never another product family. */
export function hydraulicOptionCatalog(items: AssemblyComponent[]): AssemblyComponent[] {
  return pressureTransducerCatalog([...items, ...[...importedHydraulics.items,tankValve20].filter(item => !items.some(existing => existing.id === item.id))]).map(withHydraulicProductReview).map(item => {
    if (!/заглушк.*фланц/i.test(item.family) || field(item, /^PN$|^Давление$/i) !== undefined) return item;
    const donor = items.filter(other => item.tableId && other.tableId === item.tableId && other.family === item.family && (other.sourceRow ?? Infinity) < (item.sourceRow ?? 0) && field(other, /^PN$|^Давление$/i) !== undefined).sort((a, b) => b.sourceRow! - a.sourceRow!)[0];
    return donor ? { ...item, fields: [...item.fields, { column: "INHERITED_PN", headerPath: ["Давление"], value: field(donor, /^PN$|^Давление$/i)! }] } : item;
  });
}

const optionRoles = new Set<SpecOption>(["membraneTank", "pressureTransducer", "collectorPlugs", "isolatingValves"]);
export function buildHydraulicOptions(project: ProjectConfig, resources: { items: AssemblyComponent[]; collectorCatalog: CollectorCatalog; pumps?: readonly Pump[] | null }): SpecItem[] {
  const settings = project.entities["station-settings"] as SettingsEntity;
  const config = normalizeHydraulicOptions({ ...settings.hydraulicOptions, hoseLengthMm: settings.hydraulicOptions?.hoseLengthMm ?? settings.baseValues?.values.preferences.hoseLengthMm }), database = { items: hydraulicOptionCatalog(resources.items) };
  const collectors = project.entities["station-collectors"] as CollectorsEntity;
  const rows: SpecItem[] = [];
  const instrumentPressure = transducerSelectionPressure(project,resources.pumps);
  const fingerprint = JSON.stringify(["hydraulic-flat-lines-v1",TRANSDUCER_SELECTION_REVISION,INSTRUMENT_PRESSURE_REVISION,instrumentPressure,TANK_LAYOUT_REVISION,INSTRUMENT_CONNECTION_REVISION,"hydraulic-options-v1", baseSettingsIdentity(settings), collectors.suction.configuration&&baseConfigurationIdentity(collectors.suction.configuration), collectors.discharge.configuration&&baseConfigurationIdentity(collectors.discharge.configuration)], (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
  for (const side of ["suction", "discharge"] as const) {
    const collector = collectors[side].configuration;
    if (!collector) continue;
    const head = side === "suction" ? settings.inletHead ?? null : commonDischargeHead(project);
    const pressureBar = settings.pressureChecksEnabled === false || head === null ? null : Math.max(0, head * .0980665);
    const locationLabel = side === "suction" ? "Всас" : "Напор";
    const build = (role: string, option: SpecOption, label: string, quantity: number, requirement: HydraulicProductRequirement, ports: string[], populate: (parts: ReturnType<typeof lineSpecParts>, product: AssemblyComponent | undefined, findings: string[]) => void) => {
      const location = `${side}:${role}`;
      const prior = (project.entities["station-spec"] as SpecEntity).items.find(item => item.generatedBy === "hydraulic-options" && item.assemblyRole === location)?.equipmentId;
      const preferences = settings.baseValues?.values.preferences;
      const rules = preferences?.rules.filter(r => r.side === side && r.role === role && (r.stationType === "all" || r.stationType === settings.stationType)) ?? [];
      const ordered = [...rules].sort((a,b) => Number(b.stationType !== "all")-Number(a.stationType !== "all")).flatMap(r => r.productIds);
      const eligible = selectHydraulicProduct(database.items,requirement).candidates.filter(c => c.technicalStatus === "ready");
      const preferred = ordered.find(id => eligible.some(c => c.item.id === id));
      const requestedColor = requirement.kind === "isolating-valve" && requirement.color ? (requirement.color==="red" ? /красн/i : /син/i) : undefined;
      const sameColor = requestedColor && eligible.filter(c=>requestedColor.test(c.item.family));
      const automatic = sameColor?.length ? [prior,preferred,...sameColor.map(c=>c.item.id)].find(id=>sameColor.some(c=>c.item.id===id)) : prior ?? preferred;
      const selectedId = role==="transducer" ? automaticTransducerId(instrumentPressure.headM) : config.products[location] ?? automatic;
      const preferenceNote = role!=="transducer" && !config.products[location] && (!prior || prior === preferred || !preferred) && ordered.length && preferred !== ordered[0] ? "Предпочтительное изделие отсутствует или его совместимость не подтверждена. Использован другой совместимый вариант подбора." : "";
      const selection = role==="transducer"?selectAutomaticTransducer(database.items,instrumentPressure.headM):selectHydraulicProduct(database.items, requirement, selectedId);
      const product = selection.selected?.item, parts: SpecItem[] = [], findings = [...(selection.selected ? [...selection.selected.incompatible, ...selection.selected.missing] : [selection.explanation])];
      if(preferenceNote) findings.push(preferenceNote);
      const builder = lineSpecParts(parts, side, fingerprint, collector, database, resources.collectorCatalog);
      const body = builder.add("product", product ? hydraulicProductName(product) : label, 1, product ? `${role==="transducer"?automaticTransducerSummary(product):hydraulicProductSummary(product)}. ${selection.explanation}` : selection.explanation, product);
      body.price = product ? hydraulicProductPrice(product, requirement) : null;
      body.technicalStatus = selection.selected?.technicalStatus ?? "unverified";
      body.description = product ? `${product.sourceSheet}!строка ${product.sourceRow}; ${String(field(product, /^Источник проверки характеристик$/i) ?? "исходная база комплектующих")}` : selection.explanation;
      populate(builder, product, findings);
      const productFindings=[...findings];
      const interfaceIndex=parts.findIndex(p=>p.assemblyRole==="collector-interface");
      if(interfaceIndex>=0)parts.splice(interfaceIndex,1);
      for (const part of parts) if (part.technicalStatus !== "ready") findings.push(`${part.name}: ${part.technicalNotes?.join(" ") || part.description || part.details}`);
      const assembly: HydraulicAssembly = { version: 1, accounting: "assembly", location, source: role==="transducer"?`ONI PPT10, правило пользователя 01.11.2026: H ≤ 160 м — 16 бар, H > 160 м — 25 бар`:"Правила этапа 3, уточнения пользователя 29.10.2026; исходный калькулятор обвязки", ports, parts, requiredRoles: parts.map(part => part.assemblyRole!), findings: [...new Set(findings)], requirement, selectionId: selectedId ?? product?.id,
        candidates: selection.candidates.map(candidate => ({ id: candidate.item.id, name: hydraulicProductName(candidate.item) + ` · ${candidate.item.id}`, findings: [...candidate.incompatible, ...candidate.missing] })) };
      assembly.accounting="parts";
      rows.push(...hydraulicPartsRows({ position: `${side === "suction" ? "03" : "04"}.${String(90+rows.length).padStart(3,"0")}`, generatedBy: "hydraulic-options", assemblyRole: location, option, section: side, name: `${label} — ${locationLabel}`, quantity, unit: "компл.", equipmentId: product?.id,
        details: body.details, description: body.description, price: body.price,
        status: body.status, technicalStatus: body.technicalStatus, technicalNotes: [...new Set(productFindings)], sourceFingerprint: fingerprint, hydraulicAssembly: assembly }));
    };
    if (settings.collectorPlugs) build("plug", "collectorPlugs", "Заглушка коллектора", 1, { kind: "flange-plug", pressureBar, dn: collector.dn, pn: collector.pn, material: collector.material }, [`${side}:end-2`], (parts, product) => {
      if (collector.connection !== "flanged") parts.add("plug-connection-error", "Несовместимое окончание коллектора", 1, "Для фланцевой заглушки требуется фланцевое окончание; резьбовое окончание несовместимо.");
      if (!collector.dn) { parts.add("connection", "Комплект подключения заглушки", 1, "DN коллектора не определён"); return; }
      parts.gasket("plug-gasket", collector.dn, collector.pn, 1);
      const pair = jointFlangeThickness(database, collector.material, collector.dn, collector.pn).thicknessMm;
      const blind = equipmentFlangeThickness(product);
      parts.fasteners("plug-fasteners", collector.dn, collector.pn, 1, { gaskets: 1, thickness: 0, flangeThickness: pair !== null && blind !== null ? pair / 2 + blind : null, source: "Существующий концевой фланец коллектора + толщина выбранной глухой заглушки; концевой фланец и его сварка учтены в коллекторе." });
    });
    if (separationEnabled(settings) && (collector.sectionBreaks ?? 0) > 0) build("separator", "isolatingValves", "Затвор разделительный с рукояткой", collector.sectionBreaks!, { kind: "isolating-valve", pressureBar, dn: collector.dn, pn: collector.pn, color: "red", actuator: "handle" }, Array.from({ length: collector.sectionBreaks! }, (_, i) => `${side}:between-${i + 1}-${i + 2}`), (parts, product, findings) => {
      if (!collector.dn) { parts.add("connection", "Комплект подключения затвора", 1, "DN коллектора не определён"); return; }
      parts.gasket("separator-gaskets", collector.dn, collector.pn, 2);
      const reference = fastenerReference.find(row => row.dn === collector.dn && row.pn === collector.pn);
      const thickness = product ? number(field(product, /^(?:Строительная длина|Толщина межфланцевого элемента|L), мм$/i)) ?? (/\b017W\b/.test(product.family) ? reference?.wafer017WLength ?? null : null) : null;
      parts.fasteners("separator-fasteners", collector.dn, collector.pn, 1, { gaskets: 2, thickness, source: reference?.source });
      if (thickness === null) findings.push("Строительная длина выбранного затвора неизвестна; длину крепежа нельзя подтвердить.");
      addValveLimitSwitches(parts, database.items, "separator", 1, collector.dn, product);
      // The two welded mating ends belong to the collector BOM, not this purchased valve.
      parts.add("collector-interface", "Два ответных фланца и сварка", 1, "Учтены в расчёте коллектора, роль section-break", undefined, "компл.", 0, "Учёт в коллекторе; повторная стоимость 0 ₽.");
    });
    const sensorCount = instrumentCount(settings);
    if (side === "discharge") build("transducer", "pressureTransducer", "Преобразователь давления", sensorCount, { kind: "transducer", pressureBar:instrumentPressure.pressureBar, pressureBasis:instrumentPressure.source, thread: "G1/4", threadGender: "male", ...(instrumentPressure.pressureBar !== null ? {range: { min: 0, max: Math.max(.000001, instrumentPressure.pressureBar / 10) }} : {}), signal: "4–20 мА" }, Array.from({ length: sensorCount }, (_, i) => `${side}:kip-${i + 1}/sensor`), (parts) => {
      addInstrumentSideConnection(parts, database.items, 1, "преобразователь");
      parts.flax("sensor-seals", .3, "Кран → переходник → футорка → преобразователь: 3 стыка × 0,1 м. Коллектор → кран и прямое подключение манометра учтены в напорной линии.");
    });
    if (side !== "discharge" || !settings.membraneTank) continue;
    const volume = settings.membraneTankVolume, takeoffDn = tankConnectionDn(), size = volume === 8 ? 20 : 25;
    build("tank", "membraneTank", `Бак мембранный ${volume} л`, 1, { kind: "tank", pressureBar, volumeLitres: volume, thread: volume === 8 ? "G3/4" : "G1", threadGender: "male" }, ["discharge:tank"], (parts, _product, findings) => {
      const port=collector.instrumentPorts?.find(p=>p.id==="tank");
      if(!port||port.dn!==takeoffDn||port.threaded===false){const detail=port?`Для подключения бака нужен резьбовой сгон DN20; задан DN${port.dn}${port.threaded===false?" без резьбы":""}. Пересчитайте коллектор.`:"В правиле коллектора отсутствует отвод для бака.";parts.add("tank-takeoff-error","Подключение бака к коллектору DN20",1,detail);findings.push(detail);}
      if(volume!==8){
        const adapter=database.items.find(item=>item.id===TANK_ADAPTER_20_25_ID);
        const transition=parts.add("tank-diameter-transition","Переход DN20 → DN25 · G3/4 ВР × G1 НР",1,"Сгон DN20 → футорка DN25 с внутренней резьбой 3/4 → кран DN25 → шланг → бак",adapter);
        transition.technicalStatus="unverified";
        transition.description="Футорка латунная НР–ВР LD Pride 1×3/4 из базы. Схема принята пользователем; PN фитинга и потери давления в подводке требуют проверки. В 3D соединительные детали не показываются.";
      }
      const valve = database.items.find(item => item.id === (size === 20 ? TANK_VALVE_20_ID : "шаровые-краны-001-r0195"));
      const row = parts.add("tank-valve", `Отсечной шаровой кран DN${size} ВР/ВР`, 1, `Коллектор → кран → ${volume === 8 ? "бак" : "шланг → бак"}`, valve);
      if(size===20){row.name="Кран LD Pride DN20 PN40 с дренажем и воздухоотводчиком";row.technicalStatus="unverified";row.description="Модель подключения по изображениям пользователя; точный артикул и цена крана DN20 требуют подтверждения. Цена другого крана не подставляется.";}
      if (!componentPressureLimit(valve)) { row.technicalStatus = "unverified"; row.description = "Исходная книга: кран бака. Не подтверждены PN, стандарт резьбы и точный артикул."; }
      parts.flax("tank-thread-seals", volume===8?.2:.3, volume===8?"Сгон → кран → бак: два резьбовых стыка × 0,1 м.":"Сгон → переход DN20/DN25 → кран → шланг: три резьбовых стыка × 0,1 м; накидная гайка у бака уплотняется прокладкой.");
      if (volume !== 8) {
        const hose = database.items.find(item => item.id === "мембранный-бак-002-r0012");
        const hoseRow = parts.add("tank-hose", "Угловая подводка STOUT 1″ НР–ВР", 1, config.hoseLengthMm ? `${config.hoseLengthMm} мм` : "Длина не задана", hose);
        hoseRow.technicalStatus = "unverified";
        hoseRow.description = "Длина пока не задаётся по указанию пользователя; цена исходной строки семейства, уточнить при выборе длины. Паспорт SHF: 10 бар; уплотнение накидной гайки — комплектная прокладка.";
        // Длина оставлена незаданной по указанию пользователя; цена семейства из книги.
        if (pressureBar !== null && pressureBar > 10) { hoseRow.technicalStatus = "error"; findings.push("Рабочее давление превышает 10 бар для подводки STOUT SHF."); }
        const mount = tankMounting(database.items, volume);
        for (const [role, part] of [["bolts", mount.bolt], ["nuts", mount.nut], ["washers", mount.washer]] as const) {
          parts.add(`tank-mount-${role}`, part ? itemName(part) : `Крепление бака: ${role}`, mount.points * (role === "washers" ? 2 : 1), mount.source, part, "шт.", undefined, mount.source);
        }
        findings.push(mount.limitation);
      }
      if (volume === 100) {
        const cap = resources.collectorCatalog.components.find(item => item.kind === "plug" && item.dn === 20 && item.threadGender === "female" && (item.pn ?? 0) >= 10);
        parts.add("tank-top-cap", "Заглушка верхнего штуцера WAV 100, G3/4 ВР", 1, "Паспорт Wester: дополнительный верхний штуцер должен быть закрыт или занят прибором", database.items.find(item => item.id === cap?.id));
        parts.flax("tank-top-seal", .1, "Уплотнение верхнего штуцера бака");
      }
    });
  }
  return rows;
}

export function synchronizeHydraulicOptions(project: ProjectConfig, resources: { items: AssemblyComponent[]; collectorCatalog: CollectorCatalog; pumps?: readonly Pump[] | null }): ProjectConfig {
  const spec = project.entities["station-spec"] as SpecEntity;
  const items = [...spec.items.filter(item => item.generatedBy !== "hydraulic-options" && !(item.option && optionRoles.has(item.option) && (item.generatedBy === "station" || !item.equipmentId && item.quantity === 0))), ...buildHydraulicOptions(project, resources)];
  return { ...project, entities: { ...project.entities, "station-spec": { ...spec, items, hydraulicPorts: stationHydraulicPortLedger(project) } } };
}

import { tankMounting } from "./tank-mounting";
import { baseConfigurationIdentity, baseSettingsIdentity } from "./base-values";
import { hydraulicPortLabel, stationHydraulicPortLedger } from "./station-hydraulic-ports";
import importedHydraulics from "../data/hydraulic-v11-source.json";
import type { ProjectConfig, SettingsEntity, SpecEntity, SpecItem, SpecOption, SpecTechnicalStatus } from "./project-config";
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
import { addInstrumentSideConnection } from "./instrument-connection";
import { addValveLimitSwitches } from "./valve-limit-switches";

export type HydraulicAssembly = {
  version: 1;
  location: string;
  accounting: "assembly";
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
  if (assembly.version !== 1 || assembly.accounting !== "assembly" || !assembly.parts.length) return null;
  if (!assembly.requiredRoles?.length || assembly.requiredRoles.some(role => assembly.parts.filter(part => part.assemblyRole === role).length !== 1)) return null;
  if (assembly.parts.some(part => !Number.isFinite(part.quantity) || part.quantity <= 0 || typeof part.price !== "number" || !Number.isFinite(part.price) || part.price < 0 || part.technicalStatus === "stale")) return null;
  return Math.round(assembly.parts.reduce((sum, part) => sum + part.quantity * part.price!, 0) * 100) / 100;
}
export const hydraulicAssemblyDescription = (a: HydraulicAssembly) => `Источник: ${a.source}. Подключения: ${a.ports.join(", ") || "не определены"}.\nСостав на 1 узел (включён в цену, повторно не суммируется):\n${a.parts.map(p => `${p.name}; ${p.quantity} ${p.unit ?? "шт."}; цена ${p.price ?? "не определена"} ₽; ${p.equipmentId ?? "нет артикула"}; ${p.description ?? ""}`).join("\n")}`;

/** Merged pressure cells describe one source table, never another product family. */
export function hydraulicOptionCatalog(items: AssemblyComponent[]): AssemblyComponent[] {
  return [...items, ...importedHydraulics.items.filter(item => !items.some(existing => existing.id === item.id))].map(withHydraulicProductReview).map(item => {
    if (!/заглушк.*фланц/i.test(item.family) || field(item, /^PN$|^Давление$/i) !== undefined) return item;
    const donor = items.filter(other => item.tableId && other.tableId === item.tableId && other.family === item.family && (other.sourceRow ?? Infinity) < (item.sourceRow ?? 0) && field(other, /^PN$|^Давление$/i) !== undefined).sort((a, b) => b.sourceRow! - a.sourceRow!)[0];
    return donor ? { ...item, fields: [...item.fields, { column: "INHERITED_PN", headerPath: ["Давление"], value: field(donor, /^PN$|^Давление$/i)! }] } : item;
  });
}

const optionRoles = new Set<SpecOption>(["membraneTank", "pressureTransducer", "collectorPlugs", "isolatingValves"]);
export function buildHydraulicOptions(project: ProjectConfig, resources: { items: AssemblyComponent[]; collectorCatalog: CollectorCatalog }): SpecItem[] {
  const settings = project.entities["station-settings"] as SettingsEntity;
  const config = normalizeHydraulicOptions({ ...settings.hydraulicOptions, hoseLengthMm: settings.hydraulicOptions?.hoseLengthMm ?? settings.baseValues?.values.preferences.hoseLengthMm }), database = { items: hydraulicOptionCatalog(resources.items) };
  const collectors = project.entities["station-collectors"] as CollectorsEntity;
  const rows: SpecItem[] = [];
  const fingerprint = JSON.stringify(["hydraulic-options-v1", baseSettingsIdentity(settings), collectors.suction.configuration&&baseConfigurationIdentity(collectors.suction.configuration), collectors.discharge.configuration&&baseConfigurationIdentity(collectors.discharge.configuration)], (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
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
      const selectedId = config.products[location] ?? prior ?? preferred;
      const preferenceNote = !config.products[location] && (!prior || prior === preferred || !preferred) && ordered.length && preferred !== ordered[0] ? "Предпочтительное изделие отсутствует или его совместимость не подтверждена. Использован другой совместимый вариант подбора." : "";
      const selection = selectHydraulicProduct(database.items, requirement, selectedId);
      const product = selection.selected?.item, parts: SpecItem[] = [], findings = [...(selection.selected ? [...selection.selected.incompatible, ...selection.selected.missing] : [selection.explanation])];
      if(preferenceNote) findings.push(preferenceNote);
      const builder = lineSpecParts(parts, side, fingerprint, collector, database, resources.collectorCatalog);
      const body = builder.add("product", product ? hydraulicProductName(product) : label, 1, product ? `${hydraulicProductSummary(product)}. ${selection.explanation}` : selection.explanation, product);
      body.price = product ? hydraulicProductPrice(product, requirement) : null;
      body.technicalStatus = selection.selected?.technicalStatus ?? "unverified";
      body.description = product ? `${product.sourceSheet}!строка ${product.sourceRow}; ${String(field(product, /^Источник проверки характеристик$/i) ?? "исходная база комплектующих")}` : selection.explanation;
      populate(builder, product, findings);
      for (const part of parts) if (part.technicalStatus !== "ready") findings.push(`${part.name}: ${part.technicalNotes?.join(" ") || part.description || part.details}`);
      const status: SpecTechnicalStatus = parts.some(part => part.technicalStatus === "error") ? "error" : findings.length ? "unverified" : "ready";
      const assembly: HydraulicAssembly = { version: 1, accounting: "assembly", location, source: "Правила этапа 3, уточнения пользователя 29.10.2026; исходный калькулятор обвязки", ports, parts, requiredRoles: parts.map(part => part.assemblyRole!), findings: [...new Set(findings)], requirement, selectionId: selectedId ?? product?.id,
        candidates: selection.candidates.map(candidate => ({ id: candidate.item.id, name: hydraulicProductName(candidate.item) + ` · ${candidate.item.id}`, findings: [...candidate.incompatible, ...candidate.missing] })) };
      const amount = hydraulicAssemblyPrice(assembly);
      rows.push({ position: side === "suction" ? "03.90" : "04.90", generatedBy: "hydraulic-options", assemblyRole: location, option, section: side, name: `${label} — ${locationLabel}`, quantity, unit: "компл.", equipmentId: product?.id,
        details: `${product ? hydraulicProductName(product) : "Изделие требует подбора"} · ${ports.map(hydraulicPortLabel).join("; ")}`, description: "Изделие и комплект подключения; вложенный состав раскрывается ниже.", price: amount,
        status: status === "ready" && amount !== null ? "selected" : "clarify", technicalStatus: status, technicalNotes: assembly.findings, sourceFingerprint: fingerprint, hydraulicAssembly: assembly });
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
    if (side === "discharge") build("transducer", "pressureTransducer", "Преобразователь давления", sensorCount, { kind: "transducer", pressureBar, thread: "G1/4", threadGender: "male", range: { min: 0, max: Math.max(.000001, (pressureBar ?? 0) / 10) }, signal: "4–20 мА", supplyVoltage: config.sensorSupplyVoltage }, Array.from({ length: sensorCount }, (_, i) => `${side}:kip-${i + 1}/sensor`), (parts, _product, findings) => {
      addInstrumentSideConnection(parts, database.items, 1, "преобразователь");
      parts.flax("sensor-seals", .3, "Кран → переходник → футорка → преобразователь: 3 стыка × 0,1 м. Коллектор → кран и прямое подключение манометра учтены в напорной линии.");
      findings.push("Питание и вход 4–20 мА выбранного шкафа необходимо подтвердить; внешняя электрика относится к этапу 5.");
    });
    if (side !== "discharge" || !settings.membraneTank) continue;
    const volume = settings.membraneTankVolume, size = volume === 8 ? 20 : 25;
    build("tank", "membraneTank", `Бак мембранный ${volume} л`, 1, { kind: "tank", pressureBar, volumeLitres: volume, thread: volume === 8 ? "G3/4" : "G1", threadGender: "male" }, ["discharge:tank"], (parts, _product, findings) => {
      const port=collector.instrumentPorts?.find(p=>p.id==="tank");
      if(!port||port.dn!==size||port.threaded===false){const detail=port?`Сгон DN${port.dn}${port.threaded===false?" без резьбы":""} → арматура DN${size}: подтвердите комплект перехода.`:"В правиле коллектора отсутствует отвод для бака.";parts.add("tank-diameter-transition",port?`Переход подключения бака DN${port.dn}×DN${size}`:"Подключение бака к коллектору",1,detail);findings.push(detail);}
      const valve = database.items.find(item => item.id === (size === 20 ? "шаровые-краны-001-r0194" : "шаровые-краны-001-r0195"));
      const row = parts.add("tank-valve", `Отсечной шаровой кран DN${size} ВР/ВР`, 1, `Коллектор → кран → ${volume === 8 ? "бак" : "шланг → бак"}`, valve);
      if (!componentPressureLimit(valve)) { row.technicalStatus = "unverified"; row.description = "Исходная книга: кран бака. Не подтверждены PN, стандарт резьбы и точный артикул."; }
      parts.flax("tank-thread-seals", .2, "Два резьбовых стыка на трубной резьбе × 0,1 м; накидная гайка шланга уплотняется прокладкой.");
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

export function synchronizeHydraulicOptions(project: ProjectConfig, resources: { items: AssemblyComponent[]; collectorCatalog: CollectorCatalog }): ProjectConfig {
  const spec = project.entities["station-spec"] as SpecEntity;
  const items = [...spec.items.filter(item => item.generatedBy !== "hydraulic-options" && !(item.option && optionRoles.has(item.option) && (item.generatedBy === "station" || !item.equipmentId && item.quantity === 0))), ...buildHydraulicOptions(project, resources)];
  return { ...project, entities: { ...project.entities, "station-spec": { ...spec, items, hydraulicPorts: stationHydraulicPortLedger(project) } } };
}

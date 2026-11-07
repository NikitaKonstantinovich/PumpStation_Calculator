import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const SOURCE = "pump_catalog_v2";
const number = value => typeof value === "number" && Number.isFinite(value) ? value : null;
const decimal = value => value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const grouped = (rows, key) => {
  const result = new Map();
  for (const row of rows) { const id = row[key]; if (!result.has(id)) result.set(id, []); result.get(id).push(row); }
  return result;
};
const indexed = (rows, key = "id") => new Map(rows.map(row => [row[key], row]));
const pointsValid = points => points.length >= 2 && points.every(([q, value], i) => Number.isFinite(q) && Number.isFinite(value) && q >= 0 && value >= 0 && (!i || q > points[i - 1][0]));
const documentName = value => typeof value === "string" ? value.split(/[\\/]/).at(-1) : null;

function dimensionReader(optional) {
  const sets = indexed(optional("dimension_sets")), byModel = grouped([...sets.values()], "model_id");
  const values = grouped(optional("dimension_values"), "dimension_set_id"), definitions = indexed(optional("dimension_definitions"), "code");
  const preferred = grouped(optional("preferred_dimension_sets"), "variant_id"), inline = grouped(optional("inline_dimension_selections"), "model_id");
  const geometryBindings = grouped(optional("variant_geometry_bindings"), "variant_id"), geometryProfiles = indexed(optional("catalogue_geometry_profiles")), geometryValues = grouped(optional("catalogue_geometry_values"), "profile_id");
  const semanticValues = (rows, valueKey, issues) => {
    const candidates = grouped(rows.filter(row => row.dimension_code && definitions.has(row.dimension_code) && number(row[valueKey]) != null && row[valueKey] >= 0), "dimension_code"), result = {};
    for (const [code, assertions] of candidates) {
      const unique = [...new Set(assertions.map(row => row[valueKey]))];
      if (unique.length === 1) result[code] = unique[0];
      else { result[code] = null; issues.push("Неоднозначные значения размера «" + code + "»; значение не выбрано"); }
    }
    return result;
  };
  return (variant, model, issues) => {
    let selected, binding, via, dimensions, evidence;
    const fail = message => { issues.push(message); dimensions = {scope:"unknown",note:message}; evidence = {status:"unknown",message}; };
    const select = (rows, name) => {
      if (rows.length !== 1) { fail("Не выбран однозначный набор размеров исполнения"); return; }
      binding = rows[0]; selected = sets.get(binding.dimension_set_id); via = name;
      if (!selected || selected.model_id !== model.id) { selected = null; fail("Набор размеров не соответствует модели исполнения"); }
    };
    if (preferred.has(variant.id)) select(preferred.get(variant.id), "variant_preference");
    else if (inline.has(model.id)) select(inline.get(model.id), "explicit_model_selection");
    else {
      const exact = (byModel.get(model.id) ?? []).filter(set => set.scope === "designation" && set.exact_designation === variant.designation);
      if (exact.length) select(exact.map(set => ({dimension_set_id:set.id})), "exact_designation_reference");
    }
    if (selected) {
      const rows = (values.get(selected.id) ?? []).slice().sort((a,b) => String(a.source_key).localeCompare(String(b.source_key)));
      const sourceValues = rows.map(row => ({key:row.source_key,symbol:row.source_symbol ?? null,code:row.dimension_code ?? null,name:definitions.get(row.dimension_code)?.name_ru ?? null,valueMm:number(row.value_mm),mappingStatus:row.mapping_status,method:row.value_method}));
      const scope = selected.scope === "model_reference" ? "model_reference" : via === "exact_designation_reference" ? "designation_reference" : "variant_bound_designation";
      const note = scope === "model_reference" ? "Справочные размеры модели; применимость к конкретному заводскому исполнению не подтверждена" : scope === "designation_reference" ? "Размеры связаны по точному обозначению; отдельная привязка к артикулу отсутствует" : "Набор явно выбран для исполнения; область подтверждения определяется источником, это не проверка заводской сборки";
      dimensions = {scope,note,dimensionSetId:selected.id,declaredDesignation:selected.exact_designation ?? null,...semanticValues(rows.filter(row => row.mapping_status === "semantic_source_key" && definitions.get(row.dimension_code)?.unit === "mm"),"value_mm",issues),sourceValues};
      evidence = {status:"selected",selection:via,scope,sourceScope:selected.scope,note,dimensionSetId:selected.id,declaredDesignation:selected.exact_designation ?? null,applicability:selected.applicability,bindingApplicability:binding?.applicability ?? null,evidenceLevel:binding?.evidence_level ?? null,sourceId:selected.source_id,bindingSourceId:binding?.source_id ?? null,document:documentName(selected.source_document_name),documentSha256:selected.source_document_sha256 ?? null,page:number(selected.document_page),printedPage:number(binding?.printed_page)};
      dimensions.applicability = selected.applicability;
      if (binding?.applicability) dimensions.bindingApplicability = binding.applicability;
      if (!sourceValues.length) issues.push("В выбранном наборе размеров отсутствуют размерные значения");
      if (rows.some(row => row.mapping_status === "alternative_execution")) issues.push("Альтернативные размеры сохранены отдельно и не приняты за размеры выбранного исполнения");
    }
    const geometry = geometryBindings.get(variant.id) ?? [];
    if (geometry.length) {
      const binding = geometry[0], profile = geometryProfiles.get(binding.profile_id);
      if (geometry.length !== 1 || !profile || profile.family_id !== model.family_id) {
        issues.push("Геометрия основания не имеет однозначной согласованной привязки к исполнению");
      } else {
        const rows = (geometryValues.get(profile.id) ?? []).slice().sort((a,b) => String(a.code).localeCompare(String(b.code)));
        const baseGeometry = {scope:"variant_bound_family_geometry",profileId:profile.id,axisDefinition:profile.axis_definition,applicability:profile.applicability,bindingApplicability:binding.applicability,...semanticValues(rows.filter(row => row.unit === "mm"),"value",issues),sourceValues:rows.map(row => ({key:row.code,symbol:row.source_symbol ?? null,sourceText:row.source_dimension_text ?? null,code:row.dimension_code ?? null,name:definitions.get(row.dimension_code)?.name_ru ?? null,value:number(row.value),unit:row.unit}))};
        dimensions = {...(dimensions ?? {scope:"unknown",note:"Общие габариты исполнения не подтверждены"}),baseGeometry};
        evidence = {...evidence,baseGeometry:{profileId:profile.id,scope:baseGeometry.scope,sourceId:profile.source_id,applicability:profile.applicability,bindingApplicability:binding.applicability,axisDefinition:profile.axis_definition,page:number(profile.pdf_page),printedPage:number(profile.printed_page)}};
      }
    }
    return {dimensions,evidence,sourceIds:[selected?.source_id,binding?.source_id,evidence?.baseGeometry?.sourceId].filter(Boolean)};
  };
}

/** The source path is server configuration. Request arguments never become file paths or SQL. */
export function readCatalogSnapshot(path) {
  const db = new DatabaseSync(resolve(path), { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=3000; BEGIN;");
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all().map(row => row.name));
    const required = name => { if (!tables.has(name)) throw Error("В новом каталоге отсутствует обязательная таблица «" + name + "»"); return db.prepare('SELECT * FROM "' + name + '"').all(); };
    const optional = name => tables.has(name) ? db.prepare('SELECT * FROM "' + name + '"').all() : [];
    const metadata = Object.fromEntries(required("metadata").sort((a,b) => a.key.localeCompare(b.key)).map(row => [row.key, row.value]));
    if (typeof metadata.schema_version !== "string" || !metadata.schema_version) throw Error("У нового каталога отсутствует версия схемы");
    const models = indexed(required("models")), manufacturers = indexed(required("manufacturers")), series = indexed(required("series"));
    const variants = required("variants").sort((a,b) => String(a.id).localeCompare(String(b.id))), types = indexed(required("pump_types"));
    const motors = indexed(optional("motor_configurations"), "variant_id"), ratings = grouped(optional("motor_ratings"), "variant_id");
    const ports = grouped(optional("ports"), "variant_id"), sets = grouped(required("curve_sets"), "model_id");
    const curves = grouped(required("curves"), "curve_set_id"), curvePoints = grouped(required("curve_points").sort((a,b) => a.ordinal - b.ordinal), "curve_id");
    const prices = indexed(optional("price_snapshots")), links = grouped(optional("variant_price_links"), "variant_id");
    const materials = indexed(optional("material_profiles")), materialComponents = grouped(optional("material_components"), "profile_id");
    const availability = indexed(optional("availability_snapshots"), "model_id"), sourceRecords = indexed(optional("source_records"));
    const review = optional(tables.has("v_current_review_issues") ? "v_current_review_issues" : "review_issues");
    const reviewsByModel = grouped(review.filter(row => row.model_id != null), "model_id"), reviewsByVariant = grouped(review.filter(row => row.variant_id != null), "variant_id");
    const cad = grouped(optional("cad_bindings"), "model_id"), variantPressure = indexed(optional("variant_pressure_limits"), "variant_id");
    const rawViews = indexed(optional("v_catalog"), "variant_id"), archives = optional("source_archives").sort((a,b) => a.path.localeCompare(b.path));
    const dimensionsFor = dimensionReader(optional);
    const items = variants.map(variant => {
      const model = models.get(variant.model_id);
      if (!model) throw Error("Исполнение каталога ссылается на отсутствующую модель");
      const familySeries = series.get(model.series_id), manufacturer = manufacturers.get(familySeries?.manufacturer_id), motor = motors.get(variant.id);
      if (!familySeries || !manufacturer) throw Error("Нарушена связь модели с серией или производителем");
      const issues = [], frequencyHz = number(motor?.frequency_hz), eligibleSets = (sets.get(model.id) ?? []).filter(set => frequencyHz != null && number(set.frequency_hz) === frequencyHz);
      const set = eligibleSets.length === 1 ? eligibleSets[0] : null;
      if (!set) issues.push(eligibleSets.length > 1 ? "Не выбран однозначный набор характеристик исполнения" : "Отсутствует набор характеристик для подтверждённой частоты двигателя");
      const characteristics = {};
      for (const curve of set ? curves.get(set.id) ?? [] : []) {
        const raw = (curvePoints.get(curve.id) ?? []).map(point => [number(point.flow_m3h), number(point.value)]);
        const expectedUnit = { qh:"m", efficiency:"%", power:"kW", npshr:"m" }[curve.kind];
        if (curve.x_unit !== "m3/h" || curve.y_unit !== expectedUnit || !pointsValid(raw)) {
          issues.push("Некорректные точки или единицы характеристики «" + curve.kind + "»");
          continue;
        }
        characteristics[curve.kind] = raw;
      }
      const qh = characteristics.qh ?? [];
      if (!qh.length) issues.push("Нет корректной Q/H-характеристики для гидравлического подбора");
      const knownMedium = ["water","wastewater"].includes(model.medium);
      if (!knownMedium) issues.push("Перекачиваемая среда модели не подтверждена");
      const modelActive = ["source_active","active","approved"].includes(model.lifecycle_status);
      if (!modelActive || model.selection_enabled !== 1) issues.push("Модель не разрешена для подбора в источнике");
      const modelReviews = [...(reviewsByModel.get(model.id) ?? []).filter(row => !row.variant_id), ...(reviewsByVariant.get(variant.id) ?? [])];
      for (const row of modelReviews) issues.push(String(row.category ?? "Данные") + " · " + String(row.message ?? "Требуется уточнение"));
      const connections = ports.get(variant.id) ?? [], inlet = connections.find(port => port.side === "inlet"), outlet = connections.find(port => port.side === "outlet");
      if (number(inlet?.dn) == null || number(outlet?.dn) == null) issues.push("Точный DN патрубков не подтверждён");
      if (number(inlet?.pn_nominal_bar) == null || number(outlet?.pn_nominal_bar) == null) issues.push("Точный PN патрубков не подтверждён");
      if (!(cad.get(model.id) ?? []).some(binding => binding.assembly_approved === 1)) issues.push("CAD-компоновка исполнения не подтверждена");
      const priceRows = (links.get(variant.id) ?? []).map(link => ({ ...prices.get(link.price_id), applicability:link.applicability })).filter(row => row.id);
      const net = priceRows.filter(row => decimal(row.net_amount_decimal) != null);
      const preferredPrices = (net.length ? net : priceRows.filter(row => decimal(row.list_amount_decimal) != null)).sort((a,b) => String(b.source_date ?? "").localeCompare(String(a.source_date ?? "")) || String(a.id).localeCompare(String(b.id)));
      const best = preferredPrices[0], ambiguousPrice = preferredPrices.length > 1 && preferredPrices[0].source_date === preferredPrices[1].source_date;
      const price = best && !ambiguousPrice && ["USD","CNY","RUB"].includes(best.currency) ? { amount:decimal(net.length ? best.net_amount_decimal : best.list_amount_decimal), currency:best.currency, kind:net.length ? "net" : "list" } : null;
      if (!price) issues.push(ambiguousPrice ? "Не выбран однозначный ценовой снимок" : "Подтверждённая цена отсутствует");
      const material = materials.get(variant.material_profile_id ?? model.material_profile_id), rating = (ratings.get(variant.id) ?? []).find(row => row.voltage_v === 380), view = rawViews.get(variant.id);
      const dimension = dimensionsFor(variant, model, issues);
      const pump = {
        id:String(variant.id), manufacturer:String(manufacturer.name), series:String(familySeries.code), group:String(familySeries.code), model:String(model.designation),
        type:["vertical_multistage","horizontal_multistage","end_suction","inline","submersible"].includes(model.pump_type_id) ? model.pump_type_id : "unknown",
        power:number(motor?.power_kw), efficiency:number(model.nominal_efficiency_pct), nominalFlow:number(model.nominal_flow_m3h),
        minFlow:qh.length ? qh[0][0] : null, maxFlow:qh.length ? qh.at(-1)[0] : null, minHead:qh.length ? Math.min(...qh.map(p=>p[1])) : null, maxHead:qh.length ? Math.max(...qh.map(p=>p[1])) : null,
        price:price?.amount ?? null, priceCurrency:price?.currency ?? null, ...(price ? {priceKind:price.kind,discountPercent:number(best.discount_percent)} : {}),
        priceSource:price ? String(best.source_id) + (best.source_date ? " · " + best.source_date : "") : null, source:String(model.source_id), drawing:null,
        curve:qh, ...(characteristics.efficiency ? {efficiencyCurve:characteristics.efficiency} : {}), ...(characteristics.power ? {powerCurve:characteristics.power} : {}), ...(characteristics.npshr ? {npshCurve:characteristics.npshr} : {}),
        ...(knownMedium ? {medium:model.medium} : {}), active:modelActive, selectable:modelActive && model.selection_enabled === 1 && knownMedium && !!set && qh.length >= 2,
        article:String(variant.manufacturer_article), execution:String(variant.designation), dataWarnings:[...new Set(issues)], ratedHead:number(model.nominal_head_m), voltage:rating ? String(rating.voltage_v) : null,
        frequencyHz, speedRpm:number(motor?.speed_rpm), weightKg:number(variant.mass_kg), inletDn:number(inlet?.dn), outletDn:number(outlet?.dn),
        description:material?.description ?? null, availability:availability.get(model.id)?.confirmed_availability ?? null, catalogSource:SOURCE,
        ...(dimension.dimensions ? {dimensions:dimension.dimensions} : {}),
        electric:{powerKw:number(motor?.power_kw),voltageV:number(rating?.voltage_v),currentA:number(rating?.current_a),phaseCount:number(motor?.phase_count),frequencyHz,speedRpm:number(motor?.speed_rpm),protectionClass:motor?.protection_class ?? null,insulationClass:motor?.insulation_class ?? null,efficiencyClass:motor?.efficiency_class ?? null},
        materials:material ? {profileId:material.id,scope:material.scope,description:material.description,components:(materialComponents.get(material.id) ?? []).map(row=>({component:row.component,material:row.material,state:row.state}))} : {},
        inlet:inlet ? {...inlet} : {}, outlet:outlet ? {...outlet} : {},
        mounting:{hasSensors:variant.has_sensors===1 ? true : variant.has_sensors===0 ? false : null,sensorStatus:variant.sensor_status ?? "unknown"},
        fluid:{medium:model.medium ?? null,nominalNpshrM:number(model.nominal_npshr_m),maxWorkingPressureBar:variantPressure.get(variant.id)?.max_working_pressure_bar ?? null,pressureTemperatureCondition:variantPressure.get(variant.id)?.temperature_condition ?? null},
      };
      const sourceIds = [...new Set([model.source_id,variant.source_id,motor?.source_id,set?.source_id,inlet?.source_id,outlet?.source_id,best?.source_id,...dimension.sourceIds].filter(Boolean))];
      return {modelId:String(model.id),variantId:String(variant.id),curveSetId:set?.id ?? null,frequencyHz,pump,issues:[...new Set(issues)],provenance:{
        curveSet:set ? {...set} : null,priceSnapshot:price ? {...best} : null,pricePolicy:"latest unambiguous net snapshot; no repeated discount; unknown dates/prices remain explicit",
        availability:availability.get(model.id) ?? null,sensorStatus:variant.sensor_status ?? "unknown",internalNumber:variant.internal_number ?? null,materialScope:material?.scope ?? "unknown",articleKind:view?.article_kind ?? "unknown",
        curveRecords:set ? (curves.get(set.id) ?? []).map(row=>({id:row.id,kind:row.kind,xUnit:row.x_unit,yUnit:row.y_unit})) : [],
        sources:sourceIds.map(id=>sourceRecords.get(id)).filter(Boolean).map(row=>({id:row.id,archivePath:row.archive_path,jsonPointer:row.json_pointer,sha256:row.record_sha256})),pumpType:types.get(model.pump_type_id) ?? null,
        ...(dimension.evidence ? {dimensions:dimension.evidence} : {}),
      }};
    });
    const issues = [];
    if (metadata.status !== "published") issues.push({code:"catalogue.draft",message:"Источник находится в состоянии «" + (metadata.status ?? "не указан") + "»; полнота данных исполнения проверяется отдельно"});
    if (review.length) issues.push({code:"catalogue.review",message:"Открытых замечаний источника: " + review.length});
    const payload = {sourceId:SOURCE,schemaVersion:metadata.schema_version,sourceStatus:metadata.status ?? "unknown",status:items.length ? "ready" : "empty",items,issues,metadata,archives};
    const id = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    db.exec("COMMIT");
    return {...payload,id,created:new Date().toISOString()};
  } finally { db.close(); }
}

export function nodeCatalogService(path) {
  const registeredPath = resolve(path);
  return async request => {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/snapshot" || url.searchParams.get("source") !== SOURCE || [...url.searchParams.keys()].some(key => key !== "source")) return Response.json({error:"Неизвестный зарегистрированный источник"},{status:400});
    try { return Response.json(readCatalogSnapshot(registeredPath)); }
    catch { return Response.json({error:"Новый каталог насосов недоступен или его схема/связи данных не согласованы"},{status:503}); }
  };
}

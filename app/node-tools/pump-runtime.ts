import type { Step } from "../engineering/engine";
import { withEvaluationProgram } from "../engineering/runtime";
import { coreFilterSelectionCatalog, coreReserveCandidates, coreMeasureCandidates, comparePumpCandidates, type PumpSelectionInput } from "../pump-selection";
import { coreUsablePump } from "../pump-catalog";
import { pumpTypeLabel } from "../pump-filters";
import { MAX_WORKING_PUMPS } from "../pump-counts";
import type { CatalogItem, CatalogSnapshot } from "./catalog-schema";
import { TABLE_COLUMNS, type PumpDataset, type PumpRow, type SelectionProof, type SelectionState } from "./pump-nodes";
import type { Diagnostic, ParameterBinding, ToolContext, Values, View } from "./schema";
const primitiveProgram = {
  version: "node-pump-primitives",
  plans: {},
  args: {}
};
/** Keep these checked primitives independent of the legacy station's active publication. */
const pure = <T,>(run: () => T) => withEvaluationProgram(primitiveProgram, run);
const record = (v: unknown): Values => v && typeof v === "object" && !Array.isArray(v) ? v as Values : {};
const numeric = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown) => typeof v === "string" ? v : "";
function diagnostic(step: Step, message: string, severity: Diagnostic["severity"] = "error", key = ""): Diagnostic {
  return {
    key,
    node: step.id,
    message,
    severity
  };
}
function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical((value as Values)[key])).join(",") + "}";
  return JSON.stringify(value);
}
export function selectionRequestKey(value: unknown): string {
  // A deterministic label, not an authorization token. The server recomputes the whole selection.
  let a = 2166136261,
    b = 0x9e3779b9;
  for (const char of canonical(value)) {
    a = Math.imul(a ^ char.charCodeAt(0), 16777619);
    b = Math.imul(b ^ char.charCodeAt(0), 2246822519);
  }
  return "request-" + (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
function requestIssues(input: unknown): string[] {
  const r = record(input),
    issues: string[] = [];
  if (!numeric(r.flowRate) || r.flowRate <= 0) issues.push("Расход должен быть положительным числом");
  if (!numeric(r.head) || r.head <= 0) issues.push("Напор должен быть положительным числом");
  if (!numeric(r.workingPumpCount) || !Number.isInteger(r.workingPumpCount) || r.workingPumpCount < 1 || r.workingPumpCount > MAX_WORKING_PUMPS) issues.push("Число рабочих насосов должно быть целым от 1 до " + MAX_WORKING_PUMPS);
  if (!numeric(r.staticHead) || r.staticHead < 0 || numeric(r.head) && r.staticHead > r.head) issues.push("Статический напор должен быть от 0 до требуемого напора");
  if (!["water", "wastewater"].includes(text(r.medium))) issues.push("Укажите подтверждённую перекачиваемую среду");
  return issues;
}
function rows(value: unknown): Values[] {
  if (!Array.isArray(value) || value.length > 50000 || value.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw Error("Ожидается список записей, не более 50000 строк");
  return value as Values[];
}
function attribute(row: Values, path: string): unknown {
  if (!path || path.length > 300 || path.split(".").some(key => ["__proto__", "prototype", "constructor"].includes(key))) throw Error("Выберите допустимый атрибут");
  if (Object.hasOwn(row, path)) return row[path];
  return path.split(".").reduce<unknown>((v, key) => v && typeof v === "object" && Object.hasOwn(v, key) ? (v as Values)[key] : undefined, row);
}
function dataset(value: unknown): PumpDataset {
  const result = record(value);
  if (typeof result.snapshotId !== "string" || !Array.isArray(result.rows) || !["catalog", "filtered", "reserved", "measured", "ranked"].includes(text(result.stage))) throw Error("Подключите результат предыдущего этапа подбора");
  rows(result.rows);
  return result as unknown as PumpDataset;
}
function output(dataset: PumpDataset, step: Step): Values {
  return {
    value: dataset,
    items: dataset.rows,
    count: dataset.rows.length,
    issues: dataset.issues.map(message => diagnostic(step, message, dataset.request ? "warning" : dataset.stage === "catalog" ? "warning" : "error"))
  };
}
function rowFor(item: CatalogItem): PumpRow {
  const p = item.pump;
  return {
    id: item.variantId,
    variantId: item.variantId,
    modelId: item.modelId,
    curveSetId: item.curveSetId,
    item,
    measured: false,
    selectable: false,
    manufacturer: p.manufacturer,
    series: p.series,
    type: p.type,
    model: p.model,
    execution: p.execution ?? null,
    article: p.article ?? null,
    power: p.power ?? null,
    frequencyHz: item.frequencyHz,
    inletDn: p.inletDn ?? null,
    outletDn: p.outletDn ?? null,
    pointIssue: item.issues.join(" · ") || null
  };
}
function selectionProof(value: unknown): SelectionProof | null {
  const proof = record(value);
  return ["variantId", "snapshotId", "requestKey"].every(key => typeof proof[key] === "string" && (proof[key] as string).length > 0) ? proof as SelectionProof : null;
}
export function validatePumpSelection(data: PumpDataset, value: unknown, bindingKey = "", node = ""): SelectionState {
  const proof = selectionProof(value),
    id = proof?.variantId ?? null;
  let message = "Исполнение не выбрано",
    valid = false;
  const row = data.rows.find(row => row.variantId === id);
  if (value != null && !proof) message = "Подтверждение выбора повреждено. Выберите исполнение заново";else if (proof?.snapshotId !== data.snapshotId && proof) message = "Выбор относится к другому снимку каталога. Требуется повторное подтверждение";else if (proof?.requestKey !== data.requestKey && proof) message = "Условия или алгоритм изменились. Требуется повторная проверка выбранного насоса";else if (proof && !row) message = "Выбранное исполнение отсутствует в текущих результатах";else if (proof && (!row?.measured || !row.selectable || !row.candidate?.point)) message = "Для выбранного исполнения нет подтверждённой допустимой рабочей точки";else if (proof && row) {
    valid = true;
    message = "Гидравлический выбор подтверждён для текущих условий и снимка каталога";
  }
  return {
    bindingKey,
    node,
    variantId: id,
    snapshotId: data.snapshotId,
    requestKey: data.requestKey,
    request: data.request,
    purchasePriceRub: valid ? row?.candidate?.purchasePriceRub ?? null : null,
    valid,
    stale: value != null && !valid,
    message,
    ...(row ? {
      modelId: row.modelId,
      curveSetId: row.curveSetId
    } : {})
  };
}
function realBinding(value: unknown, proof = false): ParameterBinding {
  const b = record(value);
  if (typeof b.key !== "string" || typeof b.node !== "string" || !b.field || typeof b.field !== "object") throw Error("Подключите действительную привязку параметра");
  const field = (b as unknown as ParameterBinding).field;
  if (proof && (field.kind !== "object" || field.meaning !== "pumpSelectionProof")) throw Error("Выбор насоса требует параметр типа «Подтверждение исполнения»");
  return b as unknown as ParameterBinding;
}
function options(items: Values[], key: string, labelKey = ""): {
  value: string;
  label: string;
}[] {
  const found = new Map<string, string>();
  for (const row of items) {
    const value = attribute(row, key);
    if (value == null || value === "") continue;
    if (!["string", "number", "boolean"].includes(typeof value)) throw Error("Атрибут списка должен быть скалярным");
    const label = labelKey ? attribute(row, labelKey) : value;
    found.set(String(value), label == null ? String(value) : String(label));
  }
  return [...found].map(([value, label]) => ({
    value,
    label
  })).sort((a, b) => a.label.localeCompare(b.label, "ru", {
    numeric: true
  }));
}
function selectedView(data: PumpDataset, b: ParameterBinding, step: Step): SelectionState {
  return validatePumpSelection(data, b.value, b.key, step.id);
}
function tableColumns(v: Values) {
  const presets: Record<string, string[]> = {
    short: ["manufacturer", "model", "execution", "power", "headReservePercent"],
    technical: ["model", "power", "frequencyHz", "headAtRequestedFlow", "flow", "head", "inletDn", "outletDn", "pointIssue"],
    price: ["model", "execution", "purchasePriceRub", "deltaQPercent", "deltaHPercent", "pointIssue"]
  };
  const keys = v.preset === "custom" ? text(v.customColumns).split(",").map(key => key.trim()).filter(Boolean) : presets[text(v.preset)] ?? presets.short;
  if (!keys.length || keys.length > 20 || keys.some(key => !Object.hasOwn(TABLE_COLUMNS, key))) throw Error("Выберите от 1 до 20 известных колонок таблицы");
  return [...new Set(keys)].map(key => ({
    key,
    ...TABLE_COLUMNS[key]
  }));
}

/** Closed registry of synchronous, serializable operations. Network reads are supplied by the host. */
export function executePumpOperation(step: Step, v: Values, context: ToolContext): Values | undefined {
  switch (step.operation) {
    case "pump.catalog":
      {
        if (v.source !== "pump_catalog_v2") throw Error("Неизвестный зарегистрированный каталог");
        const snapshot: CatalogSnapshot | undefined = context.resources?.pump_catalog_v2;
        if (!snapshot) throw Error("Новый каталог насосов ещё не загружен");
        if (!["ready", "empty"].includes(snapshot.status) || !Array.isArray(snapshot.items)) throw Error("Некорректное состояние нового каталога");
        const data: PumpDataset = {
          snapshotId: snapshot.id,
          requestKey: selectionRequestKey({
            catalog: snapshot.id,
            algorithm: context.algorithmVersion ?? "legacy"
          }),
          stage: "catalog",
          request: null,
          filters: {},
          criteria: {},
          rows: snapshot.items.map(rowFor),
          total: snapshot.items.length,
          issues: snapshot.issues.map(issue => issue.message)
        };
        return {
          ...output(data, step),
          snapshotId: snapshot.id
        };
      }
    case "pump.request":
      {
        const settings = record(v.settings),
          source = record(settings[v.contour === "secondary" ? "secondary" : "main"]);
        const value = {
          contour: v.contour === "secondary" ? "secondary" as const : "main" as const,
          flowRate: source.flowRate,
          head: source.head,
          workingPumpCount: source.workingPumpCount,
          medium: source.medium,
          staticHead: v.staticHead
        };
        const issues = requestIssues(value);
        return {
          value: issues.length ? null : value,
          valid: !issues.length,
          flowPerPump: issues.length ? null : (value.flowRate as number) / (value.workingPumpCount as number),
          issues: issues.map(message => diagnostic(step, message))
        };
      }
    case "pump.filter":
      {
        const source = dataset(v.catalog),
          errors = requestIssues(v.request),
          filters = {
            manufacturer: text(v.manufacturer).trim(),
            series: text(v.series).trim(),
            type: text(v.type).trim(),
            search: text(v.search).trim()
          };
        const request = errors.length ? null : v.request as PumpSelectionInput;
        const next: PumpDataset = {
          ...source,
          stage: "filtered",
          request,
          filters,
          criteria: {},
          rows: [],
          issues: errors
        };
        const { contour, ...legacyRequest } = request ?? {};
        next.requestKey = selectionRequestKey({
          snapshot: source.snapshotId,
          algorithm: context.algorithmVersion ?? "legacy",
          // Adding explicit main scope must not invalidate existing main-circuit proofs.
          request: request ? contour === "secondary" ? request : legacyRequest : null,
          filters
        });
        if (!request) return output(next, step);
        const allowed = pure(() => new Set(coreFilterSelectionCatalog(source.rows.map(row => row.item.pump), request, {
          manufacturer: filters.manufacturer,
          series: filters.series,
          type: filters.type
        }).map(pump => pump.id)));
        const search = filters.search.toLocaleLowerCase();
        next.rows = source.rows.filter(row => allowed.has(row.variantId) && (!search || [row.model, row.execution, row.article, row.manufacturer, row.series].some(value => text(value).toLocaleLowerCase().includes(search))));
        next.total = next.rows.length;
        const unusable = source.rows.filter(row => !pure(() => coreUsablePump(row.item.pump, request.medium))).length;
        if (unusable) next.issues.push("Записей, исключённых по активности, среде или некорректной Q/H-кривой: " + unusable);
        return output(next, step);
      }
    case "pump.reserve":
      {
        const source = dataset(v.candidates),
          minimum = v.minimum;
        if (!numeric(minimum)) throw Error("Минимальный запас должен быть конечным числом");
        const next: PumpDataset = {
          ...source,
          stage: "reserved",
          rows: [],
          criteria: {
            ...source.criteria,
            minimumHeadReservePercent: minimum
          }
        };
        next.requestKey = selectionRequestKey({
          previous: source.requestKey,
          minimum
        });
        if (!source.request) return output(next, step);
        const candidates = pure(() => coreReserveCandidates(source.rows.map(row => row.item.pump), source.request!, minimum));
        next.rows = candidates.flatMap(candidate => {
          const row = source.rows.find(row => row.variantId === candidate.pump.id);
          return row ? [{
            ...row,
            candidate: candidate as PumpRow["candidate"],
            headAtRequestedFlow: candidate.headAtRequestedFlow,
            headReservePercent: candidate.headReservePercent
          }] : [];
        });
        next.total = next.rows.length;
        return output(next, step);
      }
    case "pump.measure":
      {
        const source = dataset(v.candidates),
          next: PumpDataset = {
            ...source,
            stage: "measured",
            rows: []
          };
        if (!source.request) return output(next, step);
        if (source.stage !== "reserved") throw Error("Перед оценкой рабочей точки подключите проверку напора");
        const pricing = record(v.pricing),
          discounts = {
            ...record(pricing.manufacturerDiscounts)
          };
        for (const [key, value] of Object.entries(pricing)) if (key.startsWith("discount_") && numeric(value)) discounts[key.slice(9)] = value;
        const settings = {
          usdRate: numeric(pricing.usdRate) ? pricing.usdRate : NaN,
          cnyRate: numeric(pricing.cnyRate) ? pricing.cnyRate : NaN,
          manufacturerDiscounts: discounts as {
            cnp: number;
            aquastrong: number;
          }
        };
        const evaluated = pure(() => coreMeasureCandidates(source.rows.map(row => ({
          pump: row.item.pump,
          headAtRequestedFlow: row.headAtRequestedFlow as number,
          headReservePercent: row.headReservePercent as number
        })), source.request!, settings));
        next.requestKey = selectionRequestKey({
          previous: source.requestKey,
          algorithm: context.algorithmVersion ?? "legacy",
          // Commit to the actual commercial result. Unused currencies and discounts
          // for net prices do not invalidate an otherwise identical confirmation.
          purchasePrices: evaluated.map(candidate => ({
            variantId: candidate.pump.id,
            purchasePriceRub: candidate.purchasePriceRub
          })).sort((a, b) => a.variantId.localeCompare(b.variantId))
        });
        next.rows = evaluated.flatMap(candidate => {
          const row = source.rows.find(row => row.variantId === candidate.pump.id);
          return row ? [{
            ...row,
            candidate,
            measured: true,
            selectable: candidate.point !== null,
            headAtRequestedFlow: candidate.headAtRequestedFlow,
            headReservePercent: candidate.headReservePercent,
            purchasePriceRub: candidate.purchasePriceRub,
            flow: candidate.point?.flow ?? null,
            head: candidate.point?.head ?? null,
            deltaQPercent: candidate.point?.deltaQPercent ?? null,
            deltaHPercent: candidate.point?.deltaHPercent ?? null,
            pointIssue: [candidate.pointIssue, ...row.item.issues].filter(Boolean).join(" · ") || null
          }] : [];
        });
        next.total = next.rows.length;
        return output(next, step);
      }
    case "pump.rank":
      {
        const source = dataset(v.candidates);
        if (!["measured", "ranked"].includes(source.stage) && source.request) throw Error("Подключите оценённые рабочие точки кандидатов");
        if (!Number.isInteger(v.limit) || v.limit as number < 1 || v.limit as number > 1000) throw Error("Количество строк должно быть целым от 1 до 1000");
        const ranked = [...source.rows].sort((a, b) => a.candidate && b.candidate ? comparePumpCandidates(a.candidate, b.candidate, v.mode === "price" ? "price" : "distance") : a.variantId.localeCompare(b.variantId));
        return output({
          ...source,
          stage: "ranked",
          rows: ranked.slice(0, v.limit as number),
          total: ranked.length
        }, step);
      }
    case "pump.options":
      {
        const source = dataset(v.catalog),
          key = text(v.attribute),
          type = text(v.type).trim(),
          manufacturer = text(v.manufacturer).trim();
        if (!["manufacturer", "series", "type"].includes(key)) throw Error("Выберите атрибут справочника");
        const filtered = source.rows.filter(row => (!type || row.type === type) && (!manufacturer || row.manufacturer === manufacturer));
        return {
          options: options(filtered, key).map(option => ({
            ...option,
            label: key === "type" ? pumpTypeLabel(option.value) : option.label
          }))
        };
      }
    case "ui.select":
      {
        const b = realBinding(v.binding),
          choices = rows(v.options).map(row => ({
            value: text(row.value),
            label: text(row.label)
          }));
        const clearBindings = [v.clear0, v.clear1].filter(value => value != null).map(value => realBinding(value));
        const resets = new Set<string>();
        for (const target of clearBindings) {
          if (target.node === b.node || target.key === b.key && target.toolId === b.toolId) throw Error("Параметр не может сбрасывать собственное значение");
          if (target.toolId !== b.toolId) throw Error("Зависимый параметр должен принадлежать тому же инструменту");
          if ((target.mode ?? "user") !== "user" || target.field.required) throw Error("Сбрасывать можно только необязательный параметр пользовательского ввода");
          if (b.editable && !target.editable) throw Error("Сброс зависимого параметра недоступен для текущей роли");
          const key = target.node + ":" + target.key;
          if (resets.has(key)) throw Error("Зависимый параметр подключён для сброса повторно");
          resets.add(key);
        }
        const compatibleClearValues: Record<string, Record<string, string[]>> = {};
        const cascade = text(v.cascadeAttribute);
        if (v.cascadeCatalog && ["type", "manufacturer"].includes(cascade)) {
          const catalog = dataset(v.cascadeCatalog);
          for (const choice of ["", ...choices.map(o => o.value)]) {
            const type = cascade === "type" ? choice : text(v.cascadeType);
            const typed = catalog.rows.filter(row => !type || row.type === type);
            const manufacturers = [...new Set(typed.map(row => text(row.manufacturer)))];
            const manufacturer = cascade === "manufacturer" ? choice : manufacturers.includes(text(clearBindings[0]?.value)) ? text(clearBindings[0]?.value) : "";
            const series = [...new Set(typed.filter(row => !manufacturer || row.manufacturer === manufacturer).map(row => text(row.series)))];
            compatibleClearValues[choice] = Object.fromEntries(clearBindings.map((target, index) => [target.key, cascade === "type" && index === 0 ? manufacturers : series]));
          }
        }
        if (!["string", "enum"].includes(b.field.kind)) throw Error("Динамический список требует строковый параметр");
        const issues = b.active && b.value != null && b.value !== "" && !choices.some(option => option.value === b.value) ? [diagnostic(step, "Выбранный вариант отсутствует в текущем источнике", "error", b.key)] : [];
        return {
          value: {
            kind: "select",
            node: step.id,
            label: text(v.label),
            hint: text(v.emptyLabel) || "Все",
            binding: b,
            options: choices,
            ...(clearBindings.length ? { clearBindings } : {}),
            ...(Object.keys(compatibleClearValues).length ? { compatibleClearValues } : {}),
            showOrigin: v.showOrigin !== false,
            issues
          } satisfies View,
          issues
        };
      }
    case "pump.select":
      {
        const data = dataset(v.candidates),
          b = realBinding(v.binding, true),
          selection = selectedView(data, b, step),
          row = selection.valid ? data.rows.find(row => row.variantId === selection.variantId) : undefined;
        return {
          value: row?.item ?? null,
          selection,
          valid: selection.valid,
          issues: selection.stale ? [diagnostic(step, selection.message, "warning", b.key)] : []
        };
      }
    case "pump.table":
      {
        const data = dataset(v.candidates),
          b = realBinding(v.binding, true),
          selection = selectedView(data, b, step),
          issues = selection.stale ? [diagnostic(step, selection.message, "warning", b.key)] : [];
        return {
          value: {
            kind: "table",
            node: step.id,
            label: text(v.title) || "Результаты подбора",
            binding: b,
            rows: data.rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !["item", "candidate"].includes(key)))),
            columnsSpec: tableColumns(v),
            total: data.total,
            selection,
            hint: !data.request ? "Заполните корректные условия подбора" : data.rows.length ? "" : "Подходящих насосов в этом снимке каталога не найдено",
            issues
          } satisfies View,
          issues
        };
      }
    case "pump.card":
      {
        const item = record(v.item) as unknown as CatalogItem,
          state = record(v.selection) as unknown as SelectionState;
        const valid = state.valid === true && !!item.pump;
        return {
          value: {
            kind: "pump-card",
            node: step.id,
            label: valid ? item.pump.manufacturer + " · " + (item.pump.execution ?? item.pump.model) : "Насос не подтверждён",
            rows: valid ? [{
              ...Object.fromEntries(Object.entries(rowFor(item)).filter(([key]) => key !== "item")),
              ...record(v.selection),
              curvePoints: item.pump.curve.map(([flow, head]) => ({ flow, head }))
            }] : [],
            selection: state,
            hint: valid ? item.issues.join(" · ") : state.message || "Выберите исполнение в таблице"
          } satisfies View
        };
      }
    case "collection.filter":
      {
        const source = rows(v.items),
          kind = text(v.valueType),
          comparison = kind === "number" ? v.number : kind === "boolean" ? v.flag : text(v.text),
          key = text(v.attribute);
        const filtered = source.filter(row => {
          const value = attribute(row, key);
          if (value == null) return false;
          if (typeof value !== typeof comparison) return false;
          switch (v.operator) {
            case "eq":
              return value === comparison;
            case "contains":
              return typeof value === "string" && typeof comparison === "string" && value.toLocaleLowerCase().includes(comparison.toLocaleLowerCase());
            case "gt":
              return numeric(value) && numeric(comparison) && value > comparison;
            case "gte":
              return numeric(value) && numeric(comparison) && value >= comparison;
            case "lt":
              return numeric(value) && numeric(comparison) && value < comparison;
            case "lte":
              return numeric(value) && numeric(comparison) && value <= comparison;
            default:
              throw Error("Неизвестное условие фильтра");
          }
        });
        return {
          value: filtered,
          items: filtered,
          before: source.length,
          count: filtered.length
        };
      }
    case "collection.sort":
      {
        const key = text(v.attribute),
          direction = v.direction === "desc" ? -1 : 1;
        const items = rows(v.items).map((row, index) => ({
          row,
          index,
          value: attribute(row, key)
        })).sort((a, b) => {
          if (a.value == null || b.value == null) return a.value == null && b.value == null ? a.index - b.index : a.value == null ? 1 : -1;
          if (typeof a.value !== typeof b.value || !["number", "string", "boolean"].includes(typeof a.value)) throw Error("Сортировка требует одинаковый скалярный тип атрибута");
          const result = typeof a.value === "number" ? a.value - (b.value as number) : String(a.value).localeCompare(String(b.value), "ru", {
            numeric: true
          });
          return result * direction || a.index - b.index;
        }).map(item => item.row);
        return {
          value: items,
          items
        };
      }
    case "collection.limit":
      {
        const source = rows(v.items);
        if (!Number.isInteger(v.limit) || v.limit as number < 1 || v.limit as number > 1000) throw Error("Количество строк должно быть целым от 1 до 1000");
        return {
          value: source.slice(0, v.limit as number),
          items: source.slice(0, v.limit as number),
          total: source.length
        };
      }
    case "collection.lookup":
      return {
        value: rows(v.items).find(row => attribute(row, text(v.attribute)) === v.id) ?? null
      };
    case "collection.options":
      return {
        options: options(rows(v.items), text(v.attribute), text(v.labelAttribute))
      };
    case "collection.number":
    case "collection.string":
    case "collection.boolean":
      {
        const value = attribute(record(v.record), text(v.attribute)),
          kind = step.operation.slice(11);
        if (value != null && (typeof value !== kind || kind === "number" && !numeric(value))) throw Error("Атрибут не соответствует ожидаемому типу «" + kind + "»");
        return {
          value: value ?? null
        };
      }
    default:
      return undefined;
  }
}

import type { Trace } from "./engine";
import type { SpecItem } from "../project-config";
type RowChange = {
  node: string;
  fields: string[];
};
export type RowHistory = {
  row: string;
  changes: RowChange[];
};
export const rowIdentity = (row: SpecItem) => [row.assemblyRole ?? "", row.option ?? "", row.equipmentId ?? "", row.name].join(" · ");
function items(value: unknown): SpecItem[] | undefined {
  const v = value as {
    items?: SpecItem[];
    next?: {
      entities?: Record<string, {
        items?: SpecItem[];
      }>;
    };
    entities?: Record<string, {
      items?: SpecItem[];
    }>;
  } | undefined;
  return v?.items ?? v?.next?.entities?.["station-spec"]?.items ?? v?.entities?.["station-spec"]?.items;
}
export function rowHistory(trace: Trace) {
  const previous = new Map<string, SpecItem>(),
    result = new Map<string, RowHistory>();
  const inspect = (rows: SpecItem[], node: string) => {
    for (const row of rows) {
      const key = rowIdentity(row),
        old = previous.get(key);
      const fields: string[] = [];
      if (!old) fields.push("Комплектующее");
      if (!old || old.quantity !== row.quantity) fields.push("Количество");
      if (!old || old.price !== row.price || old.listPrice !== row.listPrice) fields.push("Цена");
      if (!old || old.status !== row.status || old.technicalStatus !== row.technicalStatus) fields.push("Готовность");
      if (fields.length) {
        const event = result.get(key) ?? {
          row: key,
          changes: []
        };
        event.changes.push({
          node,
          fields
        });
        result.set(key, event);
      }
      previous.set(key, row);
    }
  };
  const original = items(trace.source?.outputs.project);
  if (original) inspect(original, "source");
  for (const [node, record] of Object.entries(trace)) {
    if (!node.endsWith("/result") || !Object.hasOwn(record.inputs, "value")) continue;
    const rows = items(record.inputs.value);
    if (Array.isArray(rows)) inspect(rows, node);
  }
  return [...result.values()];
}
// Limit data sent for repeated intermediate catalogue references. Execution keeps full values.
export function summarizeTrace(trace: Trace): Trace {
  const summarize = (value: unknown, depth: number): unknown => {
    if (Array.isArray(value)) return value.length > 16 ? {
      count: value.length,
      sample: value.slice(0, 3).map(v => summarize(v, depth + 1))
    } : depth >= 3 ? {
      count: value.length
    } : value.map(v => summarize(v, depth + 1));
    if (value && typeof value === "object") {
      const rec = value as Record<string, unknown>;
      if (depth >= 3) return rec.name ?? rec.id ?? {
        fields: Object.keys(rec).slice(0, 8)
      };
      return Object.fromEntries(Object.entries(rec).slice(0, 32).map(([k, v]) => [k, summarize(v, depth + 1)]));
    }
    return value;
  };
  return Object.fromEntries(Object.entries(trace).map(([key, t]) => [key, {
    ...t,
    inputs: Object.fromEntries(Object.entries(t.inputs).map(([k, v]) => [k, summarize(v, 0)])),
    outputs: Object.fromEntries(Object.entries(t.outputs).map(([k, v]) => [k, summarize(v, 0)]))
  }]));
}

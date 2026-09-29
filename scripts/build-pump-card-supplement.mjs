import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;

// The browser projection omits older dimensions and some execution-specific facts.
// Export only the relevant evidence, retaining the link to the same pump ID.
export function pumpCardSupplement(pump, evidence) {
  const result = {};
  for (const source of [...(evidence.sources ?? [])].reverse()) {
    const record = source.record;
    for (const [key, sourceKey] of [["weightKg", "weight_kg"], ["inletDn", "inlet_dn"], ["outletDn", "outlet_dn"]]) {
      if (!positive(pump[key]) && !positive(result[key]) && positive(record[sourceKey])) result[key] = record[sourceKey];
    }
    const variants = record.variants ?? [];
    // Never substitute a different execution when a specific one was selected.
    const relevant = pump.execution ? variants.filter(v => v.designation === pump.execution) : variants;
    if (relevant.length) {
      if (!positive(pump.weightKg) && !positive(result.weightKg) && relevant.every(v => positive(v.weight_kg))) {
        const weights = [...new Set(relevant.map(v => v.weight_kg))];
        if (weights.length === 1) result.weightKg = weights[0];
        else result.weightVariants = relevant.map(v => ({ execution: v.designation, kg: v.weight_kg }));
      }
      const connections = [...new Set(relevant.map(v => v.connection_designation).filter(Boolean))];
      if (connections.length) result.connectionVariants = connections;
    }
  }
  const legacy = evidence.legacySqlite;
  if (!positive(pump.weightKg) && !positive(result.weightKg) && !result.weightVariants) {
    const weight = legacy?.pump_dimensions?.find(d => d.dimension_key === "mass" && d.unit === "kg");
    if (positive(weight?.value_num)) result.weightKg = weight.value_num;
  }
  // These are alternative connections, not independent suction/discharge facts.
  if (!result.connectionVariants && !pump.inlet && !pump.outlet && !pump.connectionSourceValue) {
    const connections = legacy?.pump_connections?.map(c => `${c.source_header}: ${c.connection_value}`);
    if (connections?.length) result.connectionVariants = connections;
  }
  return result;
}

async function main() {
  const root = new URL("../", import.meta.url);
  const [pumps, records] = await Promise.all(["public/pumps.json", "data/pump-catalog/records.json"].map(async path =>
    JSON.parse(await readFile(new URL(path, root), "utf8"))));
  const result = Object.fromEntries(pumps.map(p => [p.id, pumpCardSupplement(p, records[p.id] ?? {})]).filter(([, value]) => Object.keys(value).length));
  await writeFile(new URL("app/pump-card-supplement.json", root), JSON.stringify(result) + "\n");
  console.log(`Pump card supplement: ${Object.keys(result).length} models`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

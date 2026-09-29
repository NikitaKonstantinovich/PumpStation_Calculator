import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
const threadDn = { "1/4": 8, "3/8": 10, "1/2": 15, "3/4": 20, "1": 25, "11/4": 32, "11/2": 40, "2": 50, "21/2": 65, "3": 80, "4": 100 };
export function parseNozzleSize(value) {
  const raw = String(value ?? "").trim();
  // DN alternatives still identify a flange, but must not silently select a size.
  if (/^DN\s*\d+(?:\s*\/\s*(?:DN\s*)?\d+)*$/i.test(raw)) {
    const sizes = [...new Set(raw.match(/\d+/g).map(Number))];
    return { dn: sizes.length === 1 && sizes[0] > 0 ? sizes[0] : null, connection: "flanged" };
  }
  const thread = raw.replaceAll("¼", "1/4").replaceAll("½", "1/2").replaceAll("¾", "3/4")
    .replace(/[\s\\"″“”]/g, "").match(/^(?:G|Rp|Rc|R)(\d+(?:\/\d+)?)$/i);
  return thread ? { dn: threadDn[thread[1]] ?? null, connection: "threaded" } : { dn: null, connection: null };
}

// Explicit connection metadata wins (e.g. G may describe a mating thread on an
// explicitly flanged nozzle). Otherwise use the project's DN => flange / G =>
// thread convention. Never infer a connection from a bare DIN standard.
export function catalogNozzle(pump, side) {
  const nested = pump[side] ?? {};
  const label = side === "inlet" ? "Всасывающий патрубок" : "Напорный патрубок";
  const raw = pump.connectionSourceValue?.[side] ?? pump.mounting?.[side === "inlet" ? "Размер всасывающего патрубка" : "Размер напорного патрубка"]
    ?? (side === "outlet" ? pump.mounting?.["Напорный патрубок"] : undefined);
  const parsed = parseNozzleSize(raw);
  const dn = [nested.dn, pump[side === "inlet" ? "inletDn" : "outletDn"], parsed.dn].find(positive) ?? null;
  const explicitType = String(nested.type ?? "").toLowerCase();
  let connection = ["flange", "flanged"].includes(explicitType) ? "flanged"
    : ["thread", "threaded"].includes(explicitType) ? "threaded" : null;
  connection ??= parsed.connection;
  const standard = String(pump.mounting?.["Стандарт трубного соединения"] ?? "");
  if (!connection && (dn || raw) && /фланец/i.test(standard)) connection = "flanged";
  const physicalSource = String(pump.physicalDataSources?.[label] ?? "");
  // Numeric fields named dn/inletDn/outletDn also carry an explicit DN size.
  if (!connection && dn) connection = "flanged";
  const pressure = String(nested.pressure_class ?? "").match(/^PN\s*(\d+)$/i);
  if (!dn && !connection) return null;
  return { dn, connection, maxPressure: pressure ? Number(pressure[1]) : null,
    source: [physicalSource || pump.source || "База насосов", raw ? String(raw) : null].filter(Boolean).join(" · ") };
}

async function main() {
  const root = new URL("../", import.meta.url);
  const pumps = JSON.parse(await readFile(new URL("public/pumps.json", root), "utf8"));
  const result = Object.fromEntries(pumps.map(p => [p.id, { inlet: catalogNozzle(p, "inlet"), outlet: catalogNozzle(p, "outlet") }])
    .filter(([, ports]) => ports.inlet || ports.outlet));
  await writeFile(new URL("app/pump-nozzles.json", root), JSON.stringify(result) + "\n");
  console.log(`Pump nozzle index: ${Object.keys(result).length} models`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

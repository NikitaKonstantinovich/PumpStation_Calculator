import type { ProjectConfig, SettingsEntity } from "./project-config";
import type { CollectorsEntity } from "./collector-project";
import { hydraulicPortLedger, type HydraulicPort, type HydraulicPortUse, type CollectorInstrumentPort } from "./hydraulic-port-ledger";
import { instrumentCount } from "./hydraulic-option-config";

export function hydraulicPortLabel(id: string): string {
  const [side, position] = id.split(":");
  const collector = side === "suction" ? "всасывающий коллектор" : "напорный коллектор";
  if (position === "tank") return `${collector}, отвод бака`;
  if (position === "end-2") return `${collector}, свободный торец`;
  const kip = position?.match(/^kip-(\d+)\/sensor$/);
  if (kip) return `${collector}, боковой порт крана КИП №${kip[1]}`;
  const gap = position?.match(/^between-(\d+)-(\d+)$/);
  if (gap) return `${collector}, между насосами ${gap[1]} и ${gap[2]}`;
  return id;
}

export function stationCollectorInstrumentPorts(settings: SettingsEntity, side: "suction" | "discharge"): CollectorInstrumentPort[] {
  const ports: CollectorInstrumentPort[] = Array.from({ length: instrumentCount(settings) }, (_, i) => ({ id: `kip-${i + 1}`, dn: 15, state: "occupied" }));
  if (side === "discharge" && settings.membraneTank) ports.push({ id: "tank", dn: settings.membraneTankVolume === 8 ? 20 : 25, state: "occupied" });
  return ports;
}
/** One collector outlet feeds a shared LD valve. Instruments own distinct
 * outlets of that valve, not the same welded sgon. Factory drain caps remain
 * part of the valve; no purchased cap is added to an occupied collector port. */
export function stationHydraulicPortLedger(project: ProjectConfig) {
  const settings = project.entities["station-settings"] as SettingsEntity, collectors = project.entities["station-collectors"] as CollectorsEntity;
  const ports: HydraulicPort[] = [], uses: HydraulicPortUse[] = [], requiredFindings: string[] = [];
  const add = (port: HydraulicPort, owner: string, purpose: HydraulicPortUse["purpose"] = "equipment") => {
    ports.push(port); uses.push({ portId: port.id, owner, purpose, dn: port.dn, pn: port.pn, connection: port.connection });
  };
  for (const side of ["suction", "discharge"] as const) {
    const c = collectors[side].configuration;
    if (!c) continue;
    for (const required of stationCollectorInstrumentPorts(settings, side)) {
      const actual = c.instrumentPorts?.find(port => port.id === required.id);
      if (!actual || actual.state !== "occupied" || actual.dn !== required.dn) requiredFindings.push(`${side === "suction" ? "Всас" : "Напор"}: подключению ${required.id === "tank" ? "бака" : `КИП №${required.id.slice(4)}`} нужен занятый отвод DN${required.dn}; согласуйте отвод коллектора и присоединение узла.`);
    }
    const base = { side, section: "collector", pn: c.pn };
    for (const i of [1, 2]) add({ ...base, id: `${side}:end-${i}`, dn: c.dn ?? 0, connection: c.connection }, i === 2 && settings.collectorPlugs ? `${side}:plug` : `${side}:network-${i}`, i === 2 && settings.collectorPlugs ? "closure" : "network");
    for (const port of c.instrumentPorts ?? []) {
      const id = `${side}:${port.id}`;
      if (port.state === "capped") {
        add({ ...base, id, dn: port.dn, connection: "threaded" }, `${id}/reserve-cap`, "closure");
        continue;
      }
      if (port.state === "open" || !(port.id === "tank" && side === "discharge" && settings.membraneTank || Array.from({ length: instrumentCount(settings) }, (_, i) => `kip-${i + 1}`).includes(port.id))) {
        ports.push({ ...base, id, dn: port.dn, connection: "threaded" });
        continue;
      }
      add({ ...base, id, dn: port.dn, connection: "threaded" }, port.id === "tank" ? "discharge:tank" : `${id}/valve`);
      if (port.id === "tank") continue;
      add({ ...base, section: id, id: `${id}/gauge`, dn: 15, connection: "threaded" }, `${id}/gauge-assembly`);
      add({ ...base, section: id, id: `${id}/sensor`, dn: 8, connection: "threaded" }, `${id}/${side === "suction" ? "relay" : "transducer"}-assembly`);
      add({ ...base, section: id, id: `${id}/drain-cap`, dn: 8, connection: "threaded" }, `${id}/factory-cap`, "closure");
    }
    for (let i = 1; i <= (c.sectionBreaks ?? 0); i++) for (const end of ["left", "right"]) add({ ...base, section: `between-${i}-${i + 1}`, id: `${side}:between-${i}-${i + 1}/${end}`, dn: c.dn ?? 0, connection: "flanged" }, `${side}:separator-${i}`);
  }
  const ledger = hydraulicPortLedger(ports, uses);
  return { ...ledger, findings: [...ledger.findings, ...requiredFindings], complete: ledger.complete && requiredFindings.length === 0 };
}

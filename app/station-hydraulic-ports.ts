import type { ProjectConfig, SettingsEntity } from "./project-config";
import type { CollectorsEntity } from "./collector-project";
import { hydraulicPortLedger, type HydraulicPort, type HydraulicPortUse, type CollectorInstrumentPort } from "./hydraulic-port-ledger";
import { instrumentCount } from "./hydraulic-option-config";
import { collectorNippleRules } from "./base-values";
import { resolveNippleRule } from "./collector-nipple-rules";
import type { CollectorConfiguration } from "./collector-calculations";

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

export function resolveStationCollectorInstrumentPorts(settings: SettingsEntity, side: "suction" | "discharge", collector?: Pick<CollectorConfiguration, "material" | "secondary" | "stationType" | "jockey" | "dn" | "pn">) {
  const twoCircuits = collector ? Boolean(collector.secondary && (collector.stationType === "combined" || collector.stationType === "fire" && collector.jockey)) : settings.stationType === "combined" || settings.stationType === "fire" && settings.jockeyPump;
  const value=collectorNippleRules(settings.baseValues?.values),resolution=resolveNippleRule(value,{side,material:collector?.material??"aisi304",circuits:twoCircuits?2:1,stationType:settings.stationType,pn:collector?.pn??16,dn:collector?.dn??null,tank:settings.membraneTank});
  const ports:CollectorInstrumentPort[]=[],sequence={instrument:0,tank:0,reserve:0},parameterized="version" in value;
  for(const output of resolution.outputs)for(let i=0;i<output.quantity;i++){
    const n=++sequence[output.purpose],id=output.purpose==="instrument"?`kip-${n}`:output.purpose==="tank"?n===1?"tank":`tank-${n}`:`reserve-${n}`;
    const occupied=output.purpose==="instrument"?n<=instrumentCount(settings):output.purpose==="tank"&&side==="discharge"&&settings.membraneTank&&n===1;
    ports.push({id,dn:output.dn,state:output.state==="auto"?occupied?"occupied":"capped":output.state,...(parameterized?{lengthMm:output.lengthMm,threaded:output.threaded,...(output.threadPitchMm?{threadPitchMm:output.threadPitchMm}:{}),...(output.threadLengthMm?{threadLengthMm:output.threadLengthMm}:{})}:{})});
  }
  return {ports,error:resolution.error};
}
export const stationCollectorInstrumentPorts=(settings:SettingsEntity,side:"suction"|"discharge",collector?:Parameters<typeof resolveStationCollectorInstrumentPorts>[2])=>resolveStationCollectorInstrumentPorts(settings,side,collector).ports;
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
    const requiredPorts = stationCollectorInstrumentPorts(settings, side, c);
    for (const required of requiredPorts) {
      const actual = c.instrumentPorts?.find(port => port.id === required.id);
      if (!actual || actual.state !== required.state || actual.dn !== required.dn) requiredFindings.push(`${side === "suction" ? "Всас" : "Напор"}: отвод ${required.id === "tank" ? "бака" : `КИП №${required.id.slice(4)}`} должен иметь DN${required.dn} и состояние ${required.state === "occupied" ? "занят оборудованием" : "закрыт заглушкой"}; согласуйте отвод коллектора и присоединение узла.`);
      if(required.state==="occupied"&&required.threaded===false&&/^(kip-\d+|tank)$/.test(required.id))requiredFindings.push(`${side === "suction" ? "Всас" : "Напор"}: отвод ${required.id} задан без резьбы, а выбранное оборудование имеет резьбовое подключение. Подтвердите переходный узел.`);
    }
    for(let i=0;i<instrumentCount(settings);i++){const port=requiredPorts.find(p=>p.id===`kip-${i+1}`);if(!port||port.dn!==15||port.state!=="occupied")requiredFindings.push(`${side === "suction" ? "Всас" : "Напор"}: для комплекта КИП №${i+1} нужен занятый отвод DN15 или отдельно рассчитанный распределительный/переходный узел; параметры сгонов автоматически не меняются.`);}
    if(side==="discharge"&&settings.membraneTank){const tank=requiredPorts.find(p=>p.id==="tank"),dn=settings.membraneTankVolume===8?20:25;if(!tank||tank.dn!==dn||tank.state!=="occupied")requiredFindings.push(`Напор: баку требуется занятое подключение DN${dn}; ${tank?`задан сгон DN${tank.dn}`:"отвод отсутствует"}. Требуется согласованное подключение или переход.`);}
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

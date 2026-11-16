import { engineeringOperation, registerOperation } from "./engineering/runtime";
import imported from "../data/hydraulic-v11-source.json";
import type { AssemblyComponent } from "./suction-catalog";
import type { HydraulicProductAssessment } from "./hydraulic-option-selection";

export const TRANSDUCER_SELECTION_REVISION = "oni-two-priced-variants-v2";
export const TRANSDUCER_16_ID = "station-v11-oni-ppt10-16";
export const TRANSDUCER_25_ID = "station-v11-oni-ppt10-25";
export const TRANSDUCER_HEAD_LIMIT_M = 160;
export const isPressureTransducer = (item: Pick<AssemblyComponent,"family">) => /преобразоват.*давлен/i.test(item.family);
export const automaticTransducerId = (headM: number | null) => headM !== null && Number.isFinite(headM) && headM > TRANSDUCER_HEAD_LIMIT_M ? TRANSDUCER_25_ID : TRANSDUCER_16_ID;

/** The original import remains historical evidence. The live catalogue exposes
 * only the two ONI variants explicitly retained by the station owner. */
export function pressureTransducerCatalog(items: AssemblyComponent[]): AssemblyComponent[] {
  const allowed = new Set([TRANSDUCER_16_ID,TRANSDUCER_25_ID]);
  return [...items.filter(item=>!isPressureTransducer(item)&&!allowed.has(item.id)),...imported.items.filter(item=>allowed.has(item.id))];
}

/** The owner-approved two-variant rule is complete: generic passport/PN
 * confirmation must not unset a priced product selected by that rule. */
export function coreSelectAutomaticTransducer(items: AssemblyComponent[], headM: number | null) {
  const selectedId=automaticTransducerId(headM);
  const candidates:HydraulicProductAssessment[]=pressureTransducerCatalog(items).filter(isPressureTransducer).map(item=>({item,missing:[],incompatible:[],technicalStatus:"ready"}));
  return {selected:candidates.find(c=>c.item.id===selectedId)!,candidates,missingSelection:false,
    explanation:`Автоматический подбор ONI PPT10: до 160 м включительно — 16 бар, выше — 25 бар. Питание от шкафа управления.`};
}

export function automaticTransducerSummary(item:AssemblyComponent){
  const bar=item.id===TRANSDUCER_25_ID?25:16;
  const article=bar===25?"PPT-G-ST-025-4-20-1-1":"PPT-G-ST-016-4-20-1-1";
  return `ONI PPT10 · ${article} · 0–${bar} бар · G1/4 НР · 4–20 мА · питание от ШУ`;
}

export function selectAutomaticTransducer(...args: Parameters<typeof coreSelectAutomaticTransducer>): ReturnType<typeof coreSelectAutomaticTransducer> {
  return engineeringOperation("selectAutomaticTransducer", coreSelectAutomaticTransducer, args);
}

registerOperation("selectAutomaticTransducer", ["items","headM"], coreSelectAutomaticTransducer);

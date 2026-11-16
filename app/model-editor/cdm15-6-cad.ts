import type { Pump } from "../pump-catalog";
import type { PumpProfile } from "./model";

export const CDM15_6_ARTICLE_ID = "CNP:CDM:1100092321";
const hash = "31742b8f22bd38f7c461a1690c56e08ac647c55937bf1d2c9cba2a89a9c68408";
export const CDM15_6_CAD_NOTE = "Компоновочный STEP CDM15-6FSWPC: основание и патрубки сверены. В STEP двигатель YE2 5,5 кВт, в каталоге выбран IE3; высота STEP 1048 мм, в каталоге 1055 мм.";
const profile: PumpProfile = {
  pumpId: CDM15_6_ARTICLE_ID,
  key: "pump:" + CDM15_6_ARTICLE_ID,
  source: "Equipment/Pumps/3D_Normalized/models/vertical_multistage/CNP/CDM/CDM15-6__256/_check_execution/CDM(F)15-6 FSWP(S_L)C__INLET_ZERO_Z_UP.step",
  sourceHash: hash,
  meshUrl: "/model-assets/model-" + hash + "-v1.stl",
  bounds: [0, -145.0000001, -90.0000001, 340.0000001, 145.0000001, 958],
  ports: [
    { id: "inlet", point: [0,0,0], axis: [-1,0,0], provisional: true },
    { id: "outlet", point: [300,0,0], axis: [1,0,0], provisional: true },
  ],
  mapping: "reviewed_mounting_reference",
  warnings: [CDM15_6_CAD_NOTE],
};

/** Only the execution whose STEP mounting was reviewed. The old model ID alone is insufficient. */
export function cdm15_6CadProfile(pump: Pump): PumpProfile | undefined {
  if (pump.id === CDM15_6_ARTICLE_ID && pump.manufacturer === "CNP" && pump.series === "CDM" &&
      pump.article === "1100092321" && pump.execution === "CDM15-6FSWPC" && pump.power === 5.5 &&
      pump.frequencyHz === 50 && pump.electric?.phaseCount === 3 && pump.electric.efficiencyClass === "IE3") return profile;
}

export function cdm15_6CadSource(id: string | undefined, sourceHash: string) {
  return id === CDM15_6_ARTICLE_ID && sourceHash === hash;
}

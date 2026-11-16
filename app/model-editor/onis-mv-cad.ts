import data from "../../data/onis-mv-cad-models.json";
import type { Pump } from "../pump-catalog";
import type { PumpProfile } from "./model";

type Model = { article: string; designation: string; profile: PumpProfile };
const models = data.models as unknown as Readonly<Record<string, Model>>;
const canonicalName = (value: string) => value.toUpperCase().replace(/\s+/g, "");

export function onisMvCadProfile(pump: Pick<Pump, "id" | "manufacturer" | "series" | "article" | "model">): PumpProfile | undefined {
  if (pump.manufacturer !== "ONIS" || pump.series !== "MV" || pump.id !== `ONIS:MV:${pump.article}`) return;
  const model = models[pump.id];
  if (model?.article === pump.article && canonicalName(model.designation) === canonicalName(pump.model)) return model.profile;
}

export function onisMvCadSource(pumpId?: string, sourceHash?: string): boolean {
  return Boolean(pumpId && Object.hasOwn(models, pumpId) && (!sourceHash || models[pumpId].profile.sourceHash === sourceHash));
}

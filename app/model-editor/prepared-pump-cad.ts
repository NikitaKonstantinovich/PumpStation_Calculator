import data from "../../data/prepared-pump-cad-models.json";
import horizontal from "../../data/horizontal-frame-mounts.json";
import type { Pump } from "../pump-catalog";
import type { PumpProfile } from "./model";
import { applyHorizontalPumpCadPorts } from "./horizontal-pump-cad";
import { applyEndSuctionCadPorts } from "./end-suction-ports";

const scopeNotes = {
  variant_step: "STEP привязан к исполнению насоса. Монтажную пригодность проверяют отдельно.",
  model_reference: "Компоновочный STEP модели насоса. Соответствие исполнения и монтажные размеры требуют проверки.",
  drawing_reference: "Компоновочный STEP по чертежу насоса. Используйте его для проверки компоновки. Монтажные размеры требуют проверки.",
};
type Scope = keyof typeof scopeNotes;
type Entry = {
  manufacturer: string;
  series: string;
  model: string;
  article: string | null;
  displayArticle?: string;
  execution: string | null;
  powerKw: number | null;
  frequencyHz: number | null;
  scope: Scope;
  profile: PumpProfile;
};
const models = { ...data.models, ...horizontal.models } as unknown as Readonly<Record<string, Entry>>;
const nonRoundVariantIds = new Set((data as unknown as { nonRoundVariantIds?: string[] }).nonRoundVariantIds ?? []);

export function preparedPumpCadIsNonRoundVariant(id?: string) { return !!id && nonRoundVariantIds.has(id); }

function modelFor(id?: string): Entry | undefined {
  if (!id || preparedPumpCadIsNonRoundVariant(id) || !Object.hasOwn(models, id)) return;
  const model = models[id], profile = model.profile;
  if (!Object.hasOwn(scopeNotes, model.scope) || !profile || !/^[a-f0-9]{64}$/.test(profile.sourceHash) ||
    !/^Equipment\/[^\\]+\.(?:stp|step)$/i.test(profile.source) || profile.source.split("/").includes("..") ||
    profile.meshUrl !== `/model-assets/model-${profile.sourceHash}-v1.stl`) return;
  const restored = applyEndSuctionCadPorts({ id, type: "end_suction", ...model, power: model.powerKw }, applyHorizontalPumpCadPorts(profile));
  return restored === profile ? model : { ...model, profile: restored };
}

export function preparedPumpCadModel(pump: Pump): Entry | undefined {
  const model = modelFor(pump.id);
  if (model && model.manufacturer === pump.manufacturer && model.series === pump.series && model.model === pump.model &&
      model.article === (pump.article ?? null) && model.execution === (pump.execution ?? null) &&
      model.powerKw === (pump.power ?? null) && model.frequencyHz === (pump.frequencyHz ?? null)) return model;
}

export function preparedPumpCadRevision(id?: string) {
  const model = modelFor(id);
  if (model) return [model.scope, model.profile.sourceHash, model.profile.bounds, model.profile.ports, model.profile.warnings];
}

export function preparedPumpCadNote(scope: Scope) { return scopeNotes[scope]; }

export function* preparedPumpCadEntries() {
  for (const id of Object.keys(models)) {
    const model = modelFor(id);
    if (model) yield model;
  }
}

export function preparedPumpCadExportNote(id: string | undefined, hash: string, manual = false) {
  const model = modelFor(id);
  if (model?.profile.sourceHash === hash) return scopeNotes[model.scope];
  if (manual) for (const entry of preparedPumpCadEntries()) {
    if (entry.profile.sourceHash === hash) return scopeNotes[entry.scope];
  }
}

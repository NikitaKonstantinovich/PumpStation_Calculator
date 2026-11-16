import { stationProjectName, type StationNameSettings } from "../station-project-name";
import { DEFAULT_ALGORITHM } from "./algorithm-schema";
import type { Evaluation, ToolContext, ToolProgram, WorkspaceData } from "./schema";
import type { SelectionProof } from "./pump-nodes";

export function stationNameSettingsTool(program: ToolProgram): string | undefined {
  if (program.algorithmId && program.algorithmId !== DEFAULT_ALGORITHM) return;
  const tools = program.tools.filter(tool => tool.enabled !== false && ["requestNumber", "stationType"].every(meaning =>
    program.plans[tool.id]?.steps.some(step => step.id.startsWith(tool.id + "/") && step.parameter?.field.meaning === meaning)));
  return tools.length === 1 ? tools[0].id : undefined;
}

/** Read the selected identities from the pinned catalog, without running pump ranking or hydraulics just to update a title. */
export function workspaceStationName(program: ToolProgram, data: WorkspaceData, resources: ToolContext["resources"], evaluate: (id: string) => Evaluation): {name?: string; needsCatalog: boolean} {
  const settingsId = stationNameSettingsTool(program);
  if (!settingsId) return {needsCatalog:false};
  const settings = evaluate(settingsId).value as StationNameSettings | null;
  if (!settings) return {needsCatalog:false};
  const proofs: Partial<Record<"main" | "secondary", SelectionProof>> = {};
  for (const tool of program.tools.filter(t => t.enabled !== false)) {
    const own = program.plans[tool.id]?.steps.filter(step => step.id.startsWith(tool.id + "/")) ?? [];
    const request = own.find(step => step.operation === "pump.request");
    const parameter = own.find(step => step.parameter?.field.meaning === "pumpSelectionProof");
    if (!request || !parameter?.parameter) continue;
    const contour = request.values.contour === "secondary" ? "secondary" : "main";
    if (contour === "secondary" && settings.stationType !== "combined") continue;
    const value = data.tools[tool.id]?.values[parameter.parameter.key] as SelectionProof | undefined;
    if (value?.variantId && value.snapshotId === data.product?.sourceVersions?.pump_catalog_v2) proofs[contour] = value;
  }
  const catalog = resources?.pump_catalog_v2;
  if (Object.keys(proofs).length && (!catalog || catalog.id !== data.product?.sourceVersions?.pump_catalog_v2)) return {needsCatalog:true};
  const pump = (contour: "main" | "secondary") => catalog?.items.find(item => item.variantId === proofs[contour]?.variantId)?.pump;
  return {name:stationProjectName(settings,pump("main"),pump("secondary")),needsCatalog:false};
}

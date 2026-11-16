import { assistantProjectSnapshot } from "./assistant-project";
import type { ToolIssue } from "./diagnostics";
import { dischargeHydraulics, suctionHydraulics } from "./dn-defaults";
import type { DnEntity, InputEntity, ProjectConfig, SettingsEntity, SpecEntity } from "./project-config";
import type { Pump } from "./pump-catalog";
import { visibleSpecificationItems } from "./specification-presentation";
import { assessSpecification, specificationTechnicalStatus } from "./specification-readiness";
import { secondaryStationEnabled } from "./station-specification";

export function currentAssistantProject(project: ProjectConfig, issues: ToolIssue[], catalogue: readonly Pump[]) {
  const input = project.entities["system-input"] as InputEntity;
  const secondary = project.entities["system-input-2"] as InputEntity;
  const settings = project.entities["station-settings"] as SettingsEntity;
  const dn = project.entities["station-dn"] as DnEntity;
  const spec = project.entities["station-spec"] as SpecEntity;
  const secondaryEnabled = secondaryStationEnabled(settings);
  const selected = catalogue.find(pump => pump.id === input.selectedPumpId);
  const secondPump = secondaryEnabled ? catalogue.find(pump => pump.id === secondary.selectedPumpId) : undefined;
  const items = visibleSpecificationItems(spec, settings);
  return assistantProjectSnapshot({
    versions: settings.baseValues?.versions,
    primaryInput: input,
    secondaryInput: secondaryEnabled ? secondary : null,
    settings, dn,
    hydraulics: {
      primarySuction: suctionHydraulics(dn, input, settings, false, selected),
      primaryDischarge: dischargeHydraulics(dn, input, settings, false, selected),
      secondarySuction: secondaryEnabled ? suctionHydraulics(dn, secondary, settings, true, secondPump) : null,
      secondaryDischarge: secondaryEnabled ? dischargeHydraulics(dn, secondary, settings, true, secondPump) : null,
    },
    collectors: project.entities["station-collectors"],
    issues,
    specification: { ...assessSpecification(project, items, issues), items: items.map(item => ({ ...item, technicalStatus: specificationTechnicalStatus(item) })) },
  });
}

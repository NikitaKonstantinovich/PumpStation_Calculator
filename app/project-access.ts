import { defaultProjectSettings } from "./default-settings";
import { createProject, parseProjectConfig, type DnEntity, type InputEntity, type ProjectConfig, type SettingsEntity } from "./project-config";
import { collectorRecommendation, type CollectorsEntity } from "./collector-project";
import type { CollectorConfiguration } from "./collector-calculations";
import { canEditAllSettings, canEditProjectOptions, type UserRole } from "./user-types";

export const PROJECT_OPTION_KEYS = ["combinedCircuitsSimultaneous", "membraneTank", "membraneTankVolume", "vibrationCompensators", "collectorPlugs", "isolatingValves", "jockeyPump", "hydraulicOptions"] as const;
export function canEditSetting(role: UserRole, key: keyof SettingsEntity) {
  return canEditAllSettings(role) || (canEditProjectOptions(role) && PROJECT_OPTION_KEYS.some(option => option === key));
}
const same = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = (value: Record<string, unknown>) => Object.keys(value).filter(key => value[key] !== undefined);
  return keys(a).length === keys(b).length && keys(b).every(key => Object.hasOwn(a, key) && same(a[key], b[key]));
};

export function projectAccessError(project: ProjectConfig, role: UserRole): string | null {
  if (canEditAllSettings(role)) return null;
  const settings = project.entities["station-settings"] as SettingsEntity, defaults = defaultProjectSettings();
  for (const key of Object.keys(defaults) as Array<keyof SettingsEntity>) {
    if (!canEditSetting(role, key) && !same(settings[key] ?? defaults[key], defaults[key])) {
      return role === "base" ? "Уровень base допускает только настройки проекта по умолчанию. Опции доступны с plus, остальные настройки — с pro." : "Уровень plus позволяет менять только блок «Опции». Остальные настройки доступны с pro.";
    }
  }
  if (!canEditSetting(role, "hydraulicOptions") && settings.hydraulicOptions && !same(settings.hydraulicOptions, { products: {} })) return "Настройка гидравлических опций доступна с уровня plus.";
  const dn = project.entities["station-dn"] as DnEntity;
  if (Object.entries(dn).some(([key, value]) => key !== "kind" && value != null)) return "Ручное изменение DN, материала, PN, соединений и патрубков доступно с уровня pro. Используйте автоматический подбор.";
  const collectors = project.entities["station-collectors"] as CollectorsEntity;
  for (const type of ["suction", "discharge"] as const) {
    const card = collectors[type];
    if (Object.keys(card.overrides).length || card.spacing1 !== 500 || card.spacing2 !== 400 || card.eccentric) return "Ручное изменение конструкции коллекторов доступно с уровня pro. Используйте стандартное исполнение.";
  }
  return null;
}

export function parseAccessibleProject(raw: unknown, role: UserRole): ProjectConfig {
  const project = parseProjectConfig(raw), error = projectAccessError(project, role);
  if (error) throw new Error(error);
  return project;
}

// Collector requests can arrive directly, without saving a project. Recompute
// the standard assembly from duty inputs and the trusted pump nozzle catalogue.
export function collectorAccessError(configuration: CollectorConfiguration, role: UserRole): string | null {
  if (canEditAllSettings(role)) return null;
  const project = createProject("Проверка исполнения", { id: "access-check", timestamp: "2000-01-01T00:00:00.000Z" });
  if (canEditProjectOptions(role)) {
    const settings = project.entities["station-settings"] as SettingsEntity;
    settings.jockeyPump = configuration.jockey;
    settings.membraneTank = Boolean(configuration.instrumentPorts?.some(port => port.id === "tank"));
    settings.membraneTankVolume = configuration.instrumentPorts?.find(port => port.id === "tank")?.dn === 25 ? 50 : 8;
    settings.combinedCircuitsSimultaneous = configuration.simultaneous;
  }
  const input = project.entities["system-input"] as InputEntity;
  project.entities["system-input"] = { ...input, flowRate: configuration.primary.flow, workingPumpCount: configuration.primary.working, reservePumpCount: configuration.primary.reserve, selectedPumpId: configuration.primary.pumpId, selectedPumpModel: configuration.primary.pumpModel };
  const expected = collectorRecommendation(project, configuration.type);
  if (configuration.instrumentPorts === undefined) delete expected.instrumentPorts; // Legacy standalone collector requests.
  return same(configuration, expected) ? null : "Для вашего уровня доступен только автоматический подбор стандартного коллектора. Ручное исполнение доступно с pro.";
}

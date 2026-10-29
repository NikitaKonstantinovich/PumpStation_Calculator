import type { BindingCatalog } from "./collector-catalog";
import { insertPartIdentity, type InsertPart } from "./component-insert-calculations";
import { analogNativeIdentity, ANALOG_FIELDS, type InsertAnalogReference } from "./component-insert-analog-source";
export { analogNativeIdentity, mergeInsertAnalogs, analogColumns } from "./component-insert-analog-source";
export function applyInsertAnalogLengths(parts: InsertPart[], data: BindingCatalog, reference: InsertAnalogReference): void {
  const items = new Map(data.items.map(item => [item.id, item])), byId = new Map(parts.map(part => [part.id, part]));
  // Use the original snapshot so enrichments cannot form chains or cycles.
  const identities = new Map(parts.map(part => [part.id, insertPartIdentity(part)]));
  for (const rule of reference.rows) {
    const part = byId.get(rule.componentId), item = items.get(rule.componentId), donor = byId.get(rule.donorId), donorItem = items.get(rule.donorId);
    if (!part || !item || part.lengthMm !== null) continue;
    const field = (key: keyof typeof ANALOG_FIELDS) => item.fields.filter(field => field.column === ANALOG_FIELDS[key][0]);
    const managed = field("length");
    if (!managed.length) continue;
    const valid = data.source.sha256 === reference.sourceSha256 && donor && donorItem && managed.length === 1 && managed[0].value === rule.lengthMm
      && field("donor").length === 1 && field("donor")[0].value === rule.donorId && field("source").length === 1 && field("source")[0].value === rule.source
      && analogNativeIdentity(item) === rule.targetNative && analogNativeIdentity(donorItem) === rule.donorNative
      && identities.get(part.id) === rule.targetIdentity && identities.get(donor.id) === rule.donorIdentity
      && part.kind === "reducer" && donor.kind === "reducer" && part.material === donor.material && part.geometry === donor.geometry
      && part.dn === donor.dn && part.dnSmall === donor.dnSmall && part.outerDiameter === donor.outerDiameter && part.outerDiameterSmall === donor.outerDiameterSmall
      && donor.lengthMm === rule.lengthMm && Boolean(donor.dimensionSources.lengthMm?.trim());
    if (!valid) { part.warnings.push(`Длина по аналогу ${rule.donorId} не подтверждена: изменены исходные характеристики или сохранённые атрибуты решения.`); continue; }
    part.lengthMm = rule.lengthMm;
    part.dimensionSources.lengthMm = rule.source;
    part.warnings = part.warnings.filter(warning => !warning.startsWith("Проверка длины:"));
  }
}

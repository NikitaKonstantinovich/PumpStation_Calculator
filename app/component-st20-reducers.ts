import reference from "../data/st20-concentric-reducers.json";
import type { BindingCatalog } from "./collector-catalog";
import type { InsertPart } from "./component-insert-calculations";

/** A persisted adopted length applies only to the exact execution reviewed with it. */
export function applySt20ReducerProvenance(item: BindingCatalog["items"][number], sourceSha256: string, part: InsertPart) {
  if (item.tableId !== reference.id && !item.fields.some(f => f.column === "CALC_ST20_LENGTH_MM")) return;
  const row = reference.rows.find(r => r.id === item.id);
  const matches = row && sourceSha256 === reference.sourceSha256 && item.tableId === reference.id && item.family === reference.family
    && part.kind === "reducer" && part.geometry === "concentric" && part.material === "st20"
    && row.dn === part.dn && row.pn === part.pn && (row.dnSmall === null || row.dnSmall === part.dnSmall)
    && row.dims.every((value, index) => value === [part.outerDiameter, part.outerDiameterSmall, part.wallThickness, part.wallThicknessSmall][index]);
  if (item.fields.some(f => f.column === "CALC_ST20_LENGTH_MM")) {
    if (matches && row.lengthMm === part.lengthMm) part.dimensionSources.lengthMm = row.lengthSource;
    else {
      part.lengthMm = null; delete part.dimensionSources.lengthMm;
      part.warnings.push("Длина концентрического перехода СТ20 требует повторной проверки: изменились исходная книга, DN, PN или размеры исполнения.");
    }
  }
  if (matches) {
    part.source += part.price === row.price.amount ? `; ${row.price.source}` : "; цена изменена в базе после проверки прайса 28.10.2026";
    if (row.lengthMm === null && part.lengthMm === null) part.warnings.push(row.lengthSource);
  }
}

import { catalogSnapshot, CatalogError } from "./catalog-server";
import { pumpLayout } from "./spacing-nodes";
import { resolvePumpSpacing, manualSpacing } from "../pump-spacing";
import { applyCollectorSpacingRules, collectorSpacingConfirmed } from "../collector-spacing";
import type { CollectorConfiguration } from "../collector-calculations";
import type { AppliedBaseValues } from "../base-values";

/** Rebuild from immutable catalogue and base-rule pins. Client evidence is never authoritative. */
export async function applyVerifiedCollectorSpacing(configuration: CollectorConfiguration, applied?: AppliedBaseValues) {
  const legacy = structuredClone(configuration);
  applyCollectorSpacingRules(legacy, applied?.values);
  for (const [index, circuit] of [configuration.primary, configuration.secondary].entries()) {
    if (!circuit) continue;
    const declared = circuit.spacingResult;
    if (!declared) {
      // A new-catalog ID must not enter the numeric legacy lookup/fallback.
      if (circuit.pumpId && circuit.pumpId.includes(":")) throw new CatalogError("Для исполнения нового каталога не переданы закреплённые данные компоновки", 400);
      Object.assign(circuit, index ? legacy.secondary : legacy.primary); continue;
    }
    if (!applied || !declared.layout?.snapshotId) throw new CatalogError("Не закреплены источники межосевого расстояния", 400);
    const snapshot = await catalogSnapshot(declared.layout.snapshotId), item = snapshot.items.find(row => row.variantId === circuit.pumpId);
    if (!item) throw new CatalogError("Выбранное исполнение отсутствует в закреплённом снимке", 400);
    const layout = pumpLayout({ ...item.pump, spacingSnapshotId: snapshot.id }, index ? "secondary" : "primary", (circuit.working ?? 0) + (circuit.reserve ?? 0), declared.layout.orientation);
    const result = resolvePumpSpacing(layout, applied);
    circuit.spacingResult = result; circuit.spacingBase = result.spacing; circuit.radius = result.radius; circuit.spacingStatus = result.status; circuit.spacingNote = result.message;
    if (circuit.spacingManual === true || circuit.spacing !== (result.spacing ?? 0)) circuit.spacingManual = true;
    else delete circuit.spacingManual;
    if (circuit.spacingManual) circuit.spacingResult = manualSpacing(result, circuit.spacing, collectorSpacingConfirmed(configuration, index));
  }
}

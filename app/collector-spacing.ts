import { spacingForPump, type BaseValues } from "./base-values";
import type { CollectorCircuit, CollectorConfiguration } from "./collector-calculations";

export const collectorBaseSpacing = (circuit: CollectorCircuit, index: number) => circuit.spacingBase === undefined ? (index ? 400 : 500) : circuit.spacingBase;
export const collectorSpacingIsManual = (circuit: CollectorCircuit) => circuit.spacingManual === true || (circuit.spacingBase !== undefined && circuit.spacing !== (circuit.spacingBase ?? 0));

// A confirmation belongs to this value, pump and published spacing version.
// It records a user decision; it does not certify unknown pump dimensions.
export function collectorSpacingConfirmation(configuration: CollectorConfiguration, index: number): string {
  const circuit = index ? configuration.secondary : configuration.primary;
  if (!circuit) return "";
  return JSON.stringify([configuration.type, index, circuit.pumpId ?? circuit.pumpModel ?? null,
    configuration.baseVersions?.spacing ?? "legacy-v1", circuit.spacing, collectorBaseSpacing(circuit, index),
    circuit.radius ?? null, circuit.spacingStatus ?? "legacy"]);
}

export function collectorSpacingConfirmed(configuration: CollectorConfiguration, index: number): boolean {
  const circuit = index ? configuration.secondary : configuration.primary;
  return Boolean(circuit && collectorSpacingIsManual(circuit) && circuit.spacingConfirmation === collectorSpacingConfirmation(configuration, index));
}

/** Rebuild rule data on the server before checking a manual confirmation. */
export function applyCollectorSpacingRules(configuration: CollectorConfiguration, values?: BaseValues): void {
  for (const [index, circuit] of [configuration.primary, configuration.secondary].entries()) {
    if (!circuit) continue;
    const rule = spacingForPump(values, circuit.pumpId, Boolean(index));
    if (values && !values.spacing.legacy) {
      circuit.spacingBase = rule.spacing;
      circuit.radius = rule.radius;
      circuit.spacingStatus = rule.status;
      circuit.spacingNote = rule.message;
    } else {
      delete circuit.spacingBase;
      delete circuit.radius;
      delete circuit.spacingStatus;
      delete circuit.spacingNote;
    }
    if (circuit.spacingManual === true || circuit.spacing !== (rule.spacing ?? 0)) circuit.spacingManual = true;
    else delete circuit.spacingManual;
  }
}

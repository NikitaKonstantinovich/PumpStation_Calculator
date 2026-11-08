import { canEditAllSettings, type UserRole } from "../user-types";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const collectorStateIdentity = (value: unknown): string => JSON.stringify(value, (_key, child) => child && typeof child === "object" && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child);

/** The input binding also stores calculation receipts; it does not grant manual geometry access. */
export function validateCollectorStateEdit(next: unknown, previous: unknown, role: UserRole): string | null {
  if (canEditAllSettings(role)) return null;
  const after = object(next), before = object(previous);
  for (const type of ["suction", "discharge"]) {
    const a = object(after[type]), b = object(before[type]);
    if (collectorStateIdentity(object(a.overrides)) !== collectorStateIdentity(object(b.overrides)) || (a.eccentric === true) !== (b.eccentric === true)) return "Ручное изменение исполнения коллекторов доступно с уровня pro.";
    for (const index of [1, 2]) {
      const manual = `spacing${index}Manual`, spacing = `spacing${index}`, confirmation = `spacing${index}Confirmation`;
      if ((a[manual] === true) !== (b[manual] === true) || a[manual] === true && a[spacing] !== b[spacing] || a[confirmation] != null && a[confirmation] !== b[confirmation]) return "Ручное межосевое расстояние и его подтверждение доступны с уровня pro.";
    }
  }
  return null;
}

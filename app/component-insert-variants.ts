import type { InsertCalculation, InsertCatalog } from "./component-insert-calculations";

/** A catalogue slot is not the physical identity used to update a saved product. */
export function insertVariantSlot(row: InsertCalculation): string {
  const end = (side: "left" | "right") => {
    const connection = side === "left" ? row.leftConnection : row.rightConnection;
    const part = row.configuration[side].part ? JSON.parse(row.configuration[side].part!) as unknown[] : [];
    return [connection, connection === "threaded" ? (side === "left" ? row.threadLeft : row.threadRight) : null, connection === "threaded" ? part[16] : null];
  };
  const ends = [end("left"), end("right")];
  if (row.geometry === "straight") ends.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([row.dnLarge, row.dnSmall, row.pn, row.material, row.geometry, ends, row.withSensorNipple,
    row.dnSmall === null || row.pn === null ? row.configuration.base : null]);
}

const recipe = (row: InsertCalculation) => JSON.stringify({ ...row.configuration, sensor: null });

export function selectInsertVariants(rows: InsertCalculation[], coreRows: InsertCalculation[], catalog: InsertCatalog): InsertCalculation[] {
  const policy = catalog.engineering.variantSelection;
  if (!policy?.source.trim()) return rows;
  const parts = new Map(catalog.parts.map(part => [part.id, part]));
  const cores = new Map(coreRows.map(row => [recipe(row), row]));
  const sourceParts = (row: InsertCalculation) => row.bom.filter(item => item.componentId && ["base", "left", "right"].some(role => item.role === role || item.role.startsWith(`${role}-`)))
    .map(item => parts.get(item.componentId!)).filter(part => part && ["pipe", "reducer", "weldFlange", "collar", "looseFlange", "threadEnd"].includes(part.kind));
  const score = (row: InsertCalculation) => {
    const core = cores.get(recipe(row)) ?? row;
    const supplements = sourceParts(row).filter(part => part?.origin === "supplement").length;
    // Optional sensor pressure/price cannot change the selected body and ends.
    return [core.complete ? 0 : 1, core.complete ? 0 : core.warnings.length, supplements];
  };
  const groups = new Map<string, InsertCalculation[]>();
  for (const row of rows) { const key = insertVariantSlot(row); groups.set(key, [...groups.get(key) ?? [], row]); }
  return [...groups.entries()].map(([slot, candidates]) => {
    const ranked = [...candidates].sort((a, b) => {
      const sa = score(a), sb = score(b);
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
      return a.identityKey.localeCompare(b.identityKey);
    });
    const selected = ranked[0], supplements = sourceParts(selected).filter(part => part?.origin === "supplement").map(part => part!.id);
    const reason = supplements.length ? `Использован подходящий аналог: ${[...new Set(supplements)].join(", ")}. Приоритет исходной базы применяется среди вариантов с полным расчётом.`
      : "Выбраны комплектующие исходной базы; их размеры и цены сохранены.";
    return { ...selected, selection: { slot, candidateCount: candidates.length, reason, source: policy.source,
      alternatives: ranked.slice(1).map(row => ({ identityKey: row.identityKey, componentIds: row.bom.filter(item => parts.has(item.componentId ?? "")).map(item => item.componentId!), complete: (cores.get(recipe(row)) ?? row).complete })) } };
  });
}

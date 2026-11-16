import type { SpecItem } from "../project-config";
import type { ComponentItem } from "../component-database-types";
import { readComponentMass, type ComponentMass } from "../component-mass";
import { selectJointFasteners, itemName } from "../line-spec-parts";

/** Approved mass estimates do not select an unconfirmed physical assembly. */
export function unselectedConnectionMass(row: SpecItem, rows: SpecItem[], items: ComponentItem[]): ComponentMass | null {
  if (row.equipmentId || row.insertionAssembly || row.unit && row.unit !== "шт." || !["suction-line", "discharge-line"].includes(row.generatedBy ?? "")) return null;
  const bolt = /^(primary|secondary)-pump-fasteners-bolts$/.exec(row.assemblyRole ?? "");
  const adapter = bolt ? rows.find(r => r.section === row.section && r.generatedBy === row.generatedBy && r.assemblyRole === `${bolt[1]}-adapter`) : row;
  if (!adapter || adapter.equipmentId || adapter.insertionAssembly || !/^(primary|secondary)-adapter$/.test(adapter.assemblyRole ?? "")) return null;
  const r = adapter.insertionRequirement;
  if (!r || r.purpose !== "pump-transition" || r.geometry !== "straight" || r.withSensorNipple !== false || r.from.dn !== r.to.dn || !Number.isInteger(r.from.dn) || r.from.dn <= 0 || !Number.isFinite(r.pn) || r.pn <= 0 || r.pn > 16) return null;
  const connections = [r.from.connection, r.to.connection];
  if (!connections.includes("threaded") || !connections.some(c => c === "flanged" || c === "collar")) return null;
  const analogue = items.find(i => i.id === `suction-table:rf-${r.from.dn}`);
  const reference = readComponentMass(analogue, "шт.");
  if (!reference) return null;
  if (!bolt) return {kg:reference.kg,estimated:true,source:`Предварительная масса ответной части по аналогу ${analogue!.id}; исполнение вставки не выбрано. ${reference.source}`};
  // The exact insert is absent: estimate only the mass of its bolt using a
  // two-flange catalogue stack. Do not write this size into the physical BOM.
  const selected = selectJointFasteners({items}, r.material, r.from.dn, r.pn, {gaskets:1,thickness:0});
  const mass = readComponentMass(selected?.bolt, "шт.");
  return mass && selected?.bolt ? {kg:mass.kg,estimated:true,source:`Предварительная масса крепежа по аналогу ${itemName(selected.bolt)} (${selected.bolt.id}): два каталожных фланца DN${r.from.dn} PN${r.pn}, прокладка 2 мм, гайка и шайба. Длина фактического болта зависит от выбранной вставки. ${mass.source}`} : null;
}

import data from "../../data/tank-frame-mountings.json";
import type { ComponentItem } from "../component-database-types";
import { componentField } from "./components";

/** A known volume alone is insufficient: match the selected catalogue item and its name. */
export function tankFrameMounting(item: ComponentItem | undefined, volume: number): unknown {
  if (!item) return undefined;
  const explicit = componentField(item, "FRAME_MOUNTING");
  // An explicit incomplete or rejected catalogue binding must not be overridden.
  if (explicit !== undefined && explicit !== null) return explicit;
  const row = data.rows.find(row => row.equipmentId === item.id && row.volumeL === volume && row.name === componentField(item, "Наименование"));
  return row ? structuredClone(row.mounting) : undefined;
}

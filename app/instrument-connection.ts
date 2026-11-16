import type { AssemblyComponent } from "./suction-catalog";
import type { lineSpecParts } from "./line-spec-parts";
import type { SpecItem } from "./project-config";
import { withoutPressureChecks } from "./pressure-check-policy";

export const INSTRUMENT_CONNECTION_REVISION = "collector-kip-saved-confirmations-v3";
export const INSTRUMENT_SIDE_FITTINGS = {
  adapter: "резьбовые-фитинги-003-r0235",
  bush: "резьбовые-фитинги-002-r0225",
} as const;

export const isAcceptedInstrumentFitting = (item: SpecItem) =>
  [INSTRUMENT_SIDE_FITTINGS.adapter,INSTRUMENT_SIDE_FITTINGS.bush].some(id=>item.equipmentId===id) &&
  (item.generatedBy==="hydraulic-options"||item.generatedBy==="suction-line"||item.generatedBy==="discharge-line");

/** Clear legacy confirmations as well as pressure checks added after selection. */
export function acceptInstrumentFitting(item:SpecItem):SpecItem {
  if(!isAcceptedInstrumentFitting(item))return item;
  const row=withoutPressureChecks(item);
  return {...row,status:typeof row.price==="number"?"selected":"clarify",technicalStatus:"ready",technicalNotes:[],
    description:"Подключение принято по исходной CAD-сборке и изображениям пользователя: кран → переходник/футорка → прибор."};
}

/** Both local KIP assemblies use the same side-port extension, in this order:
 * valve G1/4 F -> adapter G1/4 M / G1/2 F -> bush G1/2 M / G1/4 F
 * -> instrument G1/4 M. The gauge occupies the main G1/2 port directly.
 * Evidence: Equipment/Instrumentation/3D, both «Кран шаровый Ду15 +
 * Манометр ТМ-510Р + ...» assemblies and user screenshots, 29.10.2026. */
export function addInstrumentSideConnection(parts: ReturnType<typeof lineSpecParts>, items: AssemblyComponent[], count: number, instrument: "реле" | "преобразователь") {
  for (const [id, name] of [
    [INSTRUMENT_SIDE_FITTINGS.adapter, "Переходник 1/2 ВР–1/4 НР бокового подключения КИП"],
    [INSTRUMENT_SIDE_FITTINGS.bush, "Футорка 1/2 НР–1/4 ВР бокового подключения КИП"],
  ]) {
    const component = items.find(item => item.id === id);
    const row = parts.add(id, name, count, `Боковой порт крана → переходник → футорка → ${instrument}; манометр установлен напрямую сверху`, component);
    if(component)row.description="Подключение принято по исходной CAD-сборке и изображениям пользователя: боковой порт крана → переходник → футорка → прибор.";
  }
}

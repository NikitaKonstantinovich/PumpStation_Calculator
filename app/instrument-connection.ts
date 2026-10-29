import type { AssemblyComponent } from "./suction-catalog";
import { componentPressureLimit } from "./suction-pressure";
import type { lineSpecParts } from "./line-spec-parts";

/** Both local KIP assemblies use the same side-port extension, in this order:
 * valve G1/4 F -> adapter G1/4 M / G1/2 F -> bush G1/2 M / G1/4 F
 * -> instrument G1/4 M. The gauge occupies the main G1/2 port directly.
 * Evidence: Equipment/Instrumentation/3D, both «Кран шаровый Ду15 +
 * Манометр ТМ-510Р + ...» assemblies and user screenshots, 29.10.2026. */
export function addInstrumentSideConnection(parts: ReturnType<typeof lineSpecParts>, items: AssemblyComponent[], count: number, instrument: "реле" | "преобразователь") {
  for (const [id, name] of [
    ["резьбовые-фитинги-003-r0235", "Переходник 1/2 ВР–1/4 НР бокового подключения КИП"],
    ["резьбовые-фитинги-002-r0225", "Футорка 1/2 НР–1/4 ВР бокового подключения КИП"],
  ]) {
    const component = items.find(item => item.id === id);
    const row = parts.add(id, name, count, `Боковой порт крана → переходник → футорка → ${instrument}; манометр установлен напрямую сверху`, component);
    if (!componentPressureLimit(component)) {
      row.technicalStatus = "unverified";
      row.description = "Состав подтверждён исходной CAD-сборкой и изображением пользователя; паспорт PN и стандарта резьбы фитинга требует проверки.";
    }
  }
}

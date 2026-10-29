import type { DnEntity, SpecItem } from "./project-config";
import type { AssemblyComponent } from "./suction-catalog";
import { insertionDesign, insertionOrientations } from "./station-insertion-selection";
import { insertionPhysicalKey } from "./calculated-insertion";
import "./specification-insertions.css";

export function SpecificationInsertion({ item, database, designs, onChange }: {
  item: SpecItem; database?: { items: AssemblyComponent[] }; designs?: DnEntity["insertionDesigns"];
  onChange?: (patch: Partial<DnEntity>) => void;
}) {
  const requirement = item.insertionRequirement;
  if (!requirement) return null;
  const candidates = (database?.items ?? []).filter(candidate => insertionOrientations(candidate, requirement).length && insertionDesign(candidate.calculatedInsertion!.calculation))
    .sort((a, b) => a.id.localeCompare(b.id));
  const design = designs?.[requirement.location];
  const current = candidates.find(candidate => design && candidate.calculatedInsertion!.calculation.totalLengthMm === design.totalLengthMm && insertionPhysicalKey(candidate.calculatedInsertion!.calculation.configuration) === insertionPhysicalKey(design.configuration));
  const assembly = item.insertionAssembly;
  const location = `${requirement.location.startsWith("suction:") ? "Всас" : "Напор"} · ${requirement.location.includes(":secondary-") ? "Контур 2" : "Контур 1"} · ${{"between-valves":"между арматурой","pump-transition":"у насоса","after-vibration":"после компенсатора"}[requirement.purpose]}`;
  return <details className="spec-insertion" data-insertion-location={requirement.location}>
    <summary>Исполнение и состав вставки</summary>
    <p>Подтвердите монтажную длину и исполнение для этого участка. Направление концов — от насоса к коллектору. Совместимость проверяется при каждом пересчёте.</p>
    <label>{location}
      <select aria-label={`Исполнение вставки: ${location}`} value={current?.id ?? ""} disabled={!onChange} onChange={event => {
        const next = { ...designs };
        const candidate = candidates.find(c => c.id === event.target.value);
        if (candidate) next[requirement.location] = insertionDesign(candidate.calculatedInsertion!.calculation)!;
        else delete next[requirement.location];
        onChange?.({ insertionDesigns: next });
      }}>
        <option value="">{design && !current ? "Подтверждённое исполнение отсутствует в текущем каталоге" : "Исполнение и длина не подтверждены"}</option>
        {candidates.map(candidate => { const c = candidate.calculatedInsertion!.calculation; return <option key={candidate.id} value={candidate.id}>
          {candidate.family} · L={c.totalLengthMm} мм · {c.withSensorNipple ? `сгон DN${c.configuration.sensor.dn}` : "без сгона"} · рев. {candidate.calculatedInsertion!.revision}
        </option>; })}
      </select>
    </label>
    {!candidates.length && <p>В загруженном каталоге нет расчётных вставок с подходящими DN, PN, материалом и соединениями.</p>}
    {assembly && <>
      <p>Источник: {assembly.snapshot.id}; ревизия {assembly.snapshot.revision}; дата цены {assembly.snapshot.pricedAt}. Учёт: одно готовое изделие. Состав ниже указан на одну вставку и повторно не суммируется.</p>
      <ul>{assembly.snapshot.calculation.bom.map((part, index) => <li key={`${part.role}-${index}`}>{part.name} — {part.quantity?.toLocaleString("ru-RU",{maximumFractionDigits:3}) ?? "?"} {part.unit}; {part.cost === null ? "цена не подтверждена" : `${part.cost.toLocaleString("ru-RU",{maximumFractionDigits:2})} ₽`} · {part.source ?? "источник не указан"}</li>)}</ul>
    </>}
  </details>;
}

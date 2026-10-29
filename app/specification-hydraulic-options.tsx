import type { SettingsEntity, SpecItem } from "./project-config";
import { normalizeHydraulicOptions } from "./hydraulic-option-config";
import { hydraulicPortLabel } from "./station-hydraulic-ports";
import "./specification-insertions.css";

export function SpecificationHydraulicOption({ item, settings, onChange }: { item: SpecItem; settings: SettingsEntity; onChange?: (patch: Partial<SettingsEntity>) => void }) {
  const assembly = item.hydraulicAssembly;
  if (!assembly) return null;
  const config = normalizeHydraulicOptions(settings.hydraulicOptions);
  const known = assembly.parts.reduce((sum, part) => sum + (part.price ?? 0) * part.quantity, 0);
  return <details className="spec-insertion" data-hydraulic-location={assembly.location}>
    <summary>Изделие и полный комплект подключения</summary>
    <label>Исполнение: {item.name}
      <select aria-label={`Изделие: ${item.name}`} disabled={!onChange} value={config.products[assembly.location] ?? ""} onChange={event => {
        const products = { ...config.products };
        if (event.target.value) products[assembly.location] = event.target.value; else delete products[assembly.location];
        onChange?.({ hydraulicOptions: { ...config, products } });
      }}>
        <option value="">Автоматический подбор по параметрам</option>
        {assembly.selectionId && !assembly.candidates.some(candidate => candidate.id === assembly.selectionId) && <option value={assembly.selectionId}>Выбранное изделие отсутствует: {assembly.selectionId}</option>}
        {assembly.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.findings.length ? " · требуется проверка" : ""}</option>)}
      </select>
    </label>
    {item.option === "pressureTransducer" && <label>Подтверждённое питание преобразователя от шкафа, В DC
      <input aria-label="Питание преобразователя от шкафа" type="number" min={1} max={60} disabled={!onChange} value={config.sensorSupplyVoltage ?? ""} placeholder="Не подтверждено" onChange={event => onChange?.({ hydraulicOptions: { ...config, sensorSupplyVoltage: event.target.value ? Number(event.target.value) : undefined } })}/>
    </label>}
    <p>{assembly.source}. Подключения: {assembly.ports.map(hydraulicPortLabel).join("; ")}. Состав на один комплект; в строке — {item.quantity} комплект(а). Вложенные детали повторно в итог не добавляются.</p>
    <ul>{assembly.parts.map((part, i) => <li key={`${part.assemblyRole}-${i}`}>
      <b>{part.name}</b> — {part.quantity.toLocaleString("ru-RU")} {part.unit ?? "шт."}; {part.price == null ? "цена не определена" : `${(part.price * part.quantity).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`}. {part.details} {part.description !== part.details ? part.description : ""}
    </li>)}</ul>
    <p>{item.price === null ? "Известная часть стоимости комплекта" : "Стоимость комплекта"}: {known.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽.</p>
    {assembly.findings.length > 0 && <ul aria-label="Незавершённые проверки узла">{assembly.findings.map((finding, index) => <li key={index}>{finding}</li>)}</ul>}
  </details>;
}

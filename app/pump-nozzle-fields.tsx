import type { DnEntity, InputEntity, ValveConnection } from "./project-config";
import { STANDARD_DN } from "./dn-defaults";
import { catalogPumpPort, pumpPortField, resolvePumpPortData, type PumpPortSide } from "./pump-ports";

export function PumpNozzleFields({ entity, input, secondary = false, title, onChange }: {
  entity: DnEntity; input: InputEntity; secondary?: boolean; title: string;
  onChange?: (patch: Partial<DnEntity>) => void;
}) {
  return <div>
    {!input.selectedPumpId && <p className="dn-calculator__error">Выберите насос — его патрубки заполнятся автоматически.</p>}
    {(["inlet", "outlet"] as PumpPortSide[]).map(side => {
      const field = pumpPortField(secondary, side);
      const port = resolvePumpPortData(entity, input, secondary, side);
      const catalog = catalogPumpPort(input.selectedPumpId, side);
      const manual = Boolean(input.selectedPumpId && entity[field]?.pumpId === input.selectedPumpId);
      const label = side === "inlet" ? "Всасывающий патрубок" : "Напорный патрубок";
      const missing = [!port?.dn && "диаметр", !port?.connection && "тип соединения"].filter(Boolean);
      const sizes = [...new Set([8, 10, 15, 20, ...STANDARD_DN, ...(port?.dn ? [port.dn] : [])])].sort((a, b) => a - b);
      const setPort = (patch: { dn?: number; connection?: ValveConnection }) => {
        if (!input.selectedPumpId) return;
        onChange?.({ [field]: {
          pumpId: input.selectedPumpId, dn: patch.dn ?? port?.dn ?? null,
          connection: patch.connection ?? port?.connection ?? null,
          source: "Указано пользователем", maxPressure: port?.maxPressure ?? null,
        } });
      };
      return <div key={side}>
        <div className="dn-calculator__controls">
          <label><span>{label} насоса · DN</span>
            <select aria-label={`${label} · DN: ${title}`} aria-required="true" aria-invalid={Boolean(input.selectedPumpId && !port?.dn)} disabled={!input.selectedPumpId}
              value={port?.dn ?? ""} onChange={event => setPort({ dn: Number(event.target.value) })}>
              <option value="" disabled>Выберите диаметр вручную</option>
              {sizes.map(size => <option key={size} value={size}>DN{size}</option>)}
            </select>
          </label>
          <label><span>{label} · тип соединения</span>
            <select aria-label={`${label} · соединение: ${title}`} aria-required="true" aria-invalid={Boolean(input.selectedPumpId && !port?.connection)} disabled={!input.selectedPumpId}
              value={port?.connection ?? ""} onChange={event => setPort({ connection: event.target.value as ValveConnection })}>
              <option value="" disabled>Выберите соединение вручную</option>
              <option value="threaded">Резьбовое</option><option value="flanged">Фланцевое</option>
            </select>
            <small>{manual ? "Указано пользователем" : catalog ? "Автоматически из базы насоса" : "Нет данных в базе"}</small>
          </label>
          <div><button className="button" disabled={!manual || !catalog} onClick={() => onChange?.({ [field]: null })}>Патрубок из каталога</button></div>
        </div>
        {input.selectedPumpId && missing.length > 0 && <p role="alert" className="dn-calculator__error">{label}: выберите {missing.join(" и ")} вручную из списка по паспорту насоса.</p>}
        {port?.source && !manual && <p className="dn-calculator__port-source">Источник: {port.source}</p>}
      </div>;
    })}
  </div>;
}

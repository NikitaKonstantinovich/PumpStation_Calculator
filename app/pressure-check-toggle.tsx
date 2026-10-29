"use client";

export function PressureCheckToggle({ enabled, disabled = false, onChange }: { enabled: boolean; disabled?: boolean; onChange: (enabled: boolean) => void }) {
  return <button type="button" role="switch" aria-label="Проверка давления" aria-checked={enabled} disabled={disabled}
    className="pressure-check-toggle" title={disabled ? "Настройка доступна с уровня pro" : "Проверять рабочее давление насосов, коллекторов и комплектующих"}
    onClick={() => onChange(!enabled)}>
    <span className="pressure-check-toggle__track" aria-hidden="true"><span/></span>
    <span>Проверка давления<small>{enabled ? "Включена" : "Выключена"}</small></span>
  </button>;
}

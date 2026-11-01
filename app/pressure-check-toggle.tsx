"use client";

type ToggleProps = { enabled: boolean; disabled?: boolean; onChange: (enabled: boolean) => void };
export function CalculationToggle({ enabled, disabled = false, onChange, label, hint }: ToggleProps & { label: string; hint: string }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={enabled} disabled={disabled}
    className="pressure-check-toggle" title={disabled ? "Настройка доступна с уровня pro" : hint}
    onClick={() => onChange(!enabled)}>
    <span className="pressure-check-toggle__track" aria-hidden="true"><span/></span>
    <span>{label}<small>{enabled ? "Включено" : "Выключено"}</small></span>
  </button>;
}
export function PressureCheckToggle(props: ToggleProps) {
  return <CalculationToggle {...props} label="Проверка давления" hint="Проверять рабочее давление насосов, коллекторов и комплектующих"/>;
}

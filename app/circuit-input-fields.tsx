import type { InputEntity } from "./project-config";
import { IssueNotice } from "./diagnostics-ui";

export function CircuitInputFields({ input, onChange, showStaticHead = true, issueTool }: {
  input: InputEntity;
  onChange: (patch: Partial<InputEntity>) => void;
  showStaticHead?: boolean;
  issueTool?: "input" | "input2";
}) {
  const numberField = (key: "flowRate" | "head" | "staticHead" | "workingPumpCount" | "reservePumpCount", label: string, unit: string, min: number, max?: number) => (
    <label className="data-form__field" key={key}><span>{label}</span><span className="data-form__control">
      <input aria-label={label} type="number" min={min} max={max} step={key.endsWith("Count") ? 1 : "any"} value={input[key] ?? ""}
        onChange={event => onChange({ [key]: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : null })}/><b>{unit}</b>
    </span>{issueTool && <IssueNotice id={`${issueTool}/${key}`}/>}</label>
  );
  return <div className="pump-selector__inputs">
    <label className="data-form__field"><span>Перекачиваемая среда</span><select aria-label="Перекачиваемая среда" value={input.medium}
      onChange={event => onChange({medium: event.target.value as InputEntity["medium"], selectedPumpId: undefined, selectedPumpModel: undefined, calculated: false})}>
      <option value="water">Чистая вода</option><option value="wastewater">Сточные воды</option>
    </select></label>
    {numberField("flowRate", "Расход станции", "м³/ч", 0)}
    {numberField("head", "Напор", "м", 0)}
    {showStaticHead && numberField("staticHead", "Статический напор", "м", 0)}
    {numberField("workingPumpCount", "Рабочих насосов", "шт.", 1, 6)}
    {numberField("reservePumpCount", "Резервных насосов", "шт.", 0, 3)}
  </div>;
}

import { accepts } from "../engineering/schema";
import type { ParameterBinding, ParameterWrite, Values } from "./schema";

/** Apply declared form actions together, using the bindings from the current evaluation. */
export function applyParameterWrites(current: Record<string, Values>, bindings: ParameterBinding[], writes: ParameterWrite[], owner: string): Record<string, Values> {
  if (!Array.isArray(writes) || !writes.length || writes.length > 10) throw Error("Некорректное действие формы");
  const seen = new Set<string>();
  const checked = writes.map(write => {
    const supplied = write?.binding;
    const actual = bindings.find(binding => binding.node === supplied?.node && binding.key === supplied?.key && binding.toolId === supplied?.toolId);
    if (!actual || JSON.stringify(actual) !== JSON.stringify(supplied)) throw Error("Привязка параметра изменилась. Повторите действие.");
    if (!actual.active || !actual.editable || (actual.mode ?? "user") !== "user") throw Error("Изменение параметра недоступно · " + actual.field.name);
    if (!accepts(actual.field, write.value)) throw Error("Неверный тип или диапазон · " + actual.field.name);
    const toolId = actual.toolId ?? owner;
    if (!Object.hasOwn(current, toolId)) throw Error("Отсутствует состояние инструмента · " + toolId);
    const token = JSON.stringify([toolId, actual.key]);
    if (seen.has(token)) throw Error("Повторяется параметр действия · " + actual.field.name);
    seen.add(token);
    return { toolId, key: actual.key, value: write.value };
  });
  const result = { ...current };
  for (const write of checked) result[write.toolId] = { ...result[write.toolId], [write.key]: write.value };
  return result;
}

import type { AssemblyComponent } from "./suction-catalog";
import { field, itemDn, type lineSpecParts } from "./line-spec-parts";

export const VALVE_LIMIT_SWITCHES_REVISION = "valve-limit-positions-v2-handle-through-dn150";

/** User-confirmed replacement of the former 3000 RUB kit: one bracket and
 * two TZ-8111 PROxima switches per valve. Prices belong to separate catalogue
 * positions; neither the old kit price nor another DN bracket is a fallback. */
export function addValveLimitSwitches(parts: ReturnType<typeof lineSpecParts>, items: AssemblyComponent[], prefix: string, count: number, dn: number, valve?: AssemblyComponent) {
  const range = [50, 65, 80].includes(dn) ? [50, 80] : [100, 125, 150].includes(dn) ? [100, 150] : null;
  const bracketId = range ? `кронштейны-001-r000${range[0] === 50 ? 5 : 6}` : undefined;
  const candidate = items.find(item => item.id === bracketId);
  const bracketName = candidate ? String(field(candidate, /^Название$|^Наименование$/i) ?? "") : "";
  const valveMatches = valve && /\b017W\b/i.test(valve.family) && itemDn(valve) === dn;
  const bracket = valveMatches && candidate?.catalogId === "кронштейны" && /Dendor/i.test(bracketName) && range?.every(size => new RegExp(`DN${size}\\b`, "i").test(bracketName)) ? candidate : undefined;
  const reason = !valveMatches ? "Сначала подтвердите затвор Dendor 017W соответствующего DN; кронштейн другого семейства не подставляется."
    : !range ? `В каталоге нет подтверждённой цены кронштейна для Dendor 017W DN${dn}. Требуется подбор конкретного исполнения.`
    : !bracket ? `Кронштейн Dendor DN${range[0]}–${range[1]} отсутствует в каталоге или его применимость изменилась.` : "";
  parts.add(`${prefix}-limit-switches-bracket`, bracket ? `Кронштейн концевых выключателей Dendor 017W DN${range![0]}–${range![1]}` : `Кронштейн концевых выключателей для затвора DN${dn}`, count,
    `1 кронштейн на затвор × ${count} затв.; DN затвора ${dn}`, bracket, "шт.", undefined,
    reason || `${bracket!.sourceSheet}!строка ${bracket!.sourceRow}; ${bracketName}. Цена отдельного кронштейна из каталога.`);
  const sensor = items.find(item => item.id === "кипиа-004-r0028" && item.catalogId === "кипиа" && /EKF/i.test(item.family) && /^TZ[\s-]*8111$/i.test(String(field(item, /^Исполнение$/i) ?? "")));
  parts.add(`${prefix}-limit-switches-switch`, "Концевой выключатель TZ-8111 PROxima, EKF", count * 2,
    `2 выключателя на затвор (положения «открыт» и «закрыт») × ${count} затв.`, sensor, "шт.", undefined,
    sensor ? `${sensor.sourceSheet}!строка ${sensor.sourceRow}; TZ-8111 подтверждён изображением пользователя 29.10.2026. Цена за один выключатель из каталога.` : "TZ-8111 отсутствует в каталоге; другой концевой выключатель автоматически не подставляется.");
}

import type { CollectorNodeResult } from "./collector-nodes";
import type { PumpDetailSection } from "./pump-card-presentation";
import type { CatalogItem } from "./catalog-schema";
import type { SelectionState } from "./pump-nodes";

export function spacingCardSection(value: unknown, item: CatalogItem, selection: SelectionState): PumpDetailSection {
  const data = value as CollectorNodeResult | undefined;
  const status = {confirmed:"Подтверждено",conditional:"Условно",missing:"Недостаточно данных",conflict:"Конфликт",stale:"Устарело"};
  const sources = {rule:"Существующее правило",calculation:"Расчёт по габаритам",manual:"Ручное значение",none:"Источник не определён"};
  const rows = (["suction","discharge"] as const).flatMap(side=> {
    const configuration=data?.entity?.[side]?.configuration;
    const contour=selection.request?.contour === "secondary" ? "secondary" : "primary";
    const circuit=configuration?.[contour], result=circuit?.spacingResult;
    if (!result) return [];
    const stale=result.layout.pumpId!==item.variantId||result.layout.snapshotId!==selection.snapshotId||result.layout.contour!==contour;
    return [{key:side,label:side==="suction"?"Всасывающий коллектор":"Напорный коллектор",value:stale?"Устарело — изменился выбранный насос":`${result.spacing??"Нет данных"}${result.spacing!=null?" мм":""} · ${status[result.status]}`,origin:stale?"Подключите актуальный результат компоновки":`${sources[result.source]}${result.ruleIds.length?" · "+result.ruleIds.join(", "):""}${result.gap!=null?" · зазор "+result.gap+" мм":""}`}];
  });
  return {id:"spacing",title:"Межосевое расстояние в текущей компоновке",rows,note:rows.length?"Шаг соседних установленных насосов вдоль коллектора. Применимость относится к текущему размещению.":"Подключите результат конструктора коллекторов для текущего контура."};
}

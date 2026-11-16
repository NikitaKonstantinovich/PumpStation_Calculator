import { makeField, type NodeType } from "../engineering/schema";
import type { Step } from "../engineering/engine";
import type { StationWork } from "../station-specification";
import { beginFrame, readMounting, selectFrameConstruction, placeFrame, selectFrameVariant, frameParts, weighFrame, loadFrame, finishFrame, type FrameWork } from "../frame-calculation/project";
import { DEFAULT_FRAME_RULES, resolveFrameRules, type Rules } from "../frame-calculation/types";
import { cabinetFrameWidth } from "../frame-calculation/cabinet-mountings";
import { DEFAULT_CHANNEL_RULES } from "../frame-calculation/channel-types";
import type { ChannelInputs } from "../frame-calculation/channel-types";
import { resolveChannelRules } from "../frame-calculation/channel";
import type { Values } from "./schema";

export const FRAME_STAGES = [
  ["frame.inputs", "Исходные данные рамы и креплений"],
  ["frame.construction", "Конструкция и профиль по массе насоса"],
  ["frame.layout", "Размещение насосов, стоек и бака"],
  ["frame.catalog", "Стандартная длина, цвет и цена рамы"],
  ["frame.fasteners", "Крепёж рамы, насосов и шкафа"],
  ["frame.mass", "Полная масса установки"],
  ["frame.loads", "Виброопоры, рым-болты и нагрузки"],
  ["frame.result", "Рама в составе спецификации"],
] as const;
export const FRAME_OPERATIONS = FRAME_STAGES.map(([id]) => id);
export function frameNodeTypes(): NodeType[] {
  return FRAME_STAGES.map(([id, name], i) => ({
    id, name, category: "Рама установки", operation: id, formulas: {},
    description: "Расчёт по закреплённым исходным данным. Недостающие размеры, массы и неподтверждённый крепёж остаются явными замечаниями." + (i===0 ? " Ширина выбранного шкафа 600/800 мм задаёт шаг стоек 560/760 мм. При отсутствии подходящего размера применяется 600 мм." : ""),
    fields: [makeField("work", i ? "Данные расчёта рамы" : "Состав до расчёта рамы", "object", i ? "frameCalculationWork" : "stationSpecificationWork"),
      ...(i === 0 ? [{...makeField("rules", "Правила компоновки и подъёма", "object", "frameRules"), initial: structuredClone({...DEFAULT_FRAME_RULES,channel:DEFAULT_CHANNEL_RULES})},
        {...makeField("channelInputs", "Монтажные данные швеллерной рамы", "object", "channelFrameInputs"),initial:{},required:false},
        {...makeField("mountings", "Подтверждённые крепления по ID оборудования", "object", "frameMountings"), initial: {}},
        {...makeField("cabinetWidthMm", "Ширина шкафа при отсутствии каталожного размера, мм", "number", "length", "mm"), required:false}] : []),
      {...makeField("value", i === FRAME_STAGES.length - 1 ? "Состав с рассчитанной рамой" : "Результат стадии", "object", i === FRAME_STAGES.length - 1 ? "stationSpecificationWork" : "frameCalculationWork"), direction: "output" as const}]
  }));
}
export function executeFrameOperation(step: Step, values: Values): Values | undefined {
  if (!FRAME_OPERATIONS.includes(step.operation as typeof FRAME_OPERATIONS[number])) return;
  if (!values.work) return { value: null };
  if (step.operation === "frame.inputs") {
    const work = values.work as StationWork;
    const rules = resolveFrameRules(values.rules as Partial<Rules> ?? {});
    for (const key of ["widthMm", "firstStandX", "firstPumpGap", "minStandGap", "standPitchMm", "endMarginMm", "tankFootGapMm", "tankBodyGapMm", "tankStepMm", "eyeletMarginMm", "waterDensityKgL"] as const)
      if (!(typeof rules[key] === "number" && Number.isFinite(rules[key]) && rules[key] > 0)) throw Error("Некорректное правило рамы: " + key);
    const state=beginFrame(work, rules);
    state.result.rules.channel=resolveChannelRules(rules.channel);
    if(values.channelInputs&&typeof values.channelInputs==="object")state.channelInputs={...state.channelInputs,...structuredClone(values.channelInputs as ChannelInputs)};
    const mountings=values.mountings&&typeof values.mountings==="object"?values.mountings as Record<string,unknown>:{};
    state.pumps=state.pumps.map(p=>({...p,mounting:readMounting(mountings[p.id])??p.mounting}));
    if(state.tank)state.tank={...state.tank,mounting:readMounting(mountings[state.tank.id])??state.tank.mounting};
    state.cabinetWidth=cabinetFrameWidth(work,values.cabinetWidthMm);
    state.result.sourceFingerprint=JSON.stringify([state.result.sourceFingerprint,state.pumps,state.tank,state.cabinetWidth,state.channelInputs,state.result.rules.channel]);
    return { value: state };
  }
  // Frame stages update only the top-level state and its result. Keep earlier
  // trace results intact and share the read-only project and catalog inputs.
  const state = values.work as FrameWork;
  const run = {"frame.construction": selectFrameConstruction, "frame.layout": placeFrame, "frame.catalog": selectFrameVariant, "frame.fasteners": frameParts, "frame.mass": weighFrame, "frame.loads": loadFrame, "frame.result": finishFrame}[step.operation as "frame.construction"];
  return { value: run({ ...state, result: structuredClone(state.result) }) };
}

/// <reference types="vite/client" />
import { assistantSearchWords, assistantSearchScore } from "./assistant-knowledge-server";
import { canUseGeometry, type UserRole } from "./user-types";

type Profile = "full" | "beta";
type AlgorithmAccess = { role: UserRole; profile: Profile };

// Package the named engineering modules from this build. Paths supplied by the
// model can only select an entry in this index.
function algorithmGroups() {
  return [
    { title: "Подбор насосов, гидравлические кривые, частота, рабочая точка, цены и характеристики", scope: "beta", files: import.meta.glob<string>("./{pump-selection,pump-frequency,pump-filters,pump-counts,pump-sketches,pump-ports,pump-card-data,pump-catalog,curve-methods,pchip,base-values,base-values-spacing}.ts", { eager: true, query: "?raw", import: "default" }) },
    { title: "DN, давление, арматура, рама и выбор шкафов управления", scope: "full", files: import.meta.glob<string>(["./{dn-defaults,suction-pressure,pressure-check-policy,instrument-pressure,control-cabinet-selection,frame-selection}.ts", "./cabinet-configurator.tsx"], { eager: true, query: "?raw", import: "default" }) },
    { title: "Коллекторы, расход, скорости, длины, межосевое расстояние, КИП, сварка и окраска", scope: "full", files: import.meta.glob<string>("./{collector-calculations,collector-project,collector-spacing,collector-catalog,collector-instrument-dimensions,collector-nipple-rules,component-painting,thread-cutting}.ts", { eager: true, query: "?raw", import: "default" }) },
    { title: "Вставки, переходы, сгоны, фланцы, прокладки, крепёж и массы комплектующих", scope: "full", files: import.meta.glob<string>("./{calculated-insertion,component-insert-calculations,component-insert-catalog,component-insert-analogs,component-insert-standards,component-insert-variants,component-calculator-selection,component-nomenclature,component-masses,component-collar-dimensions,component-flange-boring,component-cad-dimensions,component-sensor-nipples,component-st20-reducers,component-supplier-flanges,sealing-selection,flange-dimensions,joint-flange-dimensions,joint-fastener-length,fastener-catalog,vibration-dimensions,vibration-fasteners,valve-limit-switches,line-joint-stack,line-insertion,line-spec-parts,line-vibration,line-geometry-catalog,station-insertion-selection}.ts", { eager: true, query: "?raw", import: "default" }) },
    { title: "Гидравлическая обвязка, бак, порты, КИП, приборы и гидравлические опции", scope: "full", files: import.meta.glob<string>("./{hydraulic-option-assembly,hydraulic-option-selection,hydraulic-option-config,hydraulic-port-ledger,hydraulic-product-review,instrument-connection,station-hydraulic-ports,suction-instruments,fire-insertion-instruments,pressure-transducers,tank-connection,tank-mounting}.ts", { eager: true, query: "?raw", import: "default" }) },
    { title: "Спецификация станции, количество, готовность, стоимость, сохранённые узлы и диагностика", scope: "full", files: import.meta.glob<string>("./{station-specification,specification-readiness,specification-items,specification-presentation,specification-export,suction-catalog,suction-spec,discharge-spec,saved-instrument-specification,saved-insertion-specification,diagnostics}.ts", { eager: true, query: "?raw", import: "default" }) },
    { title: "3D, геометрия сборок, соединения, крепёж, монтаж насосов и CAD-экспорт", scope: "geometry", files: import.meta.glob<string>(["./cad-export.ts", "./model-editor/{model,collector-template,collector-mesh,collector-intersection,flange-hole-pattern,flange-fasteners,geometry,instrument-assemblies,insertion-template,line-assembly,onis-flow,pump-spatial,snap-engine,snap-geometry,specification-models,stamped-flanges,tank-assemblies,threaded-tube,valve-controls}.ts"], { eager: true, query: "?raw", import: "default" }) },
  ];
}

type AlgorithmChunk = { file: string; title: string; scope: string; startLine: number; code: string; terms: string[]; fileTerms: string[]; labels: string[] };
let index: AlgorithmChunk[] | undefined;
function algorithmIndex() {
  return index ??= algorithmGroups().flatMap(group => Object.entries(group.files).flatMap(([path, source]) => {
    const file = path.replace(/^\.\//, "app/");
    const fileTerms = assistantSearchWords(path.split("/").at(-1) ?? ""), labels = assistantSearchWords(group.title);
    const chunks: AlgorithmChunk[] = [];
    let startLine = 1;
    for (let start = 0; start < source.length; start += 2200) {
      const code = source.slice(start, start + 2700);
      const terms = assistantSearchWords(code.replace(/([a-z])([A-Z])/g, "$1 $2")).concat(assistantSearchWords(code));
      chunks.push({ file, title: group.title, scope: group.scope, startLine, code, terms, fileTerms, labels });
      startLine += source.slice(start, start + 2200).split("\n").length - 1;
    }
    return chunks;
  }));
}

export function searchProductAlgorithms(query: string, file: string, offset: number, access: AlgorithmAccess) {
  const words = assistantSearchWords(query);
  const matching = algorithmIndex().filter(entry => (access.profile === "full" || entry.scope === "beta") &&
    (entry.scope !== "geometry" || canUseGeometry(access.role)) && (!file || entry.file === file));
  const ranked = matching.map(entry => ({ entry, score: assistantSearchScore(words, entry.labels) + 3 * assistantSearchScore(words, entry.fileTerms) + 5 * assistantSearchScore(words, entry.terms) }))
    .filter(item => !words.length || item.score > 0).sort((a, b) => b.score - a.score);
  if (!words.length && !file) {
    const modules = [...new Map(matching.map(({ file, title }) => [file, { file, title }])).values()];
    return { total: modules.length, nextOffset: offset + 20 < modules.length ? offset + 20 : null, items: modules.slice(offset, offset + 20) };
  }
  return {
    total: ranked.length,
    nextOffset: offset + 4 < ranked.length ? offset + 4 : null,
    items: ranked.slice(offset, offset + 4).map(({ entry: { file, title, startLine, code } }) => ({ file, title, startLine, code })),
  };
}

/** Persisted preferences are independent of the geometry currently present in the scene. */
export const snapGroups = ["Характерные точки", "Рёбра и поверхности", "Построения от опорной геометрии", "Монтажные точки установки", "Направляющие движения", "Дополнительные"] as const;
export const snapDefinitions = [
  { id: "end", group: 0, label: "Конечные точки", hint: "Концы конструктивных отрезков и осевых сегментов", symbol: "□" },
  { id: "vertex", group: 0, label: "Вершины", hint: "Углы параметрических балок рамы", symbol: "◇" },
  { id: "mid", group: 0, label: "Середины отрезков", hint: "Половина длины прямого ребра или осевого сегмента", symbol: "△" },
  { id: "arcMid", group: 0, label: "Середины дуг", hint: "Половина длины дуги", symbol: "△", unavailable: "В текущем формате геометрии нет аналитических дуг. Из треугольников STL дуги не восстанавливаются." },
  { id: "center", group: 0, label: "Центры окружностей и дуг", hint: "Центры круглых торцов параметрических труб и коллекторов", symbol: "○" },
  { id: "quadrant", group: 0, label: "Квадранты окружностей", hint: "Четыре точки окружности в её локальной плоскости", symbol: "◇" },
  { id: "centroid", group: 0, label: "Геометрические центры контуров", hint: "Центроид площади прямоугольного контура балки или круглого торца", symbol: "⊙" },
  { id: "base", group: 0, label: "Базовые точки компонентов", hint: "Начало локальных координат компонента; не центр массы", symbol: "⊕" },
  { id: "reference", group: 0, label: "Опорные точки", hint: "Сохранённые пользователем точки; кнопка «Добавить опорную точку»", symbol: "✚" },
  { id: "intersection", group: 1, label: "Фактические пересечения", hint: "Пересечения прямых рёбер и осевых сегментов в 3D", symbol: "×" },
  { id: "nearEdge", group: 1, label: "Ближайшая точка на ребре", hint: "На прямом ребре, осевом сегменте или окружности торца", symbol: "⌁" },
  { id: "nearFace", group: 1, label: "Ближайшая точка на поверхности", hint: "Попадание луча в видимую поверхность; по полигональной сетке, приближённо", symbol: "≈" },
  { id: "faceCenter", group: 1, label: "Центры плоских граней", hint: "Центроид прямоугольной грани балки или круглого торца", symbol: "▣" },
  { id: "axis", group: 1, label: "Оси цилиндров", hint: "Точки на осевых сегментах параметрических труб и коллекторов", symbol: "⊕" },
  { id: "perpendicular", group: 2, label: "Перпендикуляр к ребру", hint: "Основание перпендикуляра от явно выбранной опорной точки к отрезку", symbol: "⊥" },
  { id: "planeFoot", group: 2, label: "Перпендикуляр к плоскости", hint: "Проекция опорной точки внутрь поддерживаемой плоской грани", symbol: "⊥" },
  { id: "tangent", group: 2, label: "Касательная", hint: "Точки касания к окружности; опорная точка должна лежать в её плоскости", symbol: "◯╱" },
  { id: "extension", group: 2, label: "Продолжение ребра", hint: "Виртуальное продолжение прямолинейного ребра за его концами", symbol: "⋯" },
  { id: "parallel", group: 2, label: "Параллельное направление", hint: "Через опорную точку параллельно явно выбранному ребру", symbol: "∥" },
  { id: "between", group: 2, label: "Середина между двумя точками", hint: "Выберите две опоры кнопкой «Две опоры»", symbol: "△" },
  { id: "port", group: 3, label: "Центры патрубков и присоединительных торцов", hint: "Из параметров и CAD-метаданных; статус и известная ось сохраняются", symbol: "⊙" },
  { id: "hole", group: 3, label: "Центры монтажных и крепёжных отверстий", hint: "По исходным монтажным данным", symbol: "⊙", unavailable: "В метаданных оборудования пока нет координат отверстий. По STL они не угадываются." },
  { id: "mount", group: 3, label: "Монтажные базы и опорные плоскости оборудования", hint: "Подтверждённые монтажные поверхности оборудования", symbol: "▱", unavailable: "Монтажные плоскости оборудования пока не размечены в исходных данных. Грань габаритного параллелепипеда не считается монтажной базой." },
  { id: "trackX", group: 4, label: "Отслеживание направления X", hint: "Направляющая X через опорную точку", symbol: "X" },
  { id: "trackY", group: 4, label: "Отслеживание направления Y", hint: "Направляющая Y через опорную точку", symbol: "Y" },
  { id: "trackZ", group: 4, label: "Отслеживание направления Z", hint: "Направляющая Z через опорную точку", symbol: "Z" },
  { id: "ortho", group: 4, label: "Ортогональные направления рабочей плоскости", hint: "Два направления в рабочей плоскости через проекцию опоры", symbol: "∟" },
  { id: "polar", group: 4, label: "Полярные направления", hint: "Направление с заданным угловым шагом в рабочей плоскости", symbol: "∠" },
  { id: "project", group: 4, label: "Проекция на рабочую плоскость", hint: "Выбранные точки проецируются; результат помечается «Проекция»", symbol: "▱" },
  { id: "apparent", group: 5, label: "Кажущееся пересечение в проекции", hint: "Пересечения проекций прямых сегментов; только с включённой проекцией", symbol: "×" },
  { id: "spline", group: 5, label: "Узлы сплайнов", hint: "Только узлы исходной сплайновой кривой", symbol: "◇", unavailable: "Исходные сплайновые кривые и их узлы не передаются в редактор." },
  { id: "meshVertex", group: 5, label: "Вершины полигональной сетки", hint: "Вершины треугольника под курсором; по сетке, приближённо", symbol: "◇≈" },
] as const;
export type SnapKind = typeof snapDefinitions[number]["id"];
export type SnapPlane = { origin: [number, number, number]; u: [number, number, number]; v: [number, number, number] };
export type SnapSettings = {
  enabled: boolean; types: Record<SnapKind, boolean>; radius: number;
  markers: boolean; labels: boolean; guides: boolean; polarStep: number;
  plane: "XY" | "XZ" | "YZ" | "face";
  face?: { componentId: string; featureId: string };
};
export const supportedSnap = (id: SnapKind) => { const d = snapDefinitions.find(d => d.id === id); return !!d && !("unavailable" in d); };
export function defaultSnaps(): SnapSettings {
  return { enabled: true, radius: 12, markers: true, labels: true, guides: true, polarStep: 45, plane: "XY",
    types: Object.fromEntries(snapDefinitions.map(d => [d.id, ["end", "mid", "center", "port"].includes(d.id)])) as Record<SnapKind, boolean> };
}
export function normalizeSnaps(raw: unknown): SnapSettings {
  const result = defaultSnaps();
  if (!raw || typeof raw !== "object") return result;
  const r = raw as Record<string, unknown>;
  for (const key of ["enabled", "markers", "labels", "guides"] as const) if (typeof r[key] === "boolean") result[key] = r[key];
  if (typeof r.radius === "number" && Number.isFinite(r.radius)) result.radius = Math.max(4, Math.min(40, r.radius));
  if (typeof r.polarStep === "number" && Number.isFinite(r.polarStep)) result.polarStep = Math.max(1, Math.min(90, r.polarStep));
  if (["XY", "XZ", "YZ", "face"].includes(String(r.plane))) result.plane = r.plane as SnapSettings["plane"];
  const face = r.face as Record<string, unknown> | undefined;
  if (face && typeof face.componentId === "string" && face.componentId.length <= 240 && typeof face.featureId === "string" && face.featureId.length <= 240) result.face = { componentId: face.componentId, featureId: face.featureId };
  if (r.types && typeof r.types === "object") for (const d of snapDefinitions) {
    const v = (r.types as Record<string, unknown>)[d.id];
    if (typeof v === "boolean") result.types[d.id] = v;
  }
  return result;
}

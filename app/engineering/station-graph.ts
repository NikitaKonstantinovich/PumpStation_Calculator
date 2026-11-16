import { ROOT } from "./hierarchy";
import { makeField, type DataKind, type Diagram, type Document, type Field, type NodeType, type Signature } from "./schema";
type Section = NonNullable<NodeType["section"]>;
type Ref = string;
const node = (id: string, type: string, name: string, x: number, y: number) => ({
  id,
  type,
  name,
  x,
  y,
  values: {} as Record<string, unknown>
});
const f = (key: string, name: string, meaning: string, kind: DataKind = "object", unit = "") => makeField(key, name, kind, meaning, unit);
const as = (field: Field, key: string, name = field.name) => ({
  ...field,
  key,
  name
});
const split = (ref: string) => ref.split(".");
export const secondaryEndpoints: Record<string, {
  output: string;
  args: string[];
}> = {
  evaluatePumpCandidates: {
    output: "secondCandidates",
    args: ["catalogue", "input2", "settings", "filters"]
  },
  operatingPoint: {
    output: "secondPoint",
    args: ["pump2", "hostCount", "input2", "method"]
  },
  pumpCardSections: {
    output: "secondCard",
    args: ["pump2"]
  },
  pumpCardCurves: {
    output: "secondCurves",
    args: ["pump2"]
  }
};
export const endpointInputs: Record<string, string[]> = {
  dischargeHydraulics: ["entity", "input", "settings", "secondary", "pump"],
  createCadManifest: ["project"],
  visibleSpecificationItems: ["specEntity", "settings"],
  projectFrameSelection: ["project", "catalogue"],
  stationComposition: ["project", "resources"],
  buildAssembly: ["project", "catalogue", "profiles", "lines"],
  collectProjectIssues: ["project", "catalogue", "collectorCatalog", "cabinets", "assetErrors"],
  evaluatePumpCandidates: ["catalogue", "input", "settings", "filters"],
  operatingPoint: ["pump", "count", "input", "method"],
  pumpCardSections: ["pump"],
  pumpCardCurves: ["pump"],
  generateInsertCalculations: ["insertRequest", "insertCatalog"],
  resolvePumpPortData: ["entity", "input", "secondary", "side", "pump"],
  specificationLineTotal: ["item"]
};
export function installStation(doc: Document, sigs: Signature[], defaults: Document) {
  if (doc.diagrams.some(g => g.id === ROOT)) return doc;
  const types = [...doc.types],
    diagrams = doc.diagrams.map(g => ({
      ...g
    })),
    result: Document = {
      ...doc,
      types,
      diagrams
    };
  for (const t of defaults.types) if (!types.some(x => x.id === t.id)) types.push(t);
  for (const g of defaults.diagrams) if (!diagrams.some(x => x.id === g.id)) diagrams.push(g);
  const sig = (id: string) => sigs.find(s => s.id === id)!;
  const tool = (id: string) => "tool." + id;
  const getType = (id: string) => types.find(t => t.id === id)!;
  const field = (id: string, key: string) => getType(id).fields.find(f => f.key === key)!;
  function boundaryType(id: string, name: string, fields: Field[]): NodeType {
    const t = {
      id,
      name,
      description: name,
      category: "Границы",
      fields,
      formulas: {}
    };
    types.push(t);
    return t;
  }
  function builder(g: Diagram) {
    function add(id: string, type: string, label: string, x: number, y: number) {
      const n = node(id, type, label, x, y);
      g.nodes.push(n);
      return n;
    }
    function link(from: Ref, to: Ref) {
      const [n, k] = split(from),
        [m, i] = split(to);
      g.edges.push({
        from: n,
        out: k,
        to: m,
        input: i
      });
    }
    function inputs(id: string, values: Record<string, Ref>) {
      for (const [key, v] of Object.entries(values)) link(v, id + "." + key);
    }
    function call(id: string, operation: string, values: Record<string, Ref>, x: number, y: number, label = sig(operation).name) {
      add(id, tool(operation), label, x, y);
      inputs(id, values);
      return id + ".value";
    }
    function rule(id: string, label: string, ins: Field[], outs: Field[], formulas: Record<string, string>, values: Record<string, Ref>, x: number, y: number) {
      const type = "logic." + g.id + "." + id;
      types.push({
        id: type,
        name: label,
        category: "Функции",
        description: label,
        fields: [...ins.map(f => ({
          ...f,
          direction: "input" as const
        })), ...outs.map(f => ({
          ...f,
          direction: "output" as const
        }))],
        formulas
      });
      add(id, type, label, x, y);
      inputs(id, values);
      return id;
    }
    return {
      add,
      link,
      inputs,
      call,
      rule
    };
  }
  function compound(id: string, name: string, section: Section, ins: Field[], outs: Field[], finishX = 1080) {
    const fields = [...ins.map(f => ({
      ...f,
      direction: "input" as const
    })), ...outs.map(f => ({
      ...f,
      direction: "output" as const
    }))];
    types.push({
      id,
      instrument: id,
      name,
      description: name,
      category: "Instrument",
      section,
      fields,
      formulas: {}
    });
    const input = boundaryType(id + ".in", "Входы " + name, ins.map(f => ({
      ...f,
      direction: "output"
    })));
    const output = boundaryType(id + ".out", "Выходы " + name, outs.map(f => ({
      ...f,
      direction: "input"
    })));
    const g: Diagram = {
      id,
      name,
      nodes: [node("source", input.id, "Входы", 0, 100), node("result", output.id, "Выходы", finishX, 100)],
      edges: [],
      groups: {}
    };
    diagrams.push(g);
    return builder(g);
  }
  // Replace only factory graphs. Renames, rewires and custom definitions in saved drafts survive upgrades.
  function lower(id: string, build: (b: ReturnType<typeof builder>) => void) {
    const original = defaults.diagrams.find(g => g.id === id)!,
      current = diagrams.find(g => g.id === id)!;
    if (JSON.stringify(current) !== JSON.stringify(original)) return;
    current.nodes = current.nodes.filter(n => n.id === "source" || n.id === "result").map(n => ({
      ...n,
      x: n.id === "source" ? 0 : 1320,
      y: 90
    }));
    current.edges = [];
    build(builder(current));
  }
  lower("selectValveComponent", b => {
    const s = sig("selectValveComponent"),
      category = sig("valvesByDn").args[1];
    b.rule("catalog", "Каталог по назначению арматуры", [s.args[1]], [category], {
      category: 'if(kind=="butterfly","затворы",if(kind=="ball","шаровые-краны","обратные-клапаны"))'
    }, {
      kind: "source.kind"
    }, 305, 20);
    b.call("nominal", "valvesByDn", {
      items: "source.items",
      category: "catalog.category",
      dn: "source.dn"
    }, 610, 70);
    b.call("select", "rankValve", {
      ...Object.fromEntries(s.args.map(f => [f.key, "source." + f.key])),
      items: "nominal.value"
    }, 920, 95);
    b.link("select.value", "result.value");
  });
  lower("generateInsertCalculations", b => {
    const s = sig("generateInsertCalculations"),
      base = sig("insertBaseline");
    b.call("variants", "generateInsertCandidates", {
      request: "source.request",
      originalCatalog: "source.catalog"
    }, 320, 0);
    b.rule("policy", "Исходный вариант для сравнения", s.args, [as(s.args[0], "base"), base.args[3]], {
      base: 'set(request,"withSensorNipple",false)',
      rebuild: 'if(get(get(catalog,"engineering"),"variantSelection"),get(request,"withSensorNipple") ?? false,false)'
    }, {
      request: "source.request",
      catalog: "source.catalog"
    }, 310, 210);
    b.call("baseline", "insertBaseline", {
      rows: "variants.value",
      request: "policy.base",
      catalog: "source.catalog",
      rebuild: "policy.rebuild"
    }, 650, 100);
    b.call("select", "selectInsertVariants", {
      rows: "variants.value",
      coreRows: "baseline.value",
      catalog: "source.catalog"
    }, 950, 60);
    b.link("select.value", "result.value");
  });
  lower("stationCabinetRows", b => {
    const args = sig("applyCabinetSelection").args;
    b.call("ready", "cabinetSelectionReady", {
      batch: "source.batch"
    }, 325, 0);
    b.rule("catalog", "Каталог шкафов по типу станции", [args[0]], [args[2]], {
      catalogAvailable: 'if(get(get(batch,"settings"),"stationType")=="smart",get(get(batch,"resources"),"smartCabinets")!=null,get(get(batch,"resources"),"cabinets")!=null)'
    }, {
      batch: "source.batch"
    }, 325, 220);
    b.call("select", "applyCabinetSelection", {
      batch: "source.batch",
      cabinetReady: "ready.value",
      catalogAvailable: "catalog.catalogAvailable"
    }, 780, 95);
    b.link("select.value", "result.value");
  });
  lower("stationFrameRows", b => {
    const args = sig("projectFrameSelection").args;
    b.rule("data", "Проект и насосы для расчёта рамы", sig("stationFrameRows").args, args, {
      project: 'get(batch,"project")',
      pumps: 'get(get(batch,"resources"),"pumps")'
    }, {
      batch: "source.batch"
    }, 305, 55);
    b.call("frame", "projectFrameSelection", {
      project: "data.project",
      pumps: "data.pumps"
    }, 610, 70);
    b.call("apply", "applyFrameSelection", {
      batch: "source.batch",
      frame: "frame.value"
    }, 920, 80);
    b.link("apply.value", "result.value");
  });
  lower("assembleWithInputs", b => {
    b.call("placement", "placeStationPumps", Object.fromEntries(sig("placeStationPumps").args.map(f => [f.key, "source." + f.key])), 365, 55);
    b.call("layout", "buildStationLayout", {
      batch: "placement.value"
    }, 805, 100);
    b.link("layout.value", "result.value");
  });
  lower("prepareStation", b => {
    b.call("pumps", "preparePumpRows", {
      project: "source.project",
      resources: "source.resources"
    }, 320, 20);
    b.call("cabinet", "stationCabinetRows", {
      batch: "pumps.value"
    }, 620, 70);
    b.call("frame", "stationFrameRows", {
      batch: "cabinet.value"
    }, 940, 120);
    b.link("frame.value", "result.value");
  });
  lower("evaluatePumpCandidates", b => {
    b.call("filter", "filterSelectionCatalog", {
      catalogue: "source.catalogue",
      input: "source.input",
      filters: "source.filters"
    }, 310, 20);
    b.call("head", "reserveCandidates", {
      catalogue: "filter.value",
      input: "source.input"
    }, 650, 25);
    const n = diagrams.find(g => g.id === "evaluatePumpCandidates")!.nodes.find(n => n.id === "head")!;
    n.values.minimum = -5;
    b.call("point", "measureCandidates", {
      rows: "head.value",
      input: "source.input",
      settings: "source.settings"
    }, 970, 90);
    b.link("point.value", "result.value");
  });
  lower("resolvePumpPortData", b => {
    const src = "args.resolvePumpPortData",
      pumpId = f("id", "ID выбранного насоса", "pumpId", "string"),
      port = f("port", "Патрубок", "port");
    b.rule("identity", "Выбранная модель", [field(src, "input")], [pumpId], {
      id: 'get(input,"selectedPumpId")'
    }, {
      input: "source.input"
    }, 290, 0);
    b.call("catalog", "catalogPumpPort", {
      pumpId: "identity.id",
      side: "source.side",
      pump: "source.pump"
    }, 610, 0);
    b.rule("manual", "Переопределение контура и стороны", ["entity", "secondary", "side"].map(k => field(src, k)), [port], {
      port: 'get(entity, if(side == "outlet", if(secondary, "secondaryPumpDischargePort", "pumpDischargePort"), if(secondary, "secondaryPumpSuctionPort", "pumpSuctionPort")))'
    }, {
      entity: "source.entity",
      secondary: "source.secondary",
      side: "source.side"
    }, 280, 220);
    b.rule("match", "Проверить принадлежность переопределения", [pumpId, port], [as(port, "override")], {
      override: 'if(id && get(port,"pumpId") == id, port, null)'
    }, {
      id: "identity.id",
      port: "manual.port"
    }, 610, 230);
    b.call("choose", "resolvePort", {
      catalog: "catalog.value",
      override: "match.override"
    }, 940, 100);
    b.link("choose.value", "result.value");
  });
  lower("specificationLineTotal", b => {
    const item = field("args.specificationLineTotal", "item"),
      valid = sig("specificationHasPrice").result;
    b.call("check", "specificationHasPrice", {
      item: "source.item"
    }, 320, 0);
    const quantity = f("qty", "Количество", "quantity", "number"),
      price = f("price", "Цена", "price", "number", "₽");
    b.rule("row", "Количество и цена позиции", [item], [quantity, price], {
      qty: 'get(item,"quantity")',
      price: 'get(item,"price")'
    }, {
      item: "source.item"
    }, 320, 190);
    b.rule("amount", "Стоимость позиции", [quantity, price, as(valid, "valid")], [sig("specificationLineTotal").result], {
      value: "if(valid && finite(qty) && qty > 0, price * qty, 0)"
    }, {
      qty: "row.qty",
      price: "row.price",
      valid: "check.value"
    }, 820, 60);
    b.link("amount.value", "result.value");
  });
  lower("preferredOperatingPoint", b => {
    const s = sig("preferredOperatingPoint"),
      extra = ["low", "high", "epsilon"].map((k, i) => ({
        ...f(k, ["Нижний допуск", "Верхний допуск", "Точность"][i], "percent", "number", "%"),
        initial: [-2, 15, 1e-7][i]
      }));
    b.rule("bounds", "Допуски по подаче и напору", [...s.args, ...extra], [s.result], {
      value: "finite(deltaQPercent) && finite(deltaHPercent) && deltaQPercent >= low-epsilon && deltaQPercent <= high+epsilon && deltaHPercent >= low-epsilon && deltaHPercent <= high+epsilon"
    }, {
      deltaQPercent: "source.deltaQPercent",
      deltaHPercent: "source.deltaHPercent"
    }, 470, 80);
    b.link("bounds.value", "result.value");
  });
  lower("inletPressureBar", b => {
    const s = sig("inletPressureBar");
    b.rule("convert", "Перевод напора в давление", [...s.args, {
      ...f("factor", "бар на метр", "factor", "number"),
      initial: .0980665
    }], [s.result], {
      value: "if(finite(head), head * factor, null)"
    }, {
      head: "source.head"
    }, 430, 75);
    b.link("convert.value", "result.value");
  });
  lower("frameConstructionForPumpMass", b => {
    const s = sig("frameConstructionForPumpMass");
    const configurations = [{
      code: "bent-4",
      label: "Рама гнутая, лист 4 мм",
      sheetThicknessMm: 4,
      heightMm: 50
    }, {
      code: "bent-5",
      label: "Рама гнутая, лист 5 мм",
      sheetThicknessMm: 5,
      heightMm: 50
    }, {
      code: "channel-8p",
      label: "Рама из швеллера 8П",
      heightMm: 80
    }, {
      code: "channel-10p",
      label: "Рама из швеллера 10П",
      heightMm: 100
    }, {
      code: "channel-12p",
      label: "Рама из швеллера 12П",
      heightMm: 120
    }, {
      code: "channel-14p",
      label: "Рама из швеллера 14П",
      heightMm: 140
    }];
    const limits = [50, 100, 300, 500, 1000].map((limit, i) => ({
      ...as(s.args[0], "limit" + i, "Порог массы " + (i + 1)),
      initial: limit
    }));
    const variants = configurations.map((c, i) => ({
      ...as(s.result, "variant" + i, c.label),
      initial: c
    }));
    b.rule("construction", "Исполнение рамы по массе насоса", [s.args[0], ...limits, ...variants], [s.result], {
      value: "if(!finite(massKg) || massKg <= 0, null, if(massKg < limit0,variant0,if(massKg < limit1,variant1,if(massKg < limit2,variant2,if(massKg < limit3,variant3,if(massKg < limit4,variant4,variant5))))))"
    }, {
      massKg: "source.massKg"
    }, 510, 70);
    b.link("construction.value", "result.value");
  });
  lower("collectorFlow", b => {
    const s = sig("collectorFlow"),
      q1 = f("q1", "Расход первого контура", "flow", "number", "м³/ч"),
      q2 = as(q1, "q2", "Расход второго контура"),
      flag = f("fireSuction", "Пожарный всас", "flag", "boolean"),
      both = as(flag, "both"),
      sum = as(flag, "sum"),
      mode = f("mode", "Режим", "mode", "string");
    b.rule("circuits", "Расходы и режим контуров", s.args, [q1, q2, flag, both, sum, mode], {
      q1: 'get(get(c,"primary"),"flow")',
      q2: 'get(get(c,"secondary"),"flow")',
      fireSuction: 'get(c,"type") == "suction" && (get(c,"stationType") == "fire" || get(c,"stationType") == "combined")',
      both: 'get(c,"stationType") == "combined" || (get(c,"stationType") == "fire" && (get(c,"jockey") ?? false))',
      sum: 'get(c,"stationType") == "combined" && (get(c,"simultaneous") ?? false)',
      mode: 'if(get(c,"stationType") == "fire","Основные насосы и жокей работают раздельно",if(get(c,"simultaneous"),"Контуры работают одновременно","Расчёт по наибольшему контуру"))'
    }, {
      c: "source.c"
    }, 330, 30);
    const q = as(q1, "flow"),
      label = as(mode, "label");
    b.rule("combine", "Активные контуры, сумма или максимум", [q1, q2, flag, both, sum, mode], [q, label], {
      flow: "if(!finite(q1) || q1 <= 0, null, if(if(fireSuction,sum,both),if(!finite(q2) || q2 <= 0,null,if(sum,q1+q2,max(q1,q2))),q1))",
      label: 'if(fireSuction,if(sum,"Оба контура одновременно","Только пожарный контур"),if(both,mode,"Расчёт по первому контуру"))'
    }, Object.fromEntries([q1, q2, flag, both, sum, mode].map(f => [f.key, "circuits." + f.key])), 630, 90);
    b.rule("output", "Расход коллектора", [q, label], [s.result], {
      value: 'set(set(object(),"flow",flow),"mode",label)'
    }, {
      flow: "combine.flow",
      label: "combine.label"
    }, 950, 80);
    b.link("output.value", "result.value");
  });
  lower("operatingPoint", b => {
    const s = sig("operatingPoint"),
      math = sig("intersectPumpCurve");
    const fields = [as(math.args[2], "staticHead"), as(math.args[3], "coefficient")];
    b.rule("duty", "Коэффициент сети и статический напор", [s.args[2], s.args[1]], fields, {
      staticHead: 'get(input,"staticHead")',
      coefficient: 'if(finite(count) && count > 0 && finite(get(input,"flowRate")) && get(input,"flowRate") > 0 && finite(get(input,"staticHead")) && get(input,"staticHead") >= 0 && finite(get(input,"head")) && get(input,"head") >= get(input,"staticHead"), (get(input,"head")-get(input,"staticHead")) / (get(input,"flowRate")*get(input,"flowRate")), null)'
    }, {
      input: "source.input",
      count: "source.count"
    }, 370, 35);
    b.call("intersection", "intersectPumpCurve", {
      pump: "source.pump",
      count: "source.count",
      staticHead: "duty.staticHead",
      coefficient: "duty.coefficient",
      method: "source.method"
    }, 790, 100);
    b.link("intersection.value", "result.value");
  });
  lower("cataloguePurchasePriceRub", b => {
    const s = sig("cataloguePurchasePriceRub"),
      base = sig("cataloguePriceRub"),
      discount = sig("catalogueDiscount");
    const shared = {
      pump: "source.pump",
      settings: "source.settings"
    };
    b.call("base", base.id, shared, 340, 0);
    b.call("discount", discount.id, shared, 340, 210);
    b.rule("round", "Цена со скидкой и округление", [as(base.result, "price"), as(discount.result, "discount")], [s.result], {
      value: "if(price == null, null, round(price * (1-discount/100) * 100)/100)"
    }, {
      price: "base.value",
      discount: "discount.value"
    }, 790, 70);
    b.link("round.value", "result.value");
  });
  lower("selectionHeadAtFlow", b => {
    const s = sig("selectionHeadAtFlow"),
      curve = sig("interpolateCurve"),
      ok = f("eligible", "Расход в рабочем диапазоне", "valid", "boolean");
    b.rule("range", "Диапазон подачи и точки характеристики", s.args, [ok, curve.args[0]], {
      eligible: '!get(pump,"selectionFlowRange") || (flow >= at(get(pump,"selectionFlowRange"),0) && flow <= at(get(pump,"selectionFlowRange"),1))',
      points: 'get(pump,"curve")'
    }, {
      pump: "source.pump",
      flow: "source.flow"
    }, 300, 20);
    b.call("interpolate", "interpolateCurve", {
      points: "range.points",
      flow: "source.flow"
    }, 600, 160);
    b.rule("accepted", "Принятый напор", [ok, as(curve.result, "head")], [s.result], {
      value: "if(eligible, head, null)"
    }, {
      eligible: "range.eligible",
      head: "interpolate.value"
    }, 940, 20);
    b.link("accepted.value", "result.value");
  });
  lower("resolveDnConnection", b => {
    const s = sig("resolveDnConnection"),
      forced = f("forced", "Только фланцевое", "flag", "boolean"),
      allowed = f("allowed", "Разрешена резьба", "flag", "boolean");
    b.rule("policy", "Ограничение по типу станции", [s.args[0], s.args[2]], [forced], {
      forced: '!(secondary || get(settings,"stationType") == "utility" || get(settings,"stationType") == "smart")'
    }, {
      settings: "source.settings",
      secondary: "source.secondary"
    }, 310, 35);
    b.rule("threshold", "Предел резьбового исполнения", [forced, s.args[1], {
      ...f("maximum", "Максимальный DN", "dn", "number"),
      initial: 50
    }], [allowed], {
      allowed: "!forced && finite(dn) && dn > 0 && dn <= maximum"
    }, {
      forced: "policy.forced",
      dn: "source.dn"
    }, 630, 100);
    b.rule("choose", "Соединение линии", [forced, allowed, s.args[3]], [s.result], {
      value: 'set(set(set(object(),"connection",if(allowed,saved ?? "threaded","flanged")),"threadedAllowed",allowed),"forcedFlanged",forced)'
    }, {
      forced: "policy.forced",
      allowed: "threshold.allowed",
      saved: "source.saved"
    }, 930, 35);
    b.link("choose.value", "result.value");
  });
  const project = f("project", "Проект", "project"),
    resources = f("resources", "Каталоги станции", "stationResources"),
    catalogue = f("catalogue", "Каталог насосов", "pumps", "array"),
    pump = f("pump", "Насос", "pump"),
    system = f("input", "Данные контура", "system"),
    settings = f("settings", "Настройки", "settings"),
    filters = f("filters", "Фильтры", "filters"),
    dn = f("entity", "Параметры DN", "dnSettings");
  const input2 = as(system, "input2"),
    pump2 = as(pump, "pump2"),
    hostCount = as(sig("operatingPoint").args[1], "hostCount");
  const ctx = [input2, pump2, hostCount, f("specEntity", "Состав для вывода", "specEntity"), project, resources, catalogue, pump, system, settings, filters, dn, f("secondary", "Второй контур", "secondary", "boolean"), f("side", "Патрубок", "portSide", "string"), f("count", "Рабочие насосы", "count", "number", "шт"), f("method", "Метод кривой", "curveMethod", "string"), f("profiles", "Профили моделей", "profiles"), f("lines", "Каталог линий", "lineCatalog"), f("collectorCatalog", "Каталог коллекторов", "collectorCatalog"), f("cabinets", "Шкафы", "smartCabinets", "array"), f("assetErrors", "Ошибки ресурсов", "assetErrors"), f("insertRequest", "Параметры вставки", "insertRequest"), f("insertCatalog", "Каталог вставок", "insertCatalog"), f("item", "Строка спецификации", "specItem")];
  const primary = as(system, "primary", "Основной контур"),
    secondary = as(system, "second", "Второй контур"),
    chosen = as(pump, "chosen", "Принятый насос"),
    confirmed = as(system, "confirmed", "Принятые данные");
  let b = compound("stationSettings", "Настройки проекта", "input", [project, system, input2, settings, dn], [as(settings, "effective"), primary, secondary, as(dn, "diameters")]);
  b.rule("read", "Прочитать настройки и контуры", [project, system, input2, settings, dn], [as(settings, "effective"), primary, secondary, as(dn, "diameters")], {
    effective: 'settings ?? get(get(project,"entities"),"station-settings")',
    primary: 'input ?? get(get(project,"entities"),"system-input")',
    second: 'input2 ?? get(get(project,"entities"),"system-input-2")',
    diameters: 'entity ?? get(get(project,"entities"),"station-dn")'
  }, {
    project: "source.project",
    input: "source.input",
    input2: "source.input2",
    settings: "source.settings",
    entity: "source.entity"
  }, 380, 80);
  for (const k of ["effective", "primary", "second", "diameters"]) b.link("read." + k, "result." + k);
  b = compound("stationCatalog", "База комплектующих", "input", [resources, catalogue], [as(catalogue, "pumps")]);
  b.rule("read", "Каталог рабочего расчёта", [resources, catalogue], [as(catalogue, "pumps")], {
    pumps: 'catalogue ?? get(resources,"pumps")'
  }, {
    resources: "source.resources",
    catalogue: "source.catalogue"
  }, 360, 60);
  b.link("read.pumps", "result.pumps");
  const candidate = as(sig("evaluatePumpCandidates").result, "candidates", "Кандидаты");
  b = compound("stationSelection", "Подбор насосов", "input", [catalogue, system, settings, filters, pump], [chosen, confirmed, candidate], 1250);
  b.rule("accept", "Выбор инженера", [system, catalogue, pump], [chosen], {
    chosen: 'pump ?? lookup(catalogue,get(input,"selectedPumpId"))'
  }, {
    input: "source.input",
    catalogue: "source.catalogue",
    pump: "source.pump"
  }, 420, 240);
  b.link("accept.chosen", "result.chosen");
  b.rule("confirm", "Применить принятый насос контура", [system, chosen], [confirmed], {
    confirmed: 'if(chosen && get(chosen,"id") != get(input,"selectedPumpId"),set(input,"selectedPumpId",get(chosen,"id")),input)'
  }, {
    input: "source.input",
    chosen: "accept.chosen"
  }, 800, 305);
  b.link("confirm.confirmed", "result.confirmed");
  const selection = sig("evaluatePumpCandidates");
  b.rule("conditions", "Условия подбора", [system, settings], [as(selection.args[1], "duty"), as(selection.args[2], "prices")], {
    duty: "input",
    prices: "settings"
  }, {
    input: "source.input",
    settings: "source.settings"
  }, 320, 0);
  b.call("candidates", "evaluatePumpCandidates", {
    input: "conditions.duty",
    settings: "conditions.prices",
    catalogue: "source.catalogue",
    filters: "source.filters"
  }, 790, 0);
  b.link("candidates.value", "result.candidates");
  const baseProject = as(project, "effective", "Проект с принятыми параметрами");
  b = compound("stationManual", "Проектные переопределения", "input", [project, primary, secondary, settings], [baseProject]);
  b.rule("apply", "Сохранить принятые данные обоих контуров", [project, primary, secondary, settings], [baseProject], {
    effective: 'set(project,"entities",set(set(set(get(project,"entities"),"system-input",primary),"system-input-2",second),"station-settings",settings))'
  }, {
    project: "source.project",
    primary: "source.primary",
    second: "source.second",
    settings: "source.settings"
  }, 350, 90);
  b.link("apply.effective", "result.effective");
  const portType = sig("resolvePumpPortData").result,
    stationPorts = f("ports", "Патрубки двух контуров", "stationPorts");
  b = compound("stationDn", "Расчёт DN", "edit", [dn, primary, secondary, as(pump, "pump1"), as(pump, "pump2"), ctx.find(f => f.key === "secondary")!, ctx.find(f => f.key === "side")!], [as(portType, "live"), as(portType, "delivery", "Напорный патрубок"), stationPorts], 1520);
  b.call("live", "resolvePumpPortData", {
    entity: "source.entity",
    input: "source.primary",
    secondary: "source.secondary",
    side: "source.side",
    pump: "source.pump1"
  }, 360, 0);
  b.link("live.value", "result.live");
  b.call("delivery", "resolvePumpPortData", {
    entity: "source.entity",
    input: "source.primary",
    secondary: "source.secondary",
    pump: "source.pump1"
  }, 710, 0);
  diagrams.at(-1)!.nodes.find(n => n.id === "delivery")!.values.side = "outlet";
  b.link("delivery.value", "result.delivery");
  const sockets: Field[] = [primary, secondary];
  const wires: Record<string, string> = {
    primary: "source.primary",
    second: "source.second"
  };
  for (const [i, circuit] of ["primary", "secondary"].entries()) for (const [j, side] of ["inlet", "outlet"].entries()) {
    const key = circuit + (j ? "Out" : "In");
    b.call(key, "resolvePumpPortData", {
      entity: "source.entity",
      input: i ? "source.second" : "source.primary",
      pump: i ? "source.pump2" : "source.pump1"
    }, 360 + i * 340, 200 + j * 200);
    const n = diagrams.at(-1)!.nodes.find(n => n.id === key)!;
    n.values = {
      secondary: !!i,
      side
    };
    sockets.push(as(portType, key));
    wires[key] = key + ".value";
  }
  b.rule("ports", "Патрубки для 3D-сборки", sockets, [stationPorts], {
    ports: 'set(set(set(set(set(set(object(),"primaryId",get(primary,"selectedPumpId")),"secondaryId",get(second,"selectedPumpId")),"primaryIn",primaryIn),"primaryOut",primaryOut),"secondaryIn",secondaryIn),"secondaryOut",secondaryOut)'
  }, wires, 1100, 220);
  b.link("ports.ports", "result.ports");
  const rootOutputs = Object.keys(endpointInputs).map(k => as(sig(k).result, k, sig(k).name));
  rootOutputs.push(as(sig("evaluatePumpCandidates").result, "secondCandidates", "Кандидаты второго контура"), as(sig("pumpCardCurves").result, "secondCurves", "Кривые второго насоса"), as(sig("assessSpecification").result, "finished", "Стоимость и готовность станции"), as(sig("operatingPoint").result, "secondPoint", "Рабочая точка второго контура"), as(sig("pumpCardSections").result, "secondCard", "Паспорт второго насоса"));
  const graph: Diagram = {
    id: ROOT,
    name: "Расчёт насосной установки",
    nodes: [],
    edges: [],
    groups: {}
  };
  diagrams.unshift(graph);
  boundaryType("station.in", "Исходные данные", ctx.map(f => ({
    ...f,
    direction: "output"
  })));
  boundaryType("station.out", "Результаты расчёта", rootOutputs.map(f => ({
    ...f,
    direction: "input"
  })));
  const r = builder(graph);
  r.add("source", "station.in", "Исходные данные", 0, 320);
  r.add("result", "station.out", "Вывод результатов", 2560, 300);
  function instrument(id: string, type: string, label: string, values: Record<string, Ref>, x: number, y: number) {
    r.add(id, type, label, x, y);
    r.inputs(id, values);
  }
  const feed = (key: string) => "source." + key;
  instrument("settings", "stationSettings", "Настройки проекта", {
    project: feed("project"),
    input: feed("input"),
    input2: feed("input2"),
    settings: feed("settings"),
    entity: feed("entity")
  }, 320, 20);
  instrument("catalog", "stationCatalog", "База комплектующих", {
    resources: feed("resources"),
    catalogue: feed("catalogue")
  }, 320, 380);
  for (const [id, output, title, y] of [["primary", "primary", "Подбор насосов · основной", 15], ["secondary", "second", "Подбор насосов · второй", 245]] as const) {
    instrument(id, "stationSelection", title, {
      catalogue: "catalog.pumps",
      input: "settings." + output,
      settings: "settings.effective",
      filters: feed("filters"),
      pump: feed(id === "primary" ? "pump" : "pump2")
    }, 640, y);
  }
  instrument("manual", "stationManual", "Проектные переопределения", {
    project: feed("project"),
    primary: "primary.confirmed",
    second: "secondary.confirmed",
    settings: "settings.effective"
  }, 955, 80);
  function view(id: string, host: string, label: string, links: Record<string, Ref>, x: number, y: number, section: Section = "edit") {
    const t = getType(tool(host));
    t.section = section;
    instrument(id, t.id, label, links, x, y);
    r.link(id + ".value", "result." + host);
  }
  r.link("primary.candidates", "result.evaluatePumpCandidates");
  view("chart", "operatingPoint", "Гидравлическая кривая", {
    pump: "primary.chosen",
    input: "primary.confirmed",
    count: feed("count"),
    method: feed("method")
  }, 990, 390);
  view("card", "pumpCardSections", "Карточка насоса", {
    pump: "primary.chosen"
  }, 990, 610);
  view("curves", "pumpCardCurves", "Кривые каталога", {
    pump: "primary.chosen"
  }, 990, 795);
  instrument("dn", "stationDn", "Расчёт DN", {
    entity: "settings.diameters",
    primary: "primary.confirmed",
    second: "secondary.confirmed",
    pump1: "primary.chosen",
    pump2: "secondary.chosen",
    secondary: feed("secondary"),
    side: feed("side")
  }, 1300, 270);
  r.link("dn.live", "result.resolvePumpPortData");
  const delivery = {
    entity: "settings.diameters",
    input: "primary.confirmed",
    settings: "settings.effective",
    secondary: feed("secondary"),
    pump: "primary.chosen"
  };
  const savedLine = doc.diagrams.find(g => g.id === "dischargeHydraulics");
  if (!savedLine || JSON.stringify(savedLine) === JSON.stringify(defaults.diagrams.find(g => g.id === "dischargeHydraulics"))) {
    getType(tool("lineFromPort")).section = "edit";
    instrument("delivery", tool("lineFromPort"), "Напорная линия и арматура", {
      ...delivery,
      port: "dn.delivery"
    }, 1630, 240);
    graph.nodes.find(n => n.id === "delivery")!.values.side = "outlet";
    r.link("delivery.value", "result.dischargeHydraulics");
  } else view("delivery", "dischargeHydraulics", "Напорная линия и арматура", delivery, 1630, 240);
  const modelInputs = {
    project: "manual.effective",
    pumps: "catalog.pumps",
    profiles: feed("profiles"),
    lines: feed("lines")
  };
  view("frameChoice", "projectFrameSelection", "Конструкция рамы", {
    project: "manual.effective",
    pumps: "catalog.pumps"
  }, 1300, 555);
  const oldModel = doc.diagrams.find(g => g.id === "buildAssembly");
  if (!oldModel || JSON.stringify(oldModel) === JSON.stringify(defaults.diagrams.find(g => g.id === "buildAssembly"))) {
    getType(tool("assembleWithInputs")).section = "edit";
    instrument("model", tool("assembleWithInputs"), "3D-компоновка", {
      ...modelInputs,
      ports: "dn.ports",
      frame: "frameChoice.value"
    }, 1670, 460);
    r.link("model.value", "result.buildAssembly");
  } else view("model", "buildAssembly", "3D-компоновка", modelInputs, 1670, 460);
  view("cad", "createCadManifest", "CAD-экспорт сохранённой сборки", {
    project: "manual.effective"
  }, 2180, 800, "output");
  view("document", "visibleSpecificationItems", "Выходные строки спецификации", {
    spec: feed("specEntity"),
    settings: "settings.effective"
  }, 2160, 550, "output");
  view("issues", "collectProjectIssues", "Ошибки и предупреждения", {
    project: "manual.effective",
    catalogue: "catalog.pumps",
    catalog: feed("collectorCatalog"),
    cabinets: feed("cabinets"),
    assetErrors: feed("assetErrors")
  }, 1610, 700);
  view("inserts", "generateInsertCalculations", "Расчёт вставок", {
    request: feed("insertRequest"),
    catalog: feed("insertCatalog")
  }, 1300, 805);
  const savedComposition = doc.diagrams.find(g => g.id === "stationComposition"),
    savedPrepare = doc.diagrams.find(g => g.id === "prepareStation");
  const factory = (g: Diagram | undefined) => !g || JSON.stringify(g) === JSON.stringify(defaults.diagrams.find(d => d.id === g.id));
  if (factory(savedComposition) && factory(savedPrepare)) {
    const stage = (id: string, host: string, name: string, links: Record<string, Ref>, x: number, y: number) => {
      getType(tool(host)).section = "edit";
      instrument(id, tool(host), name, links, x, y);
    };
    stage("pumps", "preparePumpRows", "Насосы обоих контуров", {
      project: "manual.effective",
      resources: feed("resources")
    }, 1260, -655);
    stage("cabinet", "stationCabinetRows", "Шкаф управления", {
      batch: "pumps.value"
    }, 1580, -655);
    stage("frame", "stationFrameRows", "Подбор рамы", {
      batch: "cabinet.value"
    }, 1900, -655);
    stage("collectors", "stationCollectors", "Конструктор коллекторов", {
      work: "frame.value"
    }, 1575, -410);
    stage("lines", "stationLines", "Подбор обвязки и арматуры", {
      work: "collectors.value"
    }, 1900, -410);
    stage("options", "stationOptions", "Гидравлические опции", {
      work: "lines.value"
    }, 1900, -190);
    getType("tool.finalizeStation").section = "output";
    instrument("spec", "tool.finalizeStation", "Спецификация", {
      work: "options.value"
    }, 2230, -190);
    r.link("spec.value", "result.stationComposition");
  } else view("spec", "stationComposition", "Спецификация", {
    project: "manual.effective",
    resources: feed("resources")
  }, 1900, -190, "output");
  view("price", "specificationLineTotal", "Стоимость позиции", {
    item: feed("item")
  }, 1850, 990, "output");
  getType(tool("assessSpecification")).section = "output";
  instrument("finished", tool("assessSpecification"), "Стоимость и готовность станции", {
    project: "spec.value"
  }, 2540, -190);
  r.link("finished.value", "result.finished");
  const count = field("args.operatingPoint", "count");
  r.rule("count2", "Рабочие насосы второго контура", [secondary, hostCount], [count], {
    count: 'hostCount ?? get(second,"workingPumpCount")'
  }, {
    second: "secondary.confirmed",
    hostCount: feed("hostCount")
  }, 645, 635);
  instrument("chart2", tool("operatingPoint"), "Гидравлическая кривая · второй", {
    pump: "secondary.chosen",
    count: "count2.count",
    input: "secondary.confirmed",
    method: feed("method")
  }, 970, 1025);
  r.link("chart2.value", "result.secondPoint");
  instrument("card2", tool("pumpCardSections"), "Карточка насоса · второй", {
    pump: "secondary.chosen"
  }, 1295, 1035);
  r.link("card2.value", "result.secondCard");
  r.link("secondary.candidates", "result.secondCandidates");
  instrument("curves2", tool("pumpCardCurves"), "Кривые второго насоса", {
    pump: "secondary.chosen"
  }, 1610, 1070);
  r.link("curves2.value", "result.secondCurves");
  const lab = getType("lab.result");
  types.push({
    id: "stationLab",
    name: "Песочница · масса партии",
    category: "Instrument",
    description: "Проверка пользовательских формул",
    section: "edit",
    instrument: "lab",
    fields: lab.fields.map(f => ({
      ...f,
      direction: "output"
    })),
    formulas: {}
  });
  r.add("lab", "stationLab", "Песочница · масса партии", 320, 800);
  for (const def of types) {
    if (def.native && !def.section) {
      const screen = sig(def.native)?.screen ?? "";
      def.section = screen === "Подбор насосов" ? "input" : screen === "Спецификация" ? "output" : "edit";
    }
  }
  return result;
}

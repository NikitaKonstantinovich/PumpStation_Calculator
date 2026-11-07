import { makeField, type Field, type Diagram, type NodeType } from "../engineering/schema";
import { parameterType } from "./compiler";
import { MAX_WORKING_PUMPS } from "../pump-counts";
import { ROOT, type ToolDocument } from "./schema";
export const F = (key: string, kind: Field["kind"] = "object", meaning = key, unit = "", name = key): Field => ({
  ...makeField(key, name, kind, meaning, unit),
  direction: "input"
});
const view = () => F("value", "object", "view");
const ctx = () => F("context", "object", "toolContext");
const object = (key = "value", meaning = "record") => F(key, "object", meaning);
const bool = (key: string) => F(key, "boolean", "flag");
const output = (f: Field) => ({
  ...f,
  direction: "output" as const
});
export function initialTools(manufacturers = ["cnp", "aquastrong", "onis", "vandjord", "wellmix"]): ToolDocument {
  const types: NodeType[] = [],
    diagrams: Diagram[] = [];
  function type(id: string, name: string, fields: Field[], operation?: string, formulas: Record<string, string> = {}) {
    const t: NodeType = {
      id,
      name,
      category: operation?.match(/form|section|grid|field|condition|message/) ? "Интерфейс" : "Данные и правила",
      description: name,
      fields,
      formulas,
      operation
    };
    types.push(t);
    return t;
  }
  const uiSlots = Array.from({
    length: 64
  }, (_, i) => F("child" + i, "object", "view"));
  type("ui.form", "Форма инструмента", [...uiSlots, F("title", "string", "text"), F("command", "object", "saveCommand"), output(view())], "form");
  type("ui.section", "Раздел", [...uiSlots, F("title", "string", "text"), F("collapsible", "boolean", "flag"), output(view())], "section");
  type("ui.grid", "Сетка", [...uiSlots, F("columns", "int", "columns"), output(view())], "grid");
  type("ui.field", "Поле параметра", [F("binding", "object", "parameterBinding"), F("label", "string", "text"), F("widget", "enum", "widget"), F("hint", "string", "text"), F("width", "int", "columns"), {...bool("visible"),name:"Показывать в форме",initial:true}, {...bool("enabled"),name:"Доступно для ввода",initial:true}, output(view())], "field").fields.find(f => f.key === "widget")!.options = ["auto", "number", "text", "select", "toggle"];
  type("ui.condition", "Видимость и доступность", [F("child", "object", "view"), bool("visible"), bool("enabled"), output(view())], "condition");
  type("ui.message", "Сообщение", [F("text", "string", "text"), bool("visible"), F("issues", "array", "diagnostics"), output(view())], "message");
  type("data.source", "Зарегистрированный источник", [ctx(), {
    ...F("source", "enum", "source"),
    options: ["workspace2", "base-values"],
    initial: "workspace2"
  }, output(F("value", "object", "toolValues")), output(F("role", "string", "role"))], "source");
  type("command.save", "Сохранить Workspace 2", [output(F("value", "object", "saveCommand"))], "save");
  type("data.constant", "Константа", [output({
    ...F("value", "float", "number"),
    initial: 0
  })]);
  type("data.property", "Чтение атрибута", [object("object"), F("key", "string", "key"), output(F("value", "float", "number"))], undefined, {
    value: "get(object,key)"
  });
  type("logic.compare", "Сравнение", [F("a", "float", "number"), F("b", "float", "number"), output(bool("value"))], undefined, {
    value: "a > b"
  });
  type("logic.and", "Логическое И", [bool("a"), bool("b"), output(bool("value"))], undefined, {
    value: "a && b"
  });
  type("logic.choose", "Условный выбор", [bool("condition"), F("a", "float", "number"), F("b", "float", "number"), output(F("value", "float", "number"))], undefined, {
    value: "if(condition,a,b)"
  });
  type("data.object", "Собрать объект", [F("a", "float", "number"), F("b", "float", "number"), output(object())], "object");
  type("data.merge", "Объединить объекты", [object("a"), object("b"), output(object())], "merge");
  type("logic.check", "Проверка", [bool("valid"), F("key", "string", "key"), F("message", "string", "text"), output(F("value", "array", "diagnostics"))], "check");
  type("logic.formula", "Формула", [F("a", "float", "number"), F("b", "float", "number"), output(F("value", "float", "number"))], undefined, {
    value: "a * b"
  });
  function diagram(id: string, name: string, ins: Field[], outs: Field[]) {
    const g: Diagram = {
      id,
      name,
      groups: {
        data: "Данные и правила",
        ui: "Интерфейс"
      },
      nodes: [],
      edges: []
    };
    diagrams.push(g);
    type(id + ".in", "Входы", ins.map(output));
    type(id + ".out", "Выходы", outs.map(f => ({
      ...f,
      direction: "input"
    })));
    type(id, name, [...ins, ...outs.map(output)]).instrument = id;
    const add = (id: string, t: string, x: number, y: number, values: Record<string, unknown> = {}, group = "data") => {
      const n = {
        id,
        type: t,
        name: types.find(v => v.id === t)!.name,
        x,
        y,
        values,
        group
      };
      g.nodes.push(n);
      return n;
    };
    const wire = (from: string, out: string, to: string, input: string) => g.edges.push({
      from,
      out,
      to,
      input
    });
    const feed = (n: string, links: Record<string, string>) => {
      for (const [input, ref] of Object.entries(links)) {
        const at = ref.lastIndexOf(".");
        wire(ref.slice(0, at), ref.slice(at + 1), n, input);
      }
    };
    add("source", id + ".in", 0, 20);
    add("result", id + ".out", 1900, 20);
    function rule(n: string, name: string, ins: Field[], outs: Field[], formulas: Record<string, string>, links: Record<string, string>, x: number, y: number) {
      const t = type(id + "." + n, name, [...ins, ...outs.map(output)], undefined, formulas);
      add(n, t.id, x, y);
      feed(n, links);
    }
    function collect(n: string, name: string, fields: Field[], links: Record<string, string>, x: number, y: number) {
      const t = type(id + "." + n, name, [...fields.map(f => ({
        ...f,
        required: false
      })), output({
        ...object(),
        shape: fields.map(f => ({
          ...f,
          required: false
        }))
      })], "object");
      add(n, t.id, x, y);
      feed(n, links);
      return n + ".value";
    }
    function parameter(key: string, name: string, kind: Field["kind"], meaning: string, unit: string, y: number, extra: Partial<Field> = {}, permission: "input" | "options" | "all" = "input", links: Record<string, string> = {}) {
      const field = {
        ...F(key, kind, meaning, unit, name),
        ...extra
      };
      const t = parameterType(id + ".param." + key, name, field, permission);
      types.push(t);
      add(key, t.id, 350, y);
      feed(key, {
        values: "source.values",
        defaults: "source.defaults",
        role: "source.role",
        ...links
      });
      const ui = add("field_" + key, "ui.field", 1000, y, {
        widget: "auto"
      }, "ui");
      wire(key, "binding", ui.id, "binding");
      return field;
    }
    return {
      g,
      add,
      wire,
      feed,
      rule,
      collect,
      parameter
    };
  }
  const contourIns = [F("values", "object", "toolValues"), F("defaults", "object", "toolValues"), F("role", "string", "role"), F("scope", "string", "scope"), bool("active"), F("title", "string", "text")];
  const contour = diagram("tool.contour", "Исходные данные контура", contourIns, [object(), F("ui", "object", "view")]);
  const defs = [contour.parameter("medium", "Перекачиваемая среда", "enum", "medium", "", 0, {
    options: ["water", "wastewater"],
    optionNames: {
      water: "Чистая вода",
      wastewater: "Сточные воды"
    },
    initial: "water"
  }, "input", {
    scope: "source.scope",
    active: "source.active"
  }), contour.parameter("flowRate", "Расход станции", "float", "flow", "м³/ч", 180, {
    required: true,
    min: 0.000001
  }, "input", {
    scope: "source.scope",
    active: "source.active"
  }), contour.parameter("head", "Напор", "float", "head", "м", 360, {
    required: true,
    min: 0.000001
  }, "input", {
    scope: "source.scope",
    active: "source.active"
  }), contour.parameter("workingPumpCount", "Рабочих насосов", "int", "count", "шт", 540, {
    required: true,
    min: 1,
    max: MAX_WORKING_PUMPS
  }, "input", {
    scope: "source.scope",
    active: "source.active"
  }), contour.parameter("reservePumpCount", "Резервных насосов", "int", "count", "шт", 720, {
    required: true,
    min: 0,
    max: 3
  }, "input", {
    scope: "source.scope",
    active: "source.active"
  })];
  contour.collect("data", "Данные контура", defs, Object.fromEntries(defs.map(f => [f.key, f.key + ".value"])), 700, 25);
  contour.rule("effective", "Принятые данные", [object("data"), bool("active")], [object()], {
    value: "if(active,data,null)"
  }, {
    data: "data.value",
    active: "source.active"
  }, 1050, 20);
  contour.wire("effective", "value", "result", "value");
  contour.add("layout", "ui.grid", 1350, 280, {
    columns: 2
  }, "ui");
  defs.forEach((f, i) => contour.wire("field_" + f.key, "value", "layout", "child" + i));
  contour.add("section", "ui.section", 1650, 280, {}, "ui");
  contour.feed("section", {
    child0: "layout.value",
    title: "source.title"
  });
  contour.add("visibility", "ui.condition", 1650, 500, {}, "ui");
  contour.feed("visibility", {
    child: "section.value",
    visible: "source.active"
  });
  contour.wire("visibility", "value", "result", "ui");
  const s = diagram("tool.settings", "Настройки проекта", [ctx()], [object(), F("ui", "object", "view")]);
  s.add("project", "data.source", 0, 250, {
    source: "workspace2"
  });
  s.add("base", "data.source", 0, 500, {
    source: "base-values"
  });
  s.feed("project", {
    context: "source.context"
  });
  s.feed("base", {
    context: "source.context"
  });
  // The same logical source ports feed every parameter and shared contour instance.
  for (const t of types.filter(t => t.id === "tool.settings.in")) t.fields.push(output(F("values", "object", "toolValues")), output(F("defaults", "object", "toolValues")), output(F("role", "string", "role")));
  const param = (key: string, name: string, kind: Field["kind"], meaning: string, unit: string, y: number, extra: Partial<Field> = {}, permission: "input" | "options" | "all" = "all", links: Record<string, string> = {}) => {
    const f = s.parameter(key, name, kind, meaning, unit, y, extra, permission, links);
    for (const e of s.g.edges.filter(e => e.to === key)) {
      if (e.from === "source" && ["values", "defaults", "role"].includes(e.out)) {
        e.from = e.out === "defaults" ? "base" : "project";
        e.out = e.out === "role" ? "role" : "value";
      }
    }
    return f;
  };
  const station = param("stationType", "Тип насосной установки", "enum", "stationType", "", 0, {
    options: ["utility", "fire", "combined", "smart"],
    optionNames: {
      utility: "Хоз-пит",
      fire: "Пожаротушение",
      combined: "Совмещённая",
      smart: "SMART"
    },
    initial: "utility"
  });
  const jockey = param("jockeyPump", "Жокей-насос", "boolean", "flag", "", 230, {
    initial: false
  }, "options");
  s.rule("rules", "Контуры и допустимые опции", [station, jockey], [bool("second"), bool("fire"), bool("valves"), bool("combined")], {
    second: 'stationType == "combined" || (stationType == "fire" && jockeyPump)',
    fire: 'stationType == "fire"',
    valves: 'stationType == "fire" || stationType == "combined"',
    combined: 'stationType == "combined"'
  }, {
    stationType: "stationType.value",
    jockeyPump: "jockeyPump.value"
  }, 700, 0);
  for (const [id, scope, title, active, y] of [["main", "main", "Основной контур", true, 700], ["secondary", "secondary", "Второй контур", false, 1100]] as const) {
    s.add(id, "tool.contour", 700, y, {
      scope,
      title,
      ...(active ? {
        active: true
      } : {})
    });
    s.feed(id, {
      values: "project.value",
      defaults: "base.value",
      role: "project.role",
      ...(active ? {} : {
        active: "rules.second"
      })
    });
  }
  const inlet = param("inletHead", "Напор на входе станции", "float", "inletHead", "м", 1600);
  const tank = param("membraneTank", "Мембранный бак", "boolean", "flag", "", 1850, {
    initial: false
  }, "options");
  const volume = param("membraneTankVolume", "Объём бака", "enum", "volume", "л", 2070, {
    options: ["8", "50", "80", "100"],
    initial: "8"
  }, "options", {
    active: "membraneTank.value"
  });
  const vibration = param("vibrationCompensators", "Виброкомпенсаторы", "boolean", "flag", "", 2290, {
    initial: false
  }, "options");
  const plugs = param("collectorPlugs", "Заглушки коллекторов", "boolean", "flag", "", 2510, {
    initial: false
  }, "options");
  const valves = param("isolatingValves", "Разделительные затворы", "boolean", "flag", "", 2730, {
    initial: false
  }, "options", {
    active: "rules.valves"
  });
  const simultaneous = param("combinedCircuitsSimultaneous", "Оба контура одновременно", "boolean", "flag", "", 2950, {
    initial: false
  }, "options", {
    active: "rules.combined"
  });
  const usd = param("usdRate", "Доллар США", "float", "exchangeRate", "₽/USD", 3170, {
    required: true,
    min: .01,
    max: 10000
  });
  const cny = param("cnyRate", "Китайский юань", "float", "exchangeRate", "₽/CNY", 3390, {
    required: true,
    min: .01,
    max: 10000
  });
  const discounts = manufacturers.map((manufacturer, i) => param("discount_" + manufacturer, "Скидка " + manufacturer.toUpperCase(), "float", "percent", "%", 3610 + i * 220, {
    required: true,
    min: 0,
    max: 100
  }));
  s.rule("effectiveOptions", "Применимые опции", [jockey, valves, simultaneous, bool("fire"), bool("allowedValves"), bool("combined")], [output(bool("jockey")), output(bool("isolating")), output(bool("simultaneous"))], {
    jockey: "fire && jockeyPump",
    isolating: "allowedValves && isolatingValves",
    simultaneous: "combined && combinedCircuitsSimultaneous"
  }, {
    jockeyPump: "jockeyPump.value",
    isolatingValves: "isolatingValves.value",
    combinedCircuitsSimultaneous: "combinedCircuitsSimultaneous.value",
    fire: "rules.fire",
    allowedValves: "rules.valves",
    combined: "rules.combined"
  }, 1350, 600);
  s.rule("tankVolume", "Действующий объём бака", [tank, volume], [{
    ...volume,
    key: "value",
    required: false
  }], {
    value: "if(membraneTank,membraneTankVolume,null)"
  }, {
    membraneTank: "membraneTank.value",
    membraneTankVolume: "membraneTankVolume.value"
  }, 1350, 1900);
  const fields = [station, inlet, tank, volume, vibration, plugs, usd, cny, ...discounts, F("jockeyPump", "boolean", "flag"), F("isolatingValves", "boolean", "flag"), F("combinedCircuitsSimultaneous", "boolean", "flag"), object("main"), object("secondary")];
  const values = Object.fromEntries(fields.map(f => [f.key, f.key + ".value"]));
  Object.assign(values, {
    membraneTankVolume: "tankVolume.value",
    jockeyPump: "effectiveOptions.jockey",
    isolatingValves: "effectiveOptions.isolating",
    combinedCircuitsSimultaneous: "effectiveOptions.simultaneous",
    main: "main.value",
    secondary: "secondary.value"
  });
  s.collect("settings", "Действующие настройки", fields, values, 1650, 0);
  s.wire("settings", "value", "result", "value");
  function section(id: string, title: string, children: string[], y: number, collapsible = false) {
    s.add(id, "ui.section", 1500, y, {
      title,
      collapsible
    }, "ui");
    children.forEach((ref, i) => s.feed(id, {
      ["child" + i]: ref
    }));
    return id + ".value";
  }
  const conditional = (id: string, child: string, visible: string, y: number) => {
    s.add(id, "ui.condition", 1200, y, {}, "ui");
    s.feed(id, {
      child,
      visible
    });
    return id + ".value";
  };
  const execution = section("execution", "Исполнение установки", ["field_stationType.value", conditional("jockeyVisible", "field_jockeyPump.value", "rules.fire", 250)], 200);
  const conditions = section("conditions", "Условия на входе", ["field_inletHead.value"], 1550);
  const equipment = section("equipment", "Комплектация", ["field_membraneTank.value", conditional("volumeVisible", "field_membraneTankVolume.value", "membraneTank.value", 2100), "field_vibrationCompensators.value", "field_collectorPlugs.value", conditional("valvesVisible", "field_isolatingValves.value", "rules.valves", 2750), conditional("modeVisible", "field_combinedCircuitsSimultaneous.value", "rules.combined", 3000)], 2400);
  const finance = section("finance", "Финансовые параметры", ["field_usdRate.value", "field_cnyRate.value", ...discounts.map(f => "field_" + f.key + ".value")], 3400, true);
  s.add("save", "command.save", 1500, 4400, {}, "ui");
  s.add("form", "ui.form", 1850, 1800, {
    title: "Настройки проекта"
  }, "ui");
  [execution, "main.ui", "secondary.ui", conditions, equipment, finance].forEach((ref, i) => s.feed("form", {
    ["child" + i]: ref
  }));
  s.feed("form", {
    command: "save.value"
  });
  s.wire("form", "value", "result", "ui");
  // Keep the public context-only boundary of the instrument.
  types.find(t => t.id === "tool.settings.in")!.fields = [output(ctx())];
  const root = diagram(ROOT, "Инструменты Workspace 2", [ctx()], [object(), F("ui", "object", "view")]);
  root.add("settings", "tool.settings", 400, 20);
  root.feed("settings", {
    context: "source.context"
  });
  root.feed("result", {
    value: "settings.value",
    ui: "settings.ui"
  });
  const complete = {
    stationType: "utility",
    "main.flowRate": 10,
    "main.head": 20,
    "main.workingPumpCount": 1,
    "main.reservePumpCount": 0,
    usdRate: 85,
    cnyRate: 13,
    ...Object.fromEntries(discounts.map(f => [f.key, 0]))
  };
  const tests = [{
    id: "main-valid",
    name: "Корректный основной контур",
    values: complete,
    expected: {
      "value.main.flowRate": 10,
      "value.secondary": null
    }
  }, {
    id: "missing",
    name: "Пустой обязательный расход",
    values: {
      ...complete,
      "main.flowRate": null
    },
    errors: ["main.flowRate"]
  }, {
    id: "integer",
    name: "Целое количество насосов",
    values: {
      ...complete,
      "main.workingPumpCount": 1.5
    },
    errors: ["main.workingPumpCount"]
  }, {
    id: "combined",
    name: "Второй контур совмещённой установки",
    values: {
      ...complete,
      stationType: "combined",
      "secondary.flowRate": 5,
      "secondary.head": 15,
      "secondary.workingPumpCount": 1,
      "secondary.reservePumpCount": 0
    },
    expected: {
      "value.secondary.flowRate": 5
    }
  }, {
    id: "jockey",
    name: "Контур жокей-насоса",
    values: {
      ...complete,
      stationType: "fire",
      jockeyPump: true,
      "secondary.flowRate": 3
    },
    expected: {
      "value.secondary.flowRate": 3
    }
  }, {
    id: "inactive",
    name: "Отключённый контур сохраняет ввод",
    values: {
      ...complete,
      "secondary.flowRate": 7
    },
    expected: {
      "value.secondary": null
    }
  }, {
    id: "tank",
    name: "Включение мембранного бака",
    values: {
      ...complete,
      membraneTank: true,
      membraneTankVolume: "50"
    },
    expected: {
      "value.membraneTankVolume": "50"
    }
  }, {
    id: "contour-source",
    name: "Отдельный Instrument контура",
    diagram: "tool.contour",
    values: complete,
    expected: {
      "value.flowRate": 10
    }
  }, {
    id: "base-permission",
    name: "Права base на тип установки",
    role: "base" as const,
    values: complete,
    expected: {
      "bindings.0.editable": false
    }
  }];
  return {
    schema: 1,
    types,
    diagrams,
    tools: [{
      id: "settings",
      name: "Настройки проекта",
      category: "Ввод",
      diagram: ROOT,
      tests
    }]
  };
}

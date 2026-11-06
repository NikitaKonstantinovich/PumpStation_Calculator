"use client";

import { useState } from "react";
import { accepts, makeField, validKey, type DataKind, type Document, type Field, type NodeType } from "./schema";
import {usesInStation} from "./uses";
import { compileExpression } from "./expression";
const kinds: DataKind[] = ["number", "string", "boolean", "enum", "reference", "object", "array"];
const kindLabels = ["Число", "Строка", "Логическое", "Перечисление", "Ссылка", "Объект", "Массив"];
export function TypeEditor({
  original,
  doc,
  close,
  save,
  navigate
}: {
  original: NodeType;
  doc: Document;
  close: () => void;
  save: (t: NodeType) => void;
  navigate: (g: string, n: string,path?:string[]) => void;
}) {
  const [type, setType] = useState<NodeType>(() => structuredClone(original)),
    [error, setError] = useState("");
  const instances = doc.diagrams.flatMap(g => g.nodes.filter(n => n.type === original.id).map(n => ({
    g,
    n
  })));
  const paths=usesInStation(doc,original.id);
  function patch(index: number, change: Partial<Field>) {
    setType(t => ({
      ...t,
      fields: t.fields.map((f, i) => i === index ? {
        ...f,
        ...change
      } : f)
    }));
  }
  function remove(index: number) {
    const field = type.fields[index],
      uses = instances.filter(({
        n,
        g
      }) => g.edges.some(e => e.from === n.id && e.out === field.key || e.to === n.id && e.input === field.key));
    if (uses.length) {
      setError("Сначала отключите поле: " + uses.map(({
        g,
        n
      }) => g.name + " → " + n.name + "." + field.name).join(", "));
      return;
    }
    setType(t => ({
      ...t,
      fields: t.fields.filter((_, i) => i !== index),
      formulas: Object.fromEntries(Object.entries(t.formulas).filter(([k]) => k !== field.key))
    }));
  }
  const submit = () => {
    try {
      if (!type.name.trim() || new Set(type.fields.map(f => f.key)).size !== type.fields.length) throw Error("Введите название и уникальные ключи полей.");
      for (const f of type.fields) {
        if (!validKey(f.key) || !/^\w+$/.test(f.key) || !f.name.trim() || !f.meaning.trim()) throw Error("Для каждого поля укажите ключ, название и инженерный смысл.");
        if (f.initial != null && !accepts(f, f.initial)) throw Error(f.name + " · проверьте значение по умолчанию.");
        if (f.kind === "enum" && !f.options?.length) throw Error(f.name + " · перечислите варианты.");
      }
      for (const [k, v] of Object.entries(type.formulas)) if (v) compileExpression(v, new Set(type.fields.filter(f => f.direction !== "output").map(f => f.key)));else throw Error(k + " · пустая формула");
      save(type);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return <div className="gn-shade"><section role="dialog" aria-modal="true" aria-label="Определение типа" className="gn-dialog">
    <header><h2>Определение типа</h2><button onClick={close}>Закрыть</button></header>
    <div className="gn-form"><label>Название<input value={type.name} onChange={e => setType({
            ...type,
            name: e.target.value
          })} /></label><label>Категория<input value={type.category} onChange={e => setType({
            ...type,
            category: e.target.value
          })} /></label><label>Описание<textarea value={type.description} onChange={e => setType({
            ...type,
            description: e.target.value
          })} /></label></div>
    {paths.length>0&&<details open><summary>Экземпляры на полотне · {paths.length}</summary>{paths.map(p=><button key={[...p.path,p.node].join("/")} onClick={()=>navigate(p.diagram,p.node,p.path)}>{p.name} · связей {p.links}</button>)}</details>}
    {!paths.length&&instances.length > 0 && <details open><summary>Затронутые узлы · {instances.length}</summary>{instances.map(({
          g,
          n
        }) => <button key={g.id + n.id} onClick={() => navigate(g.id, n.id)}>{g.name} → {n.name} · связей {g.edges.filter(e=>e.from===n.id||e.to===n.id).length}</button>)}</details>}
    {type.instrument&&<small>Функции редактируются внутри Instrument. Укажите входы и выходы границы.</small>}
    {type.fields.map((f, i) => <fieldset key={i}><legend>{f.name || "Новый атрибут"}</legend><div className="gn-form">
      <label>Стабильный ключ<input value={f.key} disabled={original.fields.some(old => old.key === f.key)} onChange={e => patch(i, {
              key: e.target.value
            })} /></label>
      <label>Имя атрибута<input value={f.name} onChange={e => patch(i, {
              name: e.target.value
            })} /></label>
      <label>Тип данных<select value={f.kind} onChange={e => patch(i, {
              kind: e.target.value as DataKind,
              initial: undefined
            })}>{kinds.map((k, i) => <option key={k} value={k}>{kindLabels[i]}</option>)}</select></label>
      <label>Направление<select value={f.direction} onChange={e => patch(i, {
              direction: e.target.value as Field["direction"]
            })}><option value="both">Вход и выход</option><option value="input">Вход</option><option value="output">Выход</option></select></label>
      <label>Инженерный смысл<input placeholder="Например, mass или dn" value={f.meaning} onChange={e => patch(i, {
              meaning: e.target.value
            })} /></label>
      <label>Единица<input value={f.unit} onChange={e => patch(i, {
              unit: e.target.value
            })} /></label>
      <label>По умолчанию (JSON)<input defaultValue={JSON.stringify(f.initial) ?? ""} onBlur={e => {
              try {
                patch(i, {
                  initial: e.target.value ? JSON.parse(e.target.value) : undefined
                });
                setError("");
              } catch {
                setError("Значение по умолчанию должно быть JSON");
              }
            }} /></label>
      <label><input type="checkbox" checked={!!f.required} onChange={e => patch(i, {
              required: e.target.checked
            })} /> Обязательный</label>
      {f.kind === "number" && (["min", "max"] as const).map(k => <label key={k}>{k === "min" ? "Минимум" : "Максимум"}<input type="number" value={f[k] ?? ""} onChange={e => patch(i, {
              [k]: e.target.value === "" ? undefined : Number(e.target.value)
            })} /></label>)}
      {f.kind === "enum" && <label>Варианты через запятую<input value={f.options?.join(",") ?? ""} onChange={e => patch(i, {
              options: e.target.value.split(",").map(s => s.trim())
            })} /></label>}
    </div>{!type.instrument && f.direction !== "input" && <label>Функция выхода {f.key}<textarea placeholder="Например, mass * count" value={type.formulas[f.key] ?? ""} onChange={e => {
            const formulas = {
              ...type.formulas
            };
            if (e.target.value) formulas[f.key] = e.target.value;else delete formulas[f.key];
            setType({
              ...type,
              formulas
            });
          }} /></label>}
    <button onClick={() => remove(i)}>Удалить атрибут</button></fieldset>)}
    <button onClick={() => setType({
        ...type,
        fields: [...type.fields, makeField("field_" + crypto.randomUUID().slice(0, 6), "Новый атрибут", "number", "number")]
      })}>+ Атрибут</button>
    {error && <p role="alert">{error}</p>}<footer><button className="gn-primary" onClick={submit}>Применить определение</button></footer>
  </section></div>;
}

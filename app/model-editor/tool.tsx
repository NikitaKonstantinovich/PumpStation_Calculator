"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ModelEntity, ProjectConfig } from "../project-config";
import type { Pump } from "../pump-catalog";
import { useRuntimeDiagnostic } from "../diagnostics-ui";
import {
  addManualPipe, assemblyBounds, buildAssembly, componentBounds, connectionIssues, createHistory, dimensions,
  distance, editComponent, emptyEditor, execute, mergeAssembly, pipePoints, redo, routeLength, setAutomaticRoute,
  sourceFingerprint, undo, type Assembly, type Component, type Edit, type EditorState, type ProfileCatalog, type Vec3,
} from "./model";
import type { ViewportHandle, EditorMode } from "./viewport";
import { SnapDialog } from "./snap-dialog";
import { defaultSnaps } from "./snap-settings";
import { localPoint, snapGeometry, workingPlane, type SnapLine } from "./snap-geometry";
import { moveByPoints, type SnapPick } from "./snap-engine";
import "./editor.css";

const Viewport = lazy(() => import("./viewport"));
const EMPTY_PROFILES: ProfileCatalog = { version: 1, profiles: {} };
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const sizeText = (b: ReturnType<typeof assemblyBounds>) => b ? dimensions(b).map(fmt).join(" × ") + " мм" : "—";

function NumberField({ label, value, disabled = false, min, onCommit }: { label: string; value: number; disabled?: boolean; min?: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelBlur = useRef(false);
  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft.replace(",", "."));
    if (draft.trim() && Number.isFinite(parsed) && Math.abs(parsed) <= 1e6 && (min === undefined || parsed >= min) && Math.abs(parsed - value) > .00001) onCommit(parsed);
    setDraft(null);
  };
  return <label className="model-editor__number"><span>{label}</span><input aria-label={label} type="text" inputMode="decimal" disabled={disabled} value={draft ?? String(Number(value.toFixed(2)))} onChange={e => setDraft(e.target.value)} onBlur={() => { if (cancelBlur.current) { cancelBlur.current = false; return; } commit(); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { cancelBlur.current = true; setDraft(null); e.currentTarget.blur(); } }}/></label>;
}

export function ModelTool({ project, catalogue, entity, onChange }: {
  project: ProjectConfig; catalogue: Pump[]; entity: ModelEntity; onChange: (next: ModelEntity) => void;
}) {
  const [profiles, setProfiles] = useState<ProfileCatalog | null>(null), [catalogError, setCatalogError] = useState("");
  const [assetError, setAssetError] = useState("");
  const [mode, setMode] = useState<EditorMode>("translate");
  const [measurement, setMeasurement] = useState<SnapPick[]>([]);
  const [snapOpen, setSnapOpen] = useState(false);
  const [references, setReferences] = useState<SnapPick[]>([]);
  const [parallelLine, setParallelLine] = useState<SnapLine>();
  const [move, setMove] = useState<{ id: string; source?: SnapPick; target?: SnapPick }>();
  const [operationNote, setOperationNote] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<ViewportHandle>(null);
  const toolRoot = useRef<HTMLDivElement>(null);
  const editor = entity.editor ?? emptyEditor();
  const snaps = editor.objectSnaps ?? defaultSnaps();
  const generated = useMemo(() => buildAssembly(project, catalogue, profiles ?? EMPTY_PROFILES), [project, catalogue, profiles]);
  const assembly = editor.assembly ?? generated;
  const missingPlane = useMemo(() => snaps.plane === "face" && !workingPlane(snaps, snapGeometry(assembly)), [snaps, assembly]);
  const displayAssembly = useMemo(() => move?.source && move.target ? moveByPoints(assembly, move.id, move.source.point, move.target.point) : assembly, [assembly, move]);
  const [history, setHistory] = useState(() => createHistory(assembly));
  const currentHistory = history.present === assembly ? history : createHistory(assembly);
  const selected = assembly.components.find(c => c.id === editor.selectedId);
  const stale = Boolean(editor.assembly && editor.assembly.sourceFingerprint !== sourceFingerprint(project));
  const issues = useMemo(() => connectionIssues(assembly), [assembly]);
  const sourceWarnings = assembly.components.filter(c => c.kind === "pump").map(c => c.sourceNote);
  const diagnostic = [...(stale ? ["Состав установки изменён. Обновите состав в 3D-редакторе; ручная компоновка сохранена."] : []), ...issues.map(i => i.message), catalogError, assetError].filter(Boolean).join("\n");
  useRuntimeDiagnostic("model", "assembly", diagnostic, "warning");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/model-assets/manifest.json", { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then((data: ProfileCatalog) => {
      if (data.version !== 1 || !data.profiles || typeof data.profiles !== "object") throw new Error();
      setProfiles(data);
    }).catch(error => { if (error.name !== "AbortError") { setCatalogError("Библиотека CAD недоступна; используется габаритное представление по каталогу."); setProfiles(EMPTY_PROFILES); } });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const dialog = resetDialog.current;
    if (!dialog) return;
    if (resetOpen && !dialog.open) dialog.showModal();
    if (!resetOpen && dialog.open) dialog.close();
  }, [resetOpen]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !toolRoot.current?.contains(event.target as Node) || (event.target as HTMLElement).closest("input,select,textarea,dialog")) return;
      setMove(undefined); setMode("translate"); setOperationNote(""); setMeasurement([]);
      if (mode === "between1" || mode === "between2") setReferences([]);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [mode]);

  const update = (patch: Partial<EditorState>) => onChange({ ...entity, editor: { ...editor, ...patch } });
  const commit = (next: Assembly) => {
    if (move) { setMove(undefined); setMode("translate"); }
    const nextHistory = execute(currentHistory, next); setHistory(nextHistory);
    update({ assembly: nextHistory.present });
  };
  const edit = (id: string, patch: Edit["patch"]) => commit(editComponent(assembly, { id, patch }));
  const cancelOperation = () => { if (mode === "between1" || mode === "between2") setReferences([]); setMove(undefined); setMode("translate"); setOperationNote(""); };
  const activate = (next: EditorMode) => { setMove(undefined); setMode(next); setOperationNote(""); };
  const changeMode = (value: string) => {
    cancelOperation();
    onChange({ ...entity, mode: value === "editor" ? "editor" : "preview", editor: { ...editor, assembly: editor.assembly ?? generated } });
  };
  const changeParameter = (c: Component, key: keyof Component["parameters"], value: number) => edit(c.id, { parameters: { ...c.parameters, [key]: value } });
  const undoEdit = () => { cancelOperation(); const next = undo(currentHistory); setHistory(next); update({ assembly: next.present }); };
  const redoEdit = () => { cancelOperation(); const next = redo(currentHistory); setHistory(next); update({ assembly: next.present }); };
  const numericPose = (c: Component, key: "position" | "rotation", axis: number, value: number) => {
    const next = [...c[key]] as Vec3;
    next[axis] = key === "position" && editor.snap ? Math.round(value / editor.snapStep) * editor.snapStep : value;
    edit(c.id, { [key]: next });
  };
  const pick = (point: SnapPick) => {
    if (mode === "measure") setMeasurement(current => current.length >= 2 || current.length > 0 && current[0].projected !== point.projected ? [point] : [...current, point]);
    if (mode === "move" && move && !move.target) {
      if (!move.source && point.componentId !== move.id) return;
      setMove({ ...move, ...(move.source ? { target: point } : { source: point }) });
    }
    if (mode === "reference1" || mode === "between1") { setReferences([point]); setMode(mode === "between1" ? "between2" : "measure"); setOperationNote("Опорная точка выбрана. Можно измерять или начать перемещение."); }
    if (mode === "between2") { setReferences(current => [...current.slice(0, 1), point]); setMode("measure"); setOperationNote("Две опоры выбраны. Наведите курсор на их середину."); }
    if (mode === "addReference") {
      const c = assembly.components.find(c => c.id === point.componentId);
      if (c) { update({ referencePoints: [...(editor.referencePoints ?? []), { id: crypto.randomUUID(), componentId: c.id, point: localPoint(c, point.point), approximate: point.approximate }] }); setMode("translate"); setOperationNote("Опорная точка сохранена. Её привязка включается в настройках."); }
    }
  };
  const bounds = assemblyBounds(assembly);
  const selectedBounds = selected ? componentBounds(assembly, selected) : null;
  const transformDisabled = !selected || selected.locked || Boolean(selected.routing?.automatic);
  const constructionReference = references[0] ?? (mode === "move" ? move?.source : mode === "measure" && measurement.length === 1 ? measurement[0] : undefined);

  return <div className="model-tool" ref={toolRoot}>
    <div className="model-tool__mode"><label>Режим <select aria-label="Режим 3D модели" value={entity.mode ?? "preview"} disabled={!profiles} onChange={event => changeMode(event.target.value)}><option value="preview">Эскиз установки</option><option value="editor">3D редактор</option></select></label><span>{profiles ? "мм · Z вверх" : "Загрузка библиотеки…"}</span></div>
    {entity.mode !== "editor" ? <div className="model-view"><div className="model-view__stage"><span className="model-view__pipe model-view__pipe--one"/><span className="model-view__pipe model-view__pipe--two"/><span className="model-view__pump model-view__pump--one"/><span className="model-view__pump model-view__pump--two"/><span className="model-view__pump model-view__pump--three"/><b>3D</b></div><p className="model-tool__preview-note">Условный эскиз. Для работы с составом проекта выберите «3D редактор».</p></div> : <div className="model-editor" aria-label="3D редактор установки">
      <div className="model-editor__toolbar" role="toolbar" aria-label="Инструменты 3D редактора">
        <button onClick={undoEdit} disabled={!currentHistory.past.length} title="Отменить последнее изменение модели">↶ Отмена</button><button onClick={redoEdit} disabled={!currentHistory.future.length}>↷ Повтор</button>
        <span className="model-editor__separator"/>
        <button aria-pressed={mode === "translate"} onClick={() => activate("translate")}>Переместить</button><button aria-pressed={mode === "rotate"} onClick={() => activate("rotate")}>Повернуть</button><button aria-pressed={mode === "measure"} onClick={() => { activate("measure"); setMeasurement([]); }}>Измерить</button>
        <button disabled={transformDisabled || selected?.hidden} aria-pressed={mode === "move"} onClick={() => { if (selected) { setMove({ id: selected.id }); setMode("move"); setOperationNote(""); } }}>Переместить по точкам</button>
        <button onClick={() => setSnapOpen(true)}>Настройки привязок</button>
        <button onClick={() => activate("reference1")}>Опора</button><button disabled={!snaps.types.between} onClick={() => activate("between1")}>Две опоры</button><button disabled={!snaps.types.parallel} onClick={() => activate("parallelEdge")}>Ребро</button>
        <button disabled={(editor.referencePoints?.length ?? 0) >= 500} onClick={() => activate("addReference")}>Добавить опорную точку</button>
        <button onClick={() => viewport.current?.fit()}>Показать всё</button>
        <select aria-label="Стандартный вид" defaultValue="" onChange={event => { viewport.current?.standard(event.target.value as "front" | "top" | "right" | "iso"); event.currentTarget.value = ""; }}><option value="" disabled>Вид…</option><option value="iso">Изометрия</option><option value="front">Спереди</option><option value="top">Сверху</option><option value="right">Справа</option></select>
        <label><input type="checkbox" checked={editor.grid} onChange={e => update({ grid: e.target.checked })}/>Сетка</label><label><input type="checkbox" checked={editor.snap} onChange={e => update({ snap: e.target.checked })}/>К сетке</label><label>Шаг <select aria-label="Шаг привязки, мм" value={editor.snapStep} onChange={e => update({ snapStep: Number(e.target.value) })}>{[1, 5, 10, 25, 50, 100, 250, 500, ...(![1, 5, 10, 25, 50, 100, 250, 500].includes(editor.snapStep) ? [editor.snapStep] : [])].sort((a, b) => a - b).map(v => <option key={v} value={v}>{v} мм</option>)}</select></label>
        <button disabled={!catalogue.length || !profiles} onClick={() => commit(mergeAssembly(assembly, generated))}>Обновить состав</button>
        <button disabled={!catalogue.length || !profiles} onClick={() => setResetOpen(true)}>Автокомпоновка</button>
        <button disabled={assembly.components.length >= 500} onClick={() => commit(addManualPipe(assembly, `manual-pipe-${crypto.randomUUID()}`))}>＋ Труба</button>
      </div>
      {missingPlane && <p className="model-editor__notice" role="status">Рабочая грань недоступна: компонент скрыт, удалён или геометрия изменилась. Выберите другую грань либо XY/XZ/YZ в настройках. Проекционный выбор приостановлен.</p>}
      {(operationNote || !["translate", "rotate", "measure"].includes(mode)) && <div className="model-editor__operation" role="status">
        <span>{mode === "move" ? !move?.source ? "1. Выберите базовую точку перемещаемого компонента" : !move.target ? "2. Выберите целевую точку. Tab — перебор близких привязок" : `3. Предпросмотр: ${move.source.label} → ${move.target.label}${move.target.projected ? " · Проекция" : ""}` : mode === "planeFace" ? "Выберите прямоугольную грань рамы или круглый торец трубы" : mode === "parallelEdge" ? "Выберите прямое ребро или осевой сегмент для параллельного направления" : mode === "addReference" ? "Выберите точку компонента для сохранения" : ["reference1", "between1"].includes(mode) ? "Выберите опорную точку в сцене" : mode === "between2" ? "Выберите вторую опорную точку" : operationNote}</span>
        {move?.target && <><button onClick={() => { commit(displayAssembly); cancelOperation(); }}>Подтвердить перемещение</button><button onClick={() => setMove({ ...move, target: undefined })}>Изменить цель</button></>}
        <button onClick={cancelOperation}>Отменить действие</button>
      </div>}
      {references.length > 0 && <div className="model-editor__reference-status">Опоры: {references.map(p => p.point.map(fmt).join("; ")).join(" | ")}{parallelLine && " · Ребро для параллельного направления выбрано"}<button onClick={() => { setReferences([]); setParallelLine(undefined); }}>Сбросить опоры</button></div>}
      {stale && <p className="model-editor__notice" role="status">Состав проекта изменился. Нажмите «Обновить состав»: ручные положения и размеры будут сохранены.</p>}
      <div className="model-editor__layout">
        <aside className="model-editor__tree" aria-label="Дерево сборки"><h3>Сборка <small>{assembly.components.length}</small></h3>
          {!assembly.components.length && <p>Выберите насос в подборе, затем нажмите «Обновить состав».</p>}
          {assembly.components.map(c => <div key={c.id} className={`model-editor__tree-row ${selected?.id === c.id ? "is-selected" : ""}`}>
            <button className="model-editor__tree-name" aria-pressed={selected?.id === c.id} title={c.name} onClick={() => update({ selectedId: c.id })}><span aria-hidden="true">{c.kind === "pump" ? "◉" : c.kind === "frame" ? "▱" : "━"}</span>{c.name}{c.orphaned && " ⚠"}</button>
            <input aria-label={`Показывать ${c.name}`} type="checkbox" checked={!c.hidden} onChange={e => edit(c.id, { hidden: !e.target.checked })}/>
            <input aria-label={`Зафиксировать ${c.name}`} title="Зафиксировать" type="checkbox" checked={c.locked} onChange={e => edit(c.id, { locked: e.target.checked })}/>
          </div>)}
          <p className="model-editor__tree-key">Флажки: видимость / фиксация</p>
        </aside>
        <div className="model-editor__stage">
          <Suspense fallback={<div className="model-editor__loading">Загрузка 3D-сцены…</div>}>
            <Viewport ref={viewport} assembly={displayAssembly} selectedId={editor.selectedId}
              grid={editor.grid} snapStep={editor.snap ? editor.snapStep : null} mode={mode} camera={editor.camera}
              measurement={measurement.map(p => p.point)} snaps={snaps} referencePoints={editor.referencePoints ?? []}
              reference={constructionReference?.point} referenceApproximate={constructionReference?.approximate}
              secondReference={references[1]?.point} secondReferenceApproximate={references[1]?.approximate}
              parallelLine={parallelLine} movingId={move?.id} moveHasSource={!!move?.source} preview={!!move?.target}
              onPick={pick} onCancel={() => { cancelOperation(); setMeasurement([]); }}
              onLine={line => { setParallelLine(line); setMode("reference1"); setOperationNote(""); }}
              onPlane={face => { setMeasurement([]); update({ objectSnaps: { ...snaps, plane: "face", face: { componentId: face.componentId, featureId: face.id } } }); setMode("measure"); setOperationNote("Рабочая плоскость выбрана. Для проекции включите соответствующий флажок."); }}
              onSelect={selectedId => { cancelOperation(); update({ selectedId }); }}
              onTransform={(id, position, rotation) => edit(id, { position, rotation })}
              onCamera={camera => update({ camera })} onAssetError={message => setAssetError(message)}/>
          </Suspense>
          <div className="model-editor__axes" aria-hidden="true"><span>X</span><span>Y</span><span>Z ↑</span></div>
          <p className="model-editor__hint">{mode === "measure" || mode === "move" ? "Точка: щелчок · Tab: следующая привязка · Escape: отмена · перетаскивание: камера" : "ЛКМ — вращение · ПКМ — панорама · колесо — масштаб"}</p>
          {measurement.length > 0 && <div className="model-editor__measurement" role="status">{measurement.length === 2 ? `${measurement.some(p => p.approximate) ? "≈ " : ""}${fmt(distance(measurement[0].point, measurement[1].point))} мм · ${measurement[0].projected ? "Проекция" : "3D"}` : "Выберите вторую точку"}<button onClick={() => setMeasurement([])} aria-label="Сбросить измерение">×</button></div>}
        </div>
        <aside className="model-editor__properties" aria-label="Свойства компонента">
          <h3>Свойства</h3>{selected ? <div key={selected.id}>
            <b>{selected.name}</b><p className="model-editor__source">{selected.sourceNote}</p>
            {selected.cadSource && <details><summary>Источник модели</summary><p className="model-editor__source">{selected.cadSource.path.split("/").pop()}</p></details>}
            <label className="model-editor__toggle"><input type="checkbox" checked={selected.locked} onChange={e => edit(selected.id, { locked: e.target.checked })}/>Зафиксировать компонент</label>
            <label className="model-editor__toggle"><input type="checkbox" checked={!selected.hidden} onChange={e => edit(selected.id, { hidden: !e.target.checked })}/>Показывать компонент</label>
            <label className="model-editor__opacity">Непрозрачность <input aria-label="Непрозрачность компонента" type="range" min="0.1" max="1" step="0.1" value={selected.opacity} onChange={e => edit(selected.id, { opacity: Number(e.target.value) })}/></label>
            {selected.routing && <label className="model-editor__toggle"><input type="checkbox" checked={selected.routing.automatic} disabled={selected.locked} onChange={e => commit(setAutomaticRoute(assembly, selected.id, e.target.checked))}/>Следовать патрубкам</label>}
            {selected.routing?.automatic && <p className="model-editor__source">Трасса перестраивается по патрубкам. Для перемещения отключите «Следовать патрубкам».</p>}
            <h4>Положение, мм</h4>{(["X", "Y", "Z"] as const).map((label, i) => <NumberField key={label} label={`${label}, мм`} value={selected.position[i]} disabled={transformDisabled} onCommit={value => numericPose(selected, "position", i, value)}/>)}
            <h4>Поворот, °</h4>{(["X", "Y", "Z"] as const).map((label, i) => <NumberField key={label} label={`Поворот ${label}, °`} value={selected.rotation[i]} disabled={transformDisabled} onCommit={value => numericPose(selected, "rotation", i, value)}/>)}
            {selected.kind === "frame" && <><h4>Размеры рамы, мм</h4>{(["length", "width", "height"] as const).map((key, i) => <NumberField key={key} label={["Длина, мм", "Ширина, мм", "Высота, мм"][i]} value={selected.parameters[key]} min={1} disabled={selected.locked} onCommit={v => changeParameter(selected, key, v)}/>)}</>}
            {(selected.kind === "collector" || selected.kind === "pipe") && <><h4>Геометрия, мм</h4>{(!selected.routing) && <NumberField label="Длина, мм" value={selected.parameters.length} disabled={selected.locked} min={1} onCommit={v => changeParameter(selected, "length", v)}/>}<NumberField label="Наружный диаметр, мм" value={selected.parameters.diameter} disabled={selected.locked} min={1} onCommit={v => changeParameter(selected, "diameter", v)}/>{selected.routing?.automatic && <NumberField label="Отступ трассы, мм" value={selected.parameters.routeOffset} disabled={selected.locked} onCommit={v => changeParameter(selected, "routeOffset", v)}/>}</>}
            {selected.kind === "pipe" && <p>Длина по оси: {fmt(routeLength(assembly, selected))} мм</p>}
            <h4>Габариты в осях установки</h4><p data-testid="component-dimensions">{sizeText(selectedBounds)}</p>
            {selected.ports.length > 0 && <details><summary>Точки подключения ({selected.ports.length})</summary>{selected.ports.map(p => <p key={p.id}>{p.id}: {p.point.map(fmt).join("; ")} мм{p.provisional ? " · предварительно" : ""}</p>)}</details>}
            {selected.routing && <details><summary>Точки трассы</summary>{pipePoints(assembly, selected).map((p, i) => <p key={i}>{p.map(fmt).join("; ")} мм</p>)}</details>}
          </div> : <p>Выберите компонент в сцене или дереве сборки.</p>}
        </aside>
      </div>
      <div className="model-editor__status"><span>Габариты установки: <b data-testid="assembly-dimensions">{sizeText(bounds)}</b></span><span>Упрощённая монтажная модель · {issues.length ? `замечаний: ${issues.length}` : "разрывов соединений не обнаружено"}</span></div>
      <details className="model-editor__diagnostics" open={Boolean(diagnostic)}><summary>Данные и замечания</summary><p>Трубы и рама — параметрическая компоновочная геометрия. Арматура и крепёж пока не моделируются. Ручные размеры редактора не изменяют гидравлический расчёт и спецификацию.</p>{[...new Set(sourceWarnings)].map(note => <p key={note}>{note}</p>)}{diagnostic && <p role="status">{diagnostic}</p>}</details>
      <dialog ref={resetDialog} className="model-editor__reset" aria-label="Повторная автокомпоновка" onCancel={() => setResetOpen(false)}><b>Построить новую компоновку?</b><p>Будут заменены ручные положения, размеры, фиксации и добавленные трубы. Текущее состояние можно вернуть кнопкой «Отмена» в редакторе.</p><button onClick={() => { commit(generated); updateSelectionAfterReset(); }}>Построить заново</button><button onClick={() => setResetOpen(false)}>Сохранить ручные правки</button></dialog>
      <SnapDialog open={snapOpen} settings={snaps} grid={editor.snap} gridStep={editor.snapStep} onChange={objectSnaps => {
        if (objectSnaps.plane !== snaps.plane || objectSnaps.types.project !== snaps.types.project) setMeasurement([]);
        update({ objectSnaps });
      }} onGrid={(snap, snapStep) => update({ snap, snapStep })} onClose={() => setSnapOpen(false)} onPlaneFace={() => { setSnapOpen(false); activate("planeFace"); }} references={editor.referencePoints?.length ?? 0} onClearReferences={() => update({ referencePoints: [] })}/>
    </div>}
  </div>;

  function updateSelectionAfterReset() { setResetOpen(false); setMeasurement([]); }
}

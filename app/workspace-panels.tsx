"use client";
import { useEffect, useRef, useState } from "react";
import type { PanelKind, PanelState, WorkspaceGrid, WorkspaceMode } from "./project-config";
import { PANEL_INFO, ENTITY_BY_TOOL } from "./tool-registry";
import { DiagnosticSurface } from "./diagnostics-ui";
import { PANEL_RESIZE_DIRECTIONS, panelGeometryAt, type PanelGeometry, type PanelGesture, type PanelResizeDirection } from "./panel-gesture";

function orderedTools(isToolEnabled: (tool: PanelKind) => boolean, secondaryEnabled: boolean): PanelKind[] {
  const available = (tool: PanelKind) => isToolEnabled(tool) && (secondaryEnabled || !["input2", "chart2", "sketch2"].includes(tool));
  return (Object.keys(PANEL_INFO) as PanelKind[]).sort((a, b) => Number(available(b)) - Number(available(a)));
}

export function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = { menu: "☰", close: "×", undo: "↶", redo: "↷", external: "↗", more: "•••", cube: "◇" };
  return <span aria-hidden="true">{icons[name] ?? name}</span>;
}

export function FloatingPanel({ panel, zoom, layoutMode="free", content, onFocus, onChange, onDetach, onMinimize, onClose, secondaryEnabled, isToolEnabled = () => true }: { panel:PanelState; zoom:number; layoutMode?:WorkspaceMode; content:React.ReactNode; onFocus:()=>void; onChange:(panel:PanelState)=>void; onDetach:()=>void; onMinimize:()=>void; onClose:()=>void; secondaryEnabled:boolean; isToolEnabled?:(tool:PanelKind)=>boolean }) {
  const element = useRef<HTMLElement>(null);
  const start = useRef<(PanelGesture & { pointerId: number; canvas: HTMLElement; scrollLeft: number; scrollTop: number; x: number; y: number; moved: boolean }) | null>(null);
  const frame = useRef<number | null>(null);
  const [preview, setPreview] = useState<{ mode: PanelGesture["mode"]; geometry: PanelGeometry } | null>(null);
  const docked = layoutMode !== "free";
  const cancelFrame = () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; };
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const begin = (mode: PanelGesture["mode"], event: React.PointerEvent, resizeDirection?: PanelResizeDirection) => {
    if (docked || window.innerWidth < 760 || event.button !== 0 || !event.isPrimary || start.current) return;
    const canvas = event.currentTarget.closest<HTMLElement>(".workspace__canvas"), node = element.current;
    if (!canvas || !node) return;
    event.preventDefault(); event.stopPropagation();
    const style = getComputedStyle(node);
    start.current = { mode, resizeDirection, origin: { x: panel.x, y: panel.y, w: node.offsetWidth, h: node.offsetHeight },
      pointerX: event.clientX, pointerY: event.clientY, scale: zoom / 100,
      canvasWidth: canvas.clientWidth, canvasHeight: canvas.clientHeight,
      minWidth: parseFloat(style.minWidth) || 280, minHeight: parseFloat(style.minHeight) || 220,
      pointerId: event.pointerId, canvas, scrollLeft: canvas.scrollLeft, scrollTop: canvas.scrollTop,
      x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    onFocus();
  };
  const updatePointer = (gesture: NonNullable<typeof start.current>, event: React.PointerEvent) => {
    gesture.x = event.clientX + gesture.canvas.scrollLeft - gesture.scrollLeft;
    gesture.y = event.clientY + gesture.canvas.scrollTop - gesture.scrollTop;
    gesture.moved ||= Math.hypot(gesture.x - gesture.pointerX, gesture.y - gesture.pointerY) >= 3;
  };
  const move = (event: React.PointerEvent) => {
    const gesture = start.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    updatePointer(gesture, event);
    if (!gesture.moved || frame.current !== null) return;
    // Animate only this frame. Commit geometry to the workspace, undo history
    // and persistence once on release, rather than for every pointer event.
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const current = start.current;
      if (current) setPreview({ mode: current.mode, geometry: panelGeometryAt(current, current.x, current.y) });
    });
  };
  const cancel = (event: React.PointerEvent) => {
    if (start.current?.pointerId !== event.pointerId) return;
    cancelFrame(); start.current = null; setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const end = (event: React.PointerEvent) => {
    const gesture = start.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    updatePointer(gesture, event);
    cancelFrame(); start.current = null; setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!gesture.moved) return;
    const geometry = panelGeometryAt(gesture, gesture.x, gesture.y, gesture.mode === "drag");
    const next = gesture.mode === "drag" ? { ...panel, x: geometry.x, y: geometry.y } : { ...panel, ...geometry };
    if (next.x !== panel.x || next.y !== panel.y || next.w !== panel.w || next.h !== panel.h) onChange(next);
    const box = gesture.canvas.getBoundingClientRect(), detachDistance = 56;
    if (gesture.mode === "drag" && (event.clientX < box.left - detachDistance || event.clientX > box.right + detachDistance || event.clientY < box.top - detachDistance || event.clientY > box.bottom + detachDistance)) onDetach();
  };
  const tool=panel.activeTool;
  const resizing = preview?.mode === "resize" ? preview.geometry : null;
  return <article ref={element} data-panel-id={panel.id} className={`floating-panel floating-panel--${tool??"empty"} ${docked?`floating-panel--docked floating-panel--${layoutMode}`:""}`} style={docked?undefined:{ left: resizing?.x ?? panel.x, top: resizing?.y ?? panel.y, width: resizing?.w ?? panel.w, height: resizing?.h ?? panel.h, zIndex: panel.z, transform: preview?.mode === "drag" ? `translate3d(${preview.geometry.x - panel.x}px, ${preview.geometry.y - panel.y}px, 0)` : undefined, willChange: preview?.mode === "drag" ? "transform" : undefined }} onPointerDown={onFocus}>
    <header className="floating-panel__header" onPointerDown={(e) => begin("drag", e)} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel}>
      <div className="floating-panel__identity"><span className="floating-panel__eyebrow">{tool?PANEL_INFO[tool].eyebrow:"НОВЫЙ ИНСТРУМЕНТ"}</span><select value={tool??""} aria-label="Выбрать инструмент" onPointerDown={e=>e.stopPropagation()} onChange={e=>{const activeTool=e.target.value as PanelKind;if(isToolEnabled(activeTool))onChange({...panel,activeTool,entityId:ENTITY_BY_TOOL[activeTool],...(activeTool==="assistant"?{w:Math.max(panel.w,420),h:Math.max(panel.h,520)}:{})})}}><option value="" disabled>Выберите инструмент</option>{orderedTools(isToolEnabled, secondaryEnabled).map(kind=>{const secondary=kind==="input2"||kind==="chart2"||kind==="sketch2";return <option key={kind} value={kind} disabled={!isToolEnabled(kind)||(secondary&&!secondaryEnabled)}>{PANEL_INFO[kind].title}{!isToolEnabled(kind)?" — недоступно в beta 0.1":secondary&&!secondaryEnabled?" — заблокирован":""}</option>})}</select></div>
      <div className="floating-panel__tools"><button onPointerDown={(e) => e.stopPropagation()} onClick={onMinimize} aria-label="Свернуть инструмент" title="Свернуть">―</button><button onPointerDown={(e) => e.stopPropagation()} onClick={onDetach} aria-label="Открыть в новой вкладке" title="Открыть в новой вкладке"><Icon name="external" /></button><button className="floating-panel__close" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label="Закрыть инструмент" title="Закрыть"><Icon name="close" /></button></div>
    </header>
    <div className="floating-panel__body"><DiagnosticSurface panelId={panel.id}>{content}</DiagnosticSurface></div>
    {!docked&&PANEL_RESIZE_DIRECTIONS.map(direction=><span key={direction} aria-hidden="true" className={`floating-panel__resize floating-panel__resize--${direction}`} onPointerDown={(e) => begin("resize", e, direction)} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel} />)}
  </article>;
}

export function GridWorkspace({ grid, heightScreens, panels, secondaryEnabled, renderPanel, onGridChange, onCreate, isToolEnabled = () => true }: { grid:WorkspaceGrid; heightScreens:number; panels:PanelState[]; secondaryEnabled:boolean; renderPanel:(panel:PanelState,mode:WorkspaceMode)=>React.ReactNode; onGridChange:(grid:WorkspaceGrid)=>void; onCreate:(cell:number,tool:PanelKind)=>void; isToolEnabled?:(tool:PanelKind)=>boolean }) {
  const containerRef=useRef<HTMLDivElement>(null),resizeRef=useRef<{axis:"column"|"row";index:number;start:number;sizes:number[]} | null>(null);
  const beginResize=(axis:"column"|"row",index:number,event:React.PointerEvent<HTMLButtonElement>)=>{event.preventDefault();const coordinate=axis==="column"?event.clientX:event.clientY;resizeRef.current={axis,index,start:coordinate,sizes:[...(axis==="column"?grid.columnSizes:grid.rowSizes)]};event.currentTarget.setPointerCapture(event.pointerId);};
  const moveResize=(event:React.PointerEvent<HTMLButtonElement>)=>{const active=resizeRef.current,box=containerRef.current?.getBoundingClientRect();if(!active||!box)return;const length=(active.axis==="column"?box.width:box.height)-(active.sizes.length-1)*6,coordinate=active.axis==="column"?event.clientX:event.clientY,total=active.sizes.reduce((sum,value)=>sum+value,0),delta=(coordinate-active.start)/Math.max(1,length)*total,min=Math.max(.1,total*.06),left=active.sizes[active.index]+delta,right=active.sizes[active.index+1]-delta;if(left<min||right<min)return;const sizes=[...active.sizes];sizes[active.index]=left;sizes[active.index+1]=right;onGridChange(active.axis==="column"?{...grid,columnSizes:sizes}:{...grid,rowSizes:sizes});};
  const endResize=(event:React.PointerEvent<HTMLButtonElement>)=>{resizeRef.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);};
  // Place handles in the actual gaps, including after unequal track resizing.
  const positions=(sizes:number[])=>{const total=sizes.reduce((sum,value)=>sum+value,0);let sum=0;return sizes.slice(0,-1).map((value,index)=>{sum+=value;const ratio=sum/total;return `calc(${ratio*100}% + ${(index+.5-ratio*(sizes.length-1))*6}px)`;});};
  return <div ref={containerRef} className="workspace-grid" style={{height:`${heightScreens*100}%`,minWidth:grid.columns*300+(grid.columns-1)*6,gridTemplateColumns:grid.columnSizes.map(value=>`minmax(0,${value}fr)`).join(" "),gridTemplateRows:grid.rowSizes.map(value=>`minmax(0,${value}fr)`).join(" ")}}>
    {Array.from({length:grid.rows*grid.columns},(_,cell)=>{const assigned=panels.find(candidate=>candidate.id===grid.cells[cell]),panel=assigned&&!assigned.minimized?assigned:undefined;return <section className="workspace-grid__cell" key={cell}>{panel?renderPanel(panel,"grid"):assigned?<div className="workspace-grid__reserved"><span>―</span><b>{assigned.activeTool?PANEL_INFO[assigned.activeTool].title:"Пустой инструмент"}</b><small>Инструмент свёрнут в нижнюю панель</small></div>:<div className="workspace-grid__empty"><span aria-hidden="true">＋</span><b>Пустая ячейка</b><select aria-label={`Выбрать инструмент для ячейки ${cell+1}`} defaultValue="" onChange={event=>{const tool=event.target.value as PanelKind;if(tool&&isToolEnabled(tool))onCreate(cell,tool);}}><option value="" disabled>Выберите инструмент</option>{orderedTools(isToolEnabled, secondaryEnabled).map(kind=>{const secondary=kind==="input2"||kind==="chart2"||kind==="sketch2";return <option key={kind} value={kind} disabled={!isToolEnabled(kind)||(secondary&&!secondaryEnabled)}>{PANEL_INFO[kind].title}{!isToolEnabled(kind)?" — недоступно в beta 0.1":""}</option>})}</select></div>}</section>;})}
    {positions(grid.columnSizes).map((position,index)=><button key={`column-${index}`} className="workspace-grid__divider workspace-grid__divider--column" style={{left:position}} aria-label={`Изменить ширину столбцов ${index+1} и ${index+2}`} onPointerDown={event=>beginResize("column",index,event)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={()=>{resizeRef.current=null;}}/>)}
    {positions(grid.rowSizes).map((position,index)=><button key={`row-${index}`} className="workspace-grid__divider workspace-grid__divider--row" style={{top:position}} aria-label={`Изменить высоту строк ${index+1} и ${index+2}`} onPointerDown={event=>beginResize("row",index,event)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={()=>{resizeRef.current=null;}}/>)}
  </div>;
}

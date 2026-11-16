"use client";
import { pumpCurvePath, type Pump } from "./pump-catalog";
import type { CurveMethod } from "./curve-methods";
import { chartGridStyle, chartTickLabel, type ChartAxisScale, type ChartGridSettings } from "./pump-chart-grid";
import type { InputEntity } from "./project-config";

export function PumpChartPlot({ pump, referencePump, count, method, label, input, xScale, yScale, grid, system, actualPoint, clipId, onInputChange }: {
  pump: Pump; count: number; method: CurveMethod; label: string;
  referencePump?: Pump;
  input: { flowRate: number; head: number }; xScale: ChartAxisScale; yScale: ChartAxisScale; grid: ChartGridSettings;
  system: { solid: string; dashed: string }; actualPoint: { flow: number; head: number } | null; clipId: string;
  onInputChange?: (patch: Partial<InputEntity>) => void;
}) {
  const minQ=xScale.min,maxQ=xScale.max,minH=yScale.min,maxH=yScale.max;
  const pointX=(flow:number)=>45+(flow-minQ)/(maxQ-minQ)*435,pointY=(head:number)=>210-(head-minH)/(maxH-minH)*190;
  return <svg viewBox="0 0 500 240" role="img" aria-label={`Гидравлическая кривая: ${label}`} className="pump-chart__svg" onDoubleClick={event=>{
    const svg=event.currentTarget,point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
    const local=point.matrixTransform(svg.getScreenCTM()!.inverse()),q=Math.max(minQ,Math.min(maxQ,minQ+(local.x-45)/435*(maxQ-minQ))),h=Math.max(minH,Math.min(maxH,minH+(210-local.y)/190*(maxH-minH)));
    onInputChange?.({flowRate:Number(q.toFixed(1)),head:Number(h.toFixed(1))});
  }}>
    <defs><clipPath id={clipId}><rect x="45" y="10" width="435" height="200"/></clipPath></defs>
    <path className="pump-chart__grid" style={chartGridStyle(grid)} d={[...(grid.vertical?xScale.ticks.map(flow=>`M${pointX(flow)} 10V210`):[]),...(grid.horizontal?yScale.ticks.map(head=>`M45 ${pointY(head)}H480`):[])].join("")}/>
    <g clipPath={`url(#${clipId})`}>
      {referencePump&&<path className="pump-chart__line pump-chart__line--nominal" d={pumpCurvePath(referencePump,count,maxQ,maxH,method,{flow:minQ,head:minH})}/>}
      {Array.from({length:count},(_,i)=><path key={i} className={`pump-chart__line pump-chart__line--blue ${i<count-1?"pump-chart__line--muted":""}`} d={pumpCurvePath(pump,i+1,maxQ,maxH,method,{flow:minQ,head:minH})}/>)}
      <path className="pump-chart__line pump-chart__line--orange" d={system.solid}/><path className="pump-chart__line pump-chart__line--orange pump-chart__line--unavailable" d={system.dashed}/>
      <circle className="pump-chart__marker pump-chart__marker--requested" cx={pointX(input.flowRate)} cy={pointY(input.head)} r="4"/>
      {actualPoint&&<><circle className="pump-chart__actual-halo" cx={pointX(actualPoint.flow)} cy={pointY(actualPoint.head)} r="7"/><circle className="pump-chart__marker pump-chart__marker--actual" cx={pointX(actualPoint.flow)} cy={pointY(actualPoint.head)} r="3.5"/></>}
    </g>
    {grid.labels&&<g className="pump-chart__ticks">{xScale.ticks.map(flow=><text key={`q-${flow}`} x={pointX(flow)} y="228" textAnchor="middle">{chartTickLabel(flow,xScale.step)}</text>)}{yScale.ticks.map(head=><text key={`h-${head}`} x="38" y={pointY(head)+4} textAnchor="end">{chartTickLabel(head,yScale.step)}</text>)}</g>}
  </svg>;
}

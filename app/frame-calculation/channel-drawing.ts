import type { ChannelResult } from "./channel-types";
import { channelSection } from "./channel-profiles";
import { memberBounds } from "./channel";

const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
const n=(v:number)=>Number(v.toFixed(2));
/** Standalone drawing and coordinate schedule derived only from the shared calculation. */
export function channelFrameSvg(result:ChannelResult):string {
 const g=result.geometry;if(!g)throw Error("Геометрия швеллерной рамы не определена");
 const scale=Math.min(650/g.lengthMm,420/g.widthMm),x0=85,y0=105,out:string[]=[];
 const text=(x:number,y:number,value:unknown,size=14)=>out.push(`<text x="${x}" y="${y}" font-size="${size}">${esc(value)}</text>`);
 const line=(x1:number,y1:number,x2:number,y2:number,stroke="#334155",dash="")=>out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" ${dash?`stroke-dasharray="${dash}"`:""}/>`);
 const xy=(x:number,y:number)=>[x0+x*scale,y0+(g.widthMm-y)*scale];
 const rect=(minX:number,minY:number,maxX:number,maxY:number,fill:string,stroke="#334155")=>{const [x,y]=xy(minX,maxY);out.push(`<rect x="${x}" y="${y}" width="${(maxX-minX)*scale}" height="${(maxY-minY)*scale}" fill="${fill}" stroke="${stroke}"/>`);};
 text(35,35,`Рама ${g.profile.name} — ${g.lengthMm} × ${g.widthMm} × ${g.heightMm} мм`,23);
 text(35,61,`Компоновочный чертёж. Геометрия: ${result.geometryStatus==="ready"?"построена":"требует уточнения"}.`,14);
 text(x0,y0-32,"Вид сверху · задняя сторона / шкаф");
 for(const [i,m] of g.members.entries()){const b=memberBounds(m,g.profile.width);rect(b.minX,b.minY,b.maxX,b.maxY,"#e2e8f0");const [x,y]=xy((b.minX+b.maxX)/2,(b.minY+b.maxY)/2);text(x+3,y-3,i+1,11);}
 for(const [i,p] of g.pumps.entries()){
  if(p.bounds)rect(p.bounds.minX,p.bounds.minY,p.bounds.maxX,p.bounds.maxY,"none","#64748b");
  const axis=p.axisXMm??p.x,[x,y]=xy(axis,0);line(x,y0-8,x,y+8,"#0284c7","8 3 2 3");text(x-10,y+25,`Н${i+1}`,12);
  if(i){const prev=g.pumps[i-1],[px]=xy(prev.axisXMm??prev.x,0);line(px,y+45,x,y+45);text((px+x)/2-12,y+41,n(axis-(prev.axisXMm??prev.x)),12);}
 }
 if(g.cabinet){const c=g.cabinet,b=c.data.mounting.bounds;rect(c.x+b.minX,c.y+b.minY,c.x+b.maxX,c.y+b.maxY,"none","#16a34a");const [x,y]=xy(c.x+b.minX,c.y+b.maxY);text(x,y-10,"Крепления стоек шкафа",12);}
 for(const h of g.holes){const [x,y]=xy(h.x,h.y),color=!h.valid?"#dc2626":h.face==="bottom"?"#2563eb":"#111827";out.push(`<circle cx="${x}" cy="${y}" r="${Math.max(2,(h.diameterMm??6)*scale/2)}" fill="white" stroke="${color}"/>`);line(x-4,y,x+4,y,color);line(x,y-4,x,y+4,color);}
 const bottom=y0+g.widthMm*scale;line(x0,bottom+72,x0+g.lengthMm*scale,bottom+72);text(x0+g.lengthMm*scale/2-25,bottom+67,g.lengthMm);
 line(x0-35,y0,x0-35,bottom);text(10,(y0+bottom)/2,g.widthMm);
 const pumpHoles=g.holes.filter(h=>h.owner.startsWith("pump-"));
 if(pumpHoles.length&&g.arrangement!=="vertical"){
  const left=Math.min(...pumpHoles.map(h=>h.x))-g.profile.width,right=g.lengthMm-g.profile.width-Math.max(...pumpHoles.map(h=>h.x));
  text(x0,bottom+101,`Шов → ось крайнего отверстия насоса: слева ${n(left)} мм, справа ${n(right)} мм.`,12);
 }
 if(g.arrangement==="vertical")text(x0,bottom+101,`Ширина: 2 × ${g.flangeSpanMm} мм, округление вверх до 10 мм. Зазор первых швеллеров: 10 мм.`,12);
 if(g.tank?.bounds){const t=g.tank,b=t.bounds!;rect(b.minX,b.minY,b.maxX,b.maxY,"none","#7c3aed");const [x,y]=xy(t.x,t.y);text(x-35,y,`Бак ${t.volumeL} л`,12);}
 text(800,105,"Заготовки · один профиль",17);
 const grouped=new Map<number,number>();for(const m of g.members){const length=Number((m.end-m.start).toFixed(6));grouped.set(length,(grouped.get(length)??0)+1);}
 [...grouped].sort((a,b)=>b[0]-a[0]).forEach(([length,count],i)=>text(800,133+i*23,`Швеллер ${g.profile.name} · ${n(length)} мм · ${count} шт.`,13));
 const tableEnd=155+grouped.size*23;text(800,tableEnd,`Всего: ${n(result.stockLengthMm/1000)} м`);text(800,tableEnd+24,`Масса заготовок: ${n(result.stockMassKg??0)} кг`);
 text(800,tableEnd+48,`После сверления: ${result.drilledMassKg===null?"не определена":n(result.drilledMassKg)+" кг"}`);
 if(result.welding){text(800,tableEnd+74,`Сварка: ${result.welding.joints.length} стыков · ${n(result.welding.lengthMm/1000)} м`);text(800,tableEnd+98,`Ст20: ${result.welding.costRub===null?"тариф не задан":n(result.welding.costRub)+" ₽"}`);}
 text(800,tableEnd+126,g.cabinet?"Шкаф на общей раме; дверца назад":"Шкаф отдельно стоящий",13);
 if(g.cabinet?.uprightClearanceMm!==undefined)text(800,tableEnd+149,`Двигатель — стойка: ${n(g.cabinet.uprightClearanceMm)} мм`,13);
 if(result.material?.costRub!==null&&result.material?.costRub!==undefined){
  text(800,tableEnd+174,`Металл: ${n(result.material.costRub)} ₽ · ${n(result.material.rateRubM!)} ₽/м`,13);
  text(800,tableEnd+198,`Окраска: ${result.painting?.costRub==null?"тариф не задан":n(result.painting.costRub)+" ₽"}`,13);
  if(result.hardwareGroups)text(800,tableEnd+222,`Крепёж: ${result.hardwareCostRub==null?"цену уточнить":n(result.hardwareCostRub)+" ₽"}`,13);
  if(result.frameCostRub!=null)text(800,tableEnd+246,`Итого рама: ${n(result.frameCostRub)} ₽`,13);
  if(g.cabinetAdapter)text(800,tableEnd+270,`Шкаф: 2 С-профиля L=${g.cabinetAdapter.widthMm} мм`,13);
 }
 const frontY=Math.max(610,bottom+130);text(85,frontY-12,"Вид спереди");out.push(`<rect x="85" y="${frontY}" width="${g.lengthMm*scale}" height="${g.heightMm*scale}" fill="#e2e8f0" stroke="#334155"/>`);text(85+g.lengthMm*scale+10,frontY+20,g.heightMm);
 text(800,frontY-12,`Сечение ${g.profile.name}`);const sec=channelSection(g.profile);out.push(`<polygon points="${sec.map(([x,y])=>`${820+x*1.1},${frontY+(g.profile.height-y)*1.1}`).join(" ")}" fill="#cbd5e1" stroke="#334155"/>`);
 const tableY=Math.max(755,frontY+g.heightMm*1.1+45);
 text(35,tableY,"Отверстия: координаты от переднего левого угла, мм. Синие — нижняя полка; красные — требуют уточнения.",13);
 text(35,tableY+24,"Обозначение / принадлежность",13);text(470,tableY+24,"X",13);text(590,tableY+24,"Y",13);text(710,tableY+24,"Ø",13);text(790,tableY+24,"Полка",13);
 line(35,tableY+31,1100,tableY+31,"#cbd5e1");
 g.holes.forEach((h,i)=>{const y=tableY+48+i*20;text(35,y,`${h.id} / ${h.owner}`,12);text(470,y,n(h.x),12);text(590,y,n(h.y),12);text(710,y,h.diameterMm===null?"?":n(h.diameterMm),12);text(790,y,`${h.face==="top"?"верхняя":"нижняя"}${h.valid?"":" · уточнить"}`,12);});
 const foot=tableY+80+g.holes.length*20;text(35,foot,`Источник сечения: ГОСТ 8240-97, таблица 2. Ревизия: ${g.revision}`,12);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1150" height="${foot+30}" viewBox="0 0 1150 ${foot+30}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" fill="#0f172a">${out.join("")}</g></svg>`;
}

import type { Values } from './schema';
const obj=(v:unknown):Values=>v&&typeof v==='object'&&!Array.isArray(v)?v as Values:{};
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const numbers=(v:unknown)=>Array.isArray(v)?v.filter(positive):[];
const types:Record<string,string>={round_flange:'Круглый фланец',oval_flange:'Овальный фланец',flanged:'Фланцевое',flange:'Фланцевое',threaded:'Резьбовое',thread:'Резьбовое'};
/** A working-pressure limit is never presented as a flange pressure class. */
export function pumpConnectionRow(pump:Values,side:'inlet'|'outlet'):string[]{
  const p=obj(pump[side]),dn=p.dn??pump[side==='inlet'?'inletDn':'outletDn'],options=numbers(p.dn_options);
  const size=positive(dn)?`DN ${dn}`:options.length?options.map(n=>`DN ${n}`).join(' / '):'';
  const thread=typeof p.thread_designation==='string'?p.thread_designation:'';
  const pn=numbers(p.pn_options_bar),pressure=positive(p.pn_nominal_bar)?`PN ${p.pn_nominal_bar}`+(p.pn_status==='owner_accepted_minimum'?` · принято из ${pn.join('/')}`:''):
    pn.length?pn.map(n=>`PN ${n}`).join(' / ')+' · исполнение не выбрано':p.pn_status==='not_applicable'?'Не применяется':String(p.pn_designation||'Не опубликован');
  return [side==='inlet'?'Всасывающий':'Напорный',[size,thread].filter(Boolean).join(' · ')||String(p.connection_designation||'Нет данных'),
    pressure,positive(p.max_working_pressure_bar)?`${p.max_working_pressure_bar} бар`:'Нет данных',
    types[String(p.connection_type)]||String(p.connection_type||'Нет данных'),String(p.connection_standard||p.standard||'Нет данных'),
    positive(p.axis_height_mm)?`${p.axis_height_mm} мм`:'Нет данных'];
}
export function pumpConnectionNotes(pump:Values):string{
  const ports=[obj(pump.inlet),obj(pump.outlet)];
  const notes=ports.flatMap(p=>[p.dn_note,p.pn_note,p.installation_note,p.installation_source]).filter((v):v is string=>typeof v==='string'&&!!v);
  if(ports.some(p=>p.layout==='same_side_different_heights'))notes.unshift('Патрубки расположены с одной стороны на разных высотах. Высоты указаны от опорной плоскости; общей межфланцевой длины нет.');
  return [...new Set(notes)].join(' ');
}

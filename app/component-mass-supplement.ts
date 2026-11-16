import type {ComponentItem} from "./component-database-types";
import threadEnds from "../data/thread-ends.json";
import plugs from "../data/lunda-plugs.json";
const fields=(values:Record<string,unknown>)=>Object.entries(values).map(([column,value])=>({column,headerPath:[column],value}));
/** These purchased parts were present in insertion BOMs but absent in old station snapshots. */
export const massBomSupplements:ComponentItem[]=[
 ...threadEnds.rows.map(r=>({id:r.id,catalogId:"сгоны-резьба",family:`Резьбовой патрубок ${r.article}`,fields:fields({"Наименование":`Резьбовой патрубок ${r.article}`,"Материал":r.material==="st20"?"Ст20":"AISI304","Диаметр, мм":r.outerDiameter,"Толщина, мм":r.wallThickness,"Длина, мм":r.lengthMm,"Источник размеров":r.dimensionsSource,"DN":r.dn,"PN":r.pn,"Назначение":"Резьбовой конец вставки"}),prices:r.price===null?[]:[{label:"Цена, ₽/шт.",amount:r.price,currency:"RUB"}]})),
 ...plugs.items.map(r=>({id:`${plugs.id}:${r.article}`,catalogId:plugs.catalogId,family:plugs.family,fields:fields({"Наименование":`Заглушка ${r.thread} ВР, латунь никелированная, ${r.article}`,"Артикул":r.article,"Материал":plugs.material,"DN":r.dn,"PN":r.pn,"Резьба":"ВР","Источник":plugs.sourceUrl}),prices:[{label:"Цена, ₽/шт.",amount:r.price,currency:"RUB"}]}))
];

// node scripts/report-onis-models.mjs <CAD-audit-directory> <CSV-file>
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { loadTs } from "../tests/load-ts.mjs";

const [auditDir, destination] = process.argv.slice(2);
if (!destination || !auditDir) throw Error("Pass the directory produced by audit-onis-models.py and an output CSV path");
const frontend = new URL("../",import.meta.url);
const json = async path => JSON.parse(await readFile(path));
const pumps=(await json(new URL("public/pumps.json",frontend))).filter(p=>p.manufacturer==="ONIS");
const {profiles}=await json(new URL("public/model-assets/manifest.json",frontend));
const {files}=await json(new URL("data/onis-model-import.json",frontend));
const {resolvePumpLayout}=await loadTs(new URL("app/model-editor/pump-spatial.ts",frontend));
const {addLineAssemblies}=await loadTs(new URL("app/model-editor/line-assembly.ts",frontend));
const {distance,worldPoint}=await loadTs(new URL("app/model-editor/model.ts",frontend));
const reports=new Map(await Promise.all(files.map(async f=>[f.sourceHash,await json(resolve(auditDir,f.sourceHash+".json"))])));
const byPump=new Map(files.filter(f=>f.pumpId).map(f=>[f.pumpId,f]));
const rows=[];
const counts={};
const note={
    axial_inlet_radial_outlet:"Осевой вход, радиальный выход вверх. Монтажные торцы сверены с STEP",
    casing_arrows:"Направление по двум стрелкам на корпусе, координаты торцов сверены с STEP",
    flow_unconfirmed:"Торцы A и B сверены с STEP. Назначение всасывающего и напорного патрубка не подтверждено",
    drawing_only:"DWG. Нет связанной объёмной модели",
    no_file:"В поставке для этого артикула нет файла CAD",
};

// Exercise the normal pump-to-line builder at each port. These reference fittings
// test direction and coincidence only. Suitability of a real valve or bolt set
// depends on the station specification and is checked separately.
function checkBranchPlacement(pump, spatial) {
    const pumpId="pump-1-"+pump.id+"-0";
    const pose={position:[70,30,160],rotation:[0,0,15]};
    const component={id:pumpId,name:pump.model,kind:"pump",equipmentId:pump.id,...pose,ports:spatial.ports};
    const collector=side=>({id:"collector-"+side,kind:"collector",name:side,sourceNote:"",parameters:{},...pose,
        ports:[{id:pumpId,point:[0,0,0],axis:[0,1,0]}]});
    const sides=pump.type==="submersible"?["discharge"]:["suction","discharge"];
    const items=sides.map(side=>({section:side,quantity:1,equipmentId:"probe",name:"Монтажная проверка",
        position:side,details:"",status:"selected",option:side==="suction"?"primarySuctionValve":"primaryDischargeValve"}));
    const project={entities:{"system-input":{workingPumpCount:1,reservePumpCount:0},"station-spec":{items}}};
    const fitting={equipmentId:"probe",source:"reference",revision:"audit",length:30,fidelity:"parametric",issues:[],
        ports:[{id:"left",axis:[-1,0,0],point:[0,0,0]},{id:"right",axis:[1,0,0],point:[30,0,0]}]};
    const result=addLineAssemblies({components:[component,...sides.map(collector)]},project,{profiles:{}},{revision:"audit",items:{probe:fitting}});
    const point=ref=>{const c=result.components.find(v=>v.id===ref.componentId);return worldPoint(c,c.ports.find(p=>p.id===ref.portId).point);};
    for(const j of result.lineJoints) assert.ok(distance(point(j.a),point(j.b))<.001,pump.model+" "+j.id);
    return result.lineJoints.filter(j=>j.a.componentId===pumpId).length;
}

function add(pump, file) {
    const report=file ? reports.get(file.sourceHash) : {status:"no_file"};
    assert.ok(report.status in note);
    const layout=pump && resolvePumpLayout(pump,profiles[pump.id]);
    const n=pump ? checkBranchPlacement(pump,layout) : null;
    if(pump){
        const required=pump.type==="submersible"?1:2;
        assert.equal(n,report.status==="flow_unconfirmed"?0:required,pump.id);
    }
    const mode=!pump?(report.status==="drawing_only"?"Только чертёж, 3D-вставка недоступна":"Только ручная вставка"):!n?"Автообвязка ожидает подтверждения направления":
        report.status==="casing_arrows"||report.status==="axial_inlet_radial_outlet"?"Подключение по CAD":
        layout.info.schematic?"Условные монтажные точки":"Компоновка по размерам каталога";
    counts[mode]=(counts[mode]??0)+1;
    rows.push([pump?.model??file.model,pump?.series??file.series,pump?.article??"",pump?.id??"",pump?"Расчётный каталог":"Только библиотека",
        file?.format??"",mode,n??"",note[report.status],report.review?.inlet??"",
        file?.archivedSource??"",file?.sourceHash??""]);
}
for(const pump of pumps)add(pump,byPump.get(pump.id));
for(const file of files.filter(f=>!f.pumpId))add(null,file);
rows.sort((a,b)=>a[0].localeCompare(b[0],"ru",{numeric:true})||a[3].localeCompare(b[3]));
rows.unshift(["Обозначение","Серия","Артикул","ID насоса","Раздел","Формат исходника","Результат для 3D","Проверено направлений подключения","Проверка источника","Всасывающий патрубок MV","Исходный файл","SHA-256 модели или чертежа"]);
const cell=x=>'"'+String(x).replaceAll('"','""')+'"';
await mkdir(dirname(resolve(destination)),{recursive:true});
await writeFile(destination,"\uFEFF"+rows.map(row=>row.map(cell).join(";")).join("\r\n")+"\r\n","utf8");
console.log(JSON.stringify({catalogue:pumps.length,libraryFiles:files.length,rows:rows.length-1,counts}));

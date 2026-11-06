import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {loadTs} from "../load-ts.mjs";

export async function engineeringStore(){
  const sql=new DatabaseSync(":memory:");
  sql.exec(await readFile(new URL("../../drizzle/0015_engineering_graphs.sql",import.meta.url),"utf8"));
  sql.exec(await readFile(new URL("../../drizzle/0016_station_instruments.sql",import.meta.url),"utf8"));
  class Statement {
    constructor(query,params=[]){this.query=query;this.params=params;}
    bind(...args){return new Statement(this.query,args);}
    async first(){return sql.prepare(this.query).get(...this.params)??null;}
    async all(){return {results:sql.prepare(this.query).all(...this.params)};}
    async run(){return {meta:{changes:sql.prepare(this.query).run(...this.params).changes}};}
  }
  const db={prepare:s=>new Statement(s),async batch(stmts){sql.exec("BEGIN");try{const result=[];for(const st of stmts)result.push(await st.run());sql.exec("COMMIT");return result;}catch(e){sql.exec("ROLLBACK");throw e;}}};
  const unique="__geometry_"+crypto.randomUUID().replaceAll("-","");
  globalThis[unique]=db;
  const base=new URL("../../app/",import.meta.url);
  const replacements={
    [new URL("auth-server.ts",base).href]:'export const db=()=>globalThis.'+unique+';export const currentUser=async r=>r.headers.has("x-test-role")?{id:"fixture",name:"Тест",role:r.headers.get("x-test-role")}:null;export const json=(v,status=200,headers={})=>Response.json(v,{status,headers});',
    [new URL("release-policy.ts",base).href]:'export const IS_BETA=false;export const publicShellAsset=()=>false;export const betaApiAllowed=()=>true;export const betaDataAsset=()=>false;',
    [new URL("engineering/equipment-server.ts",base).href]:'export const trialResources=async()=>({pumps:[],cabinets:null,smartCabinets:null});export const equipmentTypes=async()=>[];export const equipmentSamples=async()=>[];',
  };
  const load=path=>loadTs(new URL(path+".ts",base),replacements);
  const route=await load("api/admin/geometry-nodes/route"), effective=await load("api/engineering/runtime/route");
  async function call(body,role="admin"){
    const headers={};if(role)headers["x-test-role"]=role;
    const request=new Request("http://fixture/api/admin/geometry-nodes",{method:body?"POST":"GET",headers,body:body?JSON.stringify(body):undefined});
    const response=await route[body?"POST":"GET"](request);return {status:response.status,body:await response.json()};
  }
  return {call,load,effective,close(){delete globalThis[unique];sql.close();}};
}

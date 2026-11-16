import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import { catalogDrawings, readDrawingFile, validDrawingFile } from "../services/local-storage/node-drawings.mjs";

test("drawing binding fails closed when article, model or motor revision changes", () => {
  const id = "a".repeat(64) + ".pdf", row = {variantId:"v",modelId:"m",designation:"NIS1/3SWH",article:"123",manufacturer:"CNP",series:"NIS",motor:{power_kw:3,frequency_hz:50,phase_count:3,protection_class:"IP55"},drawings:[{fileId:id,previewId:"b".repeat(64)+".png",page:4,name:"Размерный лист",scope:"model_reference",note:"Справочно"}]};
  const input={variant:{id:"v",designation:row.designation,manufacturer_article:"123"},model:{id:"m"},motor:{...row.motor},manufacturer:"CNP",series:"NIS"}, map=new Map([["v",row]]);
  assert.equal(catalogDrawings(input,map)[0].page,4);
  for (const inputChange of [ {variant:{...input.variant,manufacturer_article:"124"}}, {model:{id:"neighbour"}}, {motor:{...input.motor,power_kw:4}}, {motor:{...input.motor,frequency_hz:60}}, {motor:{...input.motor,protection_class:"IP54"}} ]) assert.deepEqual(catalogDrawings({...input,...inputChange},map),[]);
});

test("content-addressed drawing store preserves original bytes and rejects traversal, tampering and unknown formats", async () => {
  const dir=await mkdtemp(join(tmpdir(),"pumpstation-drawings-"));
  try {
    const root=join(dir,"drawing-files");await mkdir(root);
    const bytes=Buffer.from("%PDF-1.7\nverified fixture"), key=createHash("sha256").update(bytes).digest("hex")+".pdf";
    await writeFile(join(root,key),bytes);
    const res=await readDrawingFile(join(dir,"catalog.sqlite"),key);
    assert.equal(res.status,200);assert.deepEqual(Buffer.from(await res.arrayBuffer()),bytes);assert.equal(res.headers.get("Content-Type"),"application/pdf");assert.match(res.headers.get("Content-Disposition"),/attachment/);
    const head=await readDrawingFile(join(dir,"catalog.sqlite"),key,"HEAD");assert.equal(head.status,200);assert.equal(await head.text(),"");
    for (const bad of ["../catalog.sqlite","a.svg",key+"?path=secret",key+"/other","C:/secret.pdf"]) {assert.equal(validDrawingFile(bad),false);assert.equal((await readDrawingFile(join(dir,"catalog.sqlite"),bad)).status,404);}
    await writeFile(join(root,key),"changed file");assert.equal((await readDrawingFile(join(dir,"catalog.sqlite"),key)).status,409);
    assert.equal((await readDrawingFile(join(dir,"catalog.sqlite"),"f".repeat(64)+".png")).status,404);
    assert.equal((await readDrawingFile(join(dir,"catalog.sqlite"),key,"POST")).status,405);
  } finally { if (dirname(resolve(dir))===resolve(tmpdir()) && basename(dir).startsWith("pumpstation-drawings-")) await rm(dir,{recursive:true,force:true}); }
});

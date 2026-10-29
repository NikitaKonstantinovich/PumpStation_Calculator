import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { request as httpRequest } from "node:http";
import { Miniflare } from "miniflare";

for (const publicOrigin of [undefined, "https://pumps-beta.tplinkdns.com", "https://188.242.166.168"]) {
test(`built beta enforces access over real HTTP (${publicOrigin ?? "loopback"})`, async () => {
  const root = new URL("../dist/server/", import.meta.url);
  const paths = (await readdir(root, { recursive:true })).filter(path=>path.endsWith(".js"));
  paths.sort((a,b)=>a==="index.js"?-1:b==="index.js"?1:a.localeCompare(b));
  const worker = new Miniflare({
    host:"127.0.0.1", port:0, name:"beta-http-test",
    modules:paths.map(path=>({type:"ESModule",path:fileURLToPath(new URL(path.replaceAll("\\","/"),root))})),
    modulesRoot:fileURLToPath(root), compatibilityDate:"2026-05-15", compatibilityFlags:["nodejs_compat"],
    d1Databases:["DB"],
    bindings: publicOrigin ? { PUBLIC_APP_ORIGIN: publicOrigin, APP_BASE_URL: publicOrigin } : {},
    assets:{directory:fileURLToPath(new URL("../dist/client/",import.meta.url)),binding:"ASSETS",routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},
  });
  try {
    const origin=(await worker.ready).origin;
    const send=async(path,method="GET",cookie,body,extraHeaders={})=>{
      const payload=body?JSON.stringify(body):undefined;
      // Node's fetch overrides Host; use HTTP transport to reproduce a proxy
      // preserving the public host while connecting to a loopback backend.
      try { return await new Promise((resolve,reject)=>{
        const request=httpRequest(`${origin}${path}`,{method,headers:{"Content-Type":"application/json",...(payload?{"Content-Length":Buffer.byteLength(payload)}:{}),Origin:publicOrigin??origin,...(publicOrigin?{Host:new URL(publicOrigin).host,"X-Forwarded-Proto":"https"}:{}),...(cookie?{Cookie:cookie}:{}),...extraHeaders}},response=>{
          let text="";
          response.setEncoding("utf8");
          response.on("data",chunk=>{text+=chunk;});
          response.on("error",reject);
          response.on("end",()=>{
            const headers=new Headers();
            for(const [name,values] of Object.entries(response.headers)) for(const value of Array.isArray(values)?values:[values]) if(value!==undefined)headers.append(name,value);
            resolve({status:response.statusCode,headers,text});
          });
        });
        request.setTimeout(10000,()=>request.destroy(new Error("HTTP test timeout")));
        request.on("error",reject);
        request.end(payload);
      }); }
      catch(error) { throw new Error(`${method} ${path}: ${error.message} (${error.cause?.code ?? "unknown"})`, {cause:error}); }
    };
    assert.equal((await send("/api/auth")).status,401);
    const database=await worker.getD1Database("DB");
    const password="beta-http-fixture-password",salt=Buffer.alloc(16,42);
    const hash=`pbkdf2_sha256$310000$${salt.toString("base64url")}$${pbkdf2Sync(password,salt,310000,32,"sha256").toString("base64url")}`;
    await database.prepare("INSERT INTO users(id,email,name,password_hash,email_verified_at,role,access_level) VALUES(?,?,?,?,CURRENT_TIMESTAMP,'admin','base')").bind("http-admin","admin@example.test","HTTP test",hash).run();
    const login=await send("/api/auth","POST",undefined,{action:"login",email:"admin@example.test",password});
    assert.equal(login.status,200);
    assert.match(login.headers.get("set-cookie"), /; Secure/);
    assert.match(login.headers.get("set-cookie"), /; HttpOnly/);
    assert.match(login.headers.get("set-cookie"), /; SameSite=Lax/);
    const cookie=login.headers.get("set-cookie").split(";")[0];
    for (const path of ["/api/auth", "/api/users"]) {
      const forged = await send(path,"POST",cookie,{action:"logout"},{Origin:"https://evil.example","X-Forwarded-Host":"evil.example","X-Forwarded-Proto":"https"});
      assert.equal(forged.status,403,`Reject foreign origin: ${path}`);
    }
    for(const method of ["GET","POST","PATCH"]){
      const body=method==="GET"?undefined:{role:"admin",profile:"full"};
      assert.equal((await send("/api/users",method,undefined,body)).status,401);
    }
    const users=await send("/api/users","GET",cookie);
    assert.equal(users.status,200);
    assert.equal(users.headers.get("Cache-Control"),"no-store");
    assert.deepEqual(Object.keys(JSON.parse(users.text).users[0]).sort(),["email","id","name","online","revision","role","verified"]);
    for(const role of ["base","plus","pro"]){
      await database.prepare("INSERT INTO users(id,email,name,password_hash,email_verified_at,role,access_level) VALUES(?,?,?,?,CURRENT_TIMESTAMP,'user',?)").bind(`http-${role}`,`${role}@example.test`,"HTTP tester",hash,role).run();
      const memberLogin=await send("/api/auth","POST",undefined,{action:"login",email:`${role}@example.test`,password});
      assert.equal(memberLogin.status,200);
      const memberCookie=memberLogin.headers.get("set-cookie").split(";")[0];
      await database.prepare("UPDATE sessions SET last_seen_at=datetime('now','-3 minutes') WHERE user_id=?").bind(`http-${role}`).run();
      const online = async () => JSON.parse((await send("/api/users","GET",cookie)).text).users.find(user=>user.id===`http-${role}`).online;
      assert.equal(await online(),false,"An old heartbeat must expire");
      assert.equal((await send("/api/auth","GET",memberCookie)).status,200);
      assert.equal(await online(),false,"Reading the session alone must not renew presence");
      const heartbeat=await send("/api/auth","POST",memberCookie,{action:"heartbeat"});
      assert.equal(heartbeat.status,200,heartbeat.text);
      assert.equal(await online(),true,`Heartbeat restores presence for ${role}`);
      for(const method of ["GET","POST","PATCH"]){
        const body=method==="GET"?undefined:{role:"admin",profile:"full"};
        assert.equal((await send("/api/users?role=admin&profile=full",method,memberCookie,body)).status,403);
      }
    }
    const form={email:"invited@example.test",name:"HTTP invited",role:"base",password,confirmed:true};
    const created=await send("/api/users","POST",cookie,form);
    assert.equal(created.status,201);
    const added=JSON.parse(created.text).user;
    const updated=await send("/api/users","PATCH",cookie,{...form,id:added.id,revision:added.revision,name:"HTTP updated",password:""});
    assert.equal(updated.status,200);
    assert.equal(JSON.parse(updated.text).user.name,"HTTP updated");
    for(const method of ["PUT","DELETE","HEAD","OPTIONS"]){
      assert.equal((await send("/api/users",method,cookie)).status,403);
      assert.equal((await send("/api/users",method)).status,401);
    }
    for(const path of ["/api/projects","/api/collectors","/api/control-cabinets","/api/component-calculator","/api/model-preparation","/api/model-preparation/assets/part.stl"]){
      for(const method of ["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"]){
        const body=["GET","HEAD"].includes(method)?undefined:{profile:"full",role:"admin",payload:"x".repeat(4096)};
        const response=await send(path,method,cookie,body);
        assert.equal(response.status,403,`${method} ${path}: ${response.text}`);
        if(method!=="HEAD")assert.equal(JSON.parse(response.text).code,"FEATURE_DISABLED_IN_BETA");
        assert.equal((await send(path,method,undefined,body)).status,401);
      }
    }
    const manifest=JSON.parse(await readFile(new URL("../dist/release.json",import.meta.url),"utf8"));
    const privateChunk=`/_next/static/chunks/${manifest.privateAssets[0]}`;
    for(const path of ["/pumps.json", "/binding-components.json", privateChunk]){
      assert.equal((await send(path)).status,401);
      const response=await send(path,"HEAD",cookie);
      assert.equal(response.status,200,path);
      assert.equal(response.headers.get("Cache-Control"),"private, no-store");
    }
    assert.equal((await send(privateChunk.replace("beta-workspace","%62eta-workspace"))).status,401);
    assert.equal((await send("/api/auth","POST",cookie,{action:"logout"})).status,200);
    assert.equal((await send("/api/auth","GET",cookie)).status,401);
  } finally { await worker.dispose(); }
});
}

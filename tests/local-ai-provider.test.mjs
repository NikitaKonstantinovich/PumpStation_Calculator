import assert from "node:assert/strict";
import test from "node:test";
import { localAIProvider } from "../scripts/local-ai-provider.mjs";
test("local provider cannot proxy other destinations, methods or browser cookies", async t => {
  let calls=0;
  t.mock.method(globalThis,"fetch",async(url,options)=>{
    calls++;
    assert.equal(url,"https://api.openai.com/v1/responses");
    assert.equal(options.headers.Cookie,undefined);
    assert.equal(options.headers.Authorization,"Bearer fixture-key");
    assert.equal(options.redirect,"manual");
    return Response.json({status:"completed"});
  });
  assert.equal((await localAIProvider(new Request("https://foreign.example/",{method:"POST"}))).status,403);
  assert.equal((await localAIProvider(new Request("https://api.openai.com/v1/responses"))).status,403);
  assert.equal(calls,0);
  assert.equal((await localAIProvider(new Request("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer fixture-key",Cookie:"private-cookie"},body:"{}"}))).status,200);
  assert.equal(calls,1);
});

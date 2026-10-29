import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";
const { withPublicOrigin } = await loadTs(new URL("../worker/public-origin.ts", import.meta.url));
const origin = "https://pumps-beta.tplinkdns.com";

test("proxy origin preserves the URL, request body, method and session headers", async () => {
  const request = new Request("http://pumps-beta.tplinkdns.com/api/users?q=1", {
    method: "PATCH", headers: { Origin: origin, Cookie: "ps_session=fixture", "Content-Type": "application/json" }, body: '{"name":"Tester"}',
  });
  const normalized = withPublicOrigin(request, origin);
  assert.equal(normalized.url, `${origin}/api/users?q=1`);
  assert.equal(normalized.method, "PATCH");
  assert.equal(normalized.headers.get("Cookie"), "ps_session=fixture");
  assert.equal(await normalized.text(), '{"name":"Tester"}');
});

test("loopback and unrelated hosts cannot claim a public origin using forwarded headers", () => {
  for (const host of ["localhost:3005", "127.0.0.1:3005", "evil.example", "pumps-beta.tplinkdns.com.evil.example"]) {
    const request = new Request(`http://${host}/`, { headers: { "X-Forwarded-Host": "pumps-beta.tplinkdns.com", "X-Forwarded-Proto": "https" } });
    assert.equal(withPublicOrigin(request, origin), request);
  }
  const request = new Request("http://pumps-beta.tplinkdns.com/");
  assert.equal(withPublicOrigin(request), request);
});

test("invalid configured public origins fail closed", () => {
  for (const value of ["http://pumps-beta.tplinkdns.com", `${origin}/path`, `${origin}?x=1`, `${origin}#x`, "https://user:password@example.test", "bad-url"]) {
    assert.throws(() => withPublicOrigin(new Request("http://localhost/"), value));
  }
});

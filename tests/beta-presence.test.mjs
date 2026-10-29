import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import ts from "typescript";

test("beta entry renews presence while open and after returning to the tab", async () => {
  const effects = [], timers = new Map(), requests = [];
  const browser = new EventTarget(), document = new EventTarget();
  document.visibilityState = "visible";
  browser.setInterval = (callback, delay) => { timers.set(1, { callback, delay }); return 1; };
  browser.clearInterval = id => timers.delete(id);
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  globalThis.window = browser;
  globalThis.document = document;
  globalThis.fetch = async (path, options) => {
    requests.push({ path, ...options });
    return { status: 200, ok: true, json: async () => ({ user: { id: "active-user", role: "base" } }) };
  };
  // Run the actual entry component's lifecycle with controlled browser events
  // and time. Rendering its workspace is irrelevant to presence updates.
  globalThis.__betaPresenceReact = {
    lazy: () => () => null, Suspense: () => null,
    useEffect: effect => effects.push(effect),
    useState: initial => [initial, () => {}],
  };
  let cleanup;
  try {
    let source = await readFile(new URL("../app/beta-entry.tsx", import.meta.url), "utf8");
    source = source
      .replace('import { lazy, Suspense, useEffect, useState } from "react";', 'const { lazy, Suspense, useEffect, useState } = globalThis.__betaPresenceReact;')
      .replace('import { AccountScreen } from "./account-ui";', 'const AccountScreen = () => null;')
      .replace('import { IS_BETA, RELEASE_LABEL } from "./release-policy";', 'const IS_BETA = true, RELEASE_LABEL = "beta 0.1";');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText.replaceAll('from "react/jsx-runtime"', `from "${import.meta.resolve("react/jsx-runtime")}"`);
    const { default: BetaEntry } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
    BetaEntry();
    cleanup = effects[0]();
    await setImmediate();
    assert.equal(requests.length, 1);
    const timer = timers.get(1);
    assert.ok(timer.delay < 120_000, "Renew before the server's two-minute expiry");
    // Advance beyond the expiry window without any user interaction.
    for (let elapsed = 0; elapsed < 150_000; elapsed += timer.delay) {
      timer.callback();
      await setImmediate();
    }
    const count = requests.length;
    document.visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(requests.length, count);
    document.visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    browser.dispatchEvent(new Event("focus"));
    await setImmediate();
    assert.equal(requests.length, count + 2);
    for (const request of requests) {
      assert.equal(request.path, "/api/auth");
      assert.equal(request.method, "POST", "A session GET does not update presence");
      assert.deepEqual(JSON.parse(request.body), { action: "heartbeat" });
    }
    cleanup(); cleanup = undefined;
    assert.equal(timers.size, 0);
    browser.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(requests.length, count + 2, "Unmounted entry must stop updates");
  } finally {
    cleanup?.();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
    delete globalThis.__betaPresenceReact;
  }
});

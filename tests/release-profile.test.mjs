import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { resolveReleaseProfile } = await loadTs(new URL("../build/release-profile.ts", import.meta.url));

test("development runs full while an unconfigured release or preview remains beta", () => {
  assert.equal(resolveReleaseProfile("serve"), "full");
  assert.equal(resolveReleaseProfile("build"), "beta");
  assert.equal(resolveReleaseProfile("serve", undefined, true), "beta");
});

test("explicit beta/full profiles take precedence and unknown profiles fail closed", () => {
  for (const command of ["serve", "build"]) {
    for (const profile of ["beta", "full"]) assert.equal(resolveReleaseProfile(command, profile), profile);
    for (const profile of ["", "production", "FULL"]) assert.throws(() => resolveReleaseProfile(command, profile), /PSC_RELEASE_PROFILE/);
  }
  assert.equal(resolveReleaseProfile("serve", "full", true), "full");
});

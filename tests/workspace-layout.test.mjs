import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));

test("legacy projects open with one screen of grid height and retain resized boundaries", () => {
  const project = createProject("Старая сетка");
  project.workspace.mode = "grid";
  project.workspace.grid.columnSizes = [0.6, 1.4];
  project.workspace.grid.rowSizes = [1.3, 0.7];
  delete project.workspace.gridHeightScreens;
  const loaded = parseProjectConfig(JSON.parse(JSON.stringify(project)));
  assert.equal(loaded.workspace.gridHeightScreens, 1);
  assert.deepEqual(loaded.workspace.grid, project.workspace.grid);
});

test("fractional grid height survives project export/import with tool assignments and resized tracks", () => {
  const project = createProject("Высокая сетка");
  project.workspace.mode = "grid";
  project.workspace.gridHeightScreens = 2.7;
  project.workspace.grid.columnSizes = [1.1, 0.9];
  project.workspace.grid.rowSizes = [0.8, 1.2];
  const loaded = parseProjectConfig(JSON.parse(JSON.stringify(project)));
  assert.equal(loaded.workspace.gridHeightScreens, 2.7);
  assert.deepEqual(loaded.workspace.grid, project.workspace.grid);
  assert.deepEqual(loaded.workspace.windows.map(panel => [panel.id, panel.activeTool]), project.workspace.windows.map(panel => [panel.id, panel.activeTool]));
});

test("import rejects invalid grid heights and normalizes excessive decimal precision", () => {
  for (const invalid of [null, "2.5", -2, 0, Infinity, NaN]) {
    const project = createProject();
    project.workspace.gridHeightScreens = invalid;
    assert.equal(parseProjectConfig(project).workspace.gridHeightScreens, 1);
  }
  const project = createProject();
  project.workspace.gridHeightScreens = 1.26;
  assert.equal(parseProjectConfig(project).workspace.gridHeightScreens, 1.3);
  project.workspace.gridHeightScreens = 0.1;
  assert.equal(parseProjectConfig(project).workspace.gridHeightScreens, 0.1);
});

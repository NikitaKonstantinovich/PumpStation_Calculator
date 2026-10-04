import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./load-ts.mjs";

const { collectProjectIssues, filterIssues, openIssueInFirstPanel } = await loadTs(new URL("../app/diagnostics.ts", import.meta.url));
const { createProject, parseProjectConfig } = await loadTs(new URL("../app/project-config.ts", import.meta.url));
const pump = { id: "fixture", manufacturer: "Test", model: "Fixture", series: "Fixture", type: "end_suction", power: 3, curve: [[0, 40], [60, 10]], price: 125, priceCurrency: "RUB" };
const issue = { id: "spec/01/test", tool: "spec", severity: "warning", message: "Проверить применимость" };
function project() {
  const p = createProject();
  Object.assign(p.entities["system-input"], { flowRate: 30, head: 25, staticHead: 5, workingPumpCount: 1, reservePumpCount: 1, selectedPumpId: pump.id, calculated: true });
  p.entities["station-settings"].inletHead = 10;
  const port = { pumpId: pump.id, dn: 50, connection: "flanged", maxPressure: 25, maxInletPressure: 16, source: "fixture" };
  Object.assign(p.entities["station-dn"], { pumpSuctionPort: port, pumpDischargePort: port });
  return p;
}
const collect = p => collectProjectIssues(p, [pump], null, []);

test("collects errors and warnings from closed tools, including specification and failed databases", () => {
  const p = project(); p.workspace.windows = [];
  p.entities["system-input"].flowRate = -1;
  p.entities["station-settings"].inletHead = null;
  p.entities["station-collectors"].suction.databaseStatus = "error";
  p.entities["station-collectors"].suction.databaseError = "Сервер недоступен";
  const messages = collectProjectIssues(p, [pump], null, [], { "components/database": "База недоступна" });
  assert.equal(messages.find(i => i.id === "input/flowRate").severity, "error");
  assert.equal(messages.find(i => i.id === "settings/inlet-head").severity, "warning");
  assert.equal(messages.find(i => i.id === "collectors/suction/database").severity, "error");
  assert.equal(messages.find(i => i.id === "components/database").severity, "error");
  assert.ok(messages.some(i => i.tool === "spec"));
  assert.equal(new Set(messages.map(i => i.id)).size, messages.length);
});

test("resolved parameters disappear immediately and disabled circuits and options do not add issues", () => {
  const p = project();
  p.entities["system-input"].flowRate = -10;
  assert.ok(collect(p).some(i => i.id === "input/flowRate"));
  p.entities["system-input"].flowRate = 30;
  assert.ok(!collect(p).some(i => i.id === "input/flowRate"));
  assert.ok(!collect(p).some(i => ["input2", "chart2", "sketch2"].includes(i.tool)));
  assert.ok(!collect(p).some(i => i.subject?.includes("Бак мембранный")));
  p.entities["station-settings"].stationType = "combined";
  assert.ok(collect(p).some(i => i.tool === "input2"));
  p.entities["station-settings"].membraneTank = true;
  assert.ok(collect(p).some(i => i.subject?.includes("Бак мембранный")));
});

test("known pressure limit exceedance is an error and missing pressure data is a warning", () => {
  const p = project();
  const item = { position: "01", name: "Насос Test", details: "3 кВт", quantity: 2, section: "pump", status: "confirmation", inletPressureCheck: { baseStatus: "selected", checks: [{ status: "exceeded", message: "Превышение PN16" }] } };
  p.entities["station-spec"].items = [item];
  assert.equal(collect(p).find(i => i.tool === "spec").severity, "error");
  item.inletPressureCheck.checks[0] = { status: "unknown-limit", message: "Допустимое давление неизвестно" };
  assert.equal(collect(p).find(i => i.tool === "spec").severity, "warning");
});

test("severity filters are independent and combine with the tool filter", () => {
  const messages = [issue, { ...issue, id: "input/head", tool: "input", severity: "error" }, { ...issue, id: "spec/02/error", severity: "error" }];
  assert.equal(filterIssues(messages, { errors: true, warnings: true, tool: "all" }).length, 3);
  assert.equal(filterIssues(messages, { errors: true, warnings: false, tool: "all" }).length, 2);
  assert.equal(filterIssues(messages, { errors: false, warnings: true, tool: "all" }).length, 1);
  assert.equal(filterIssues(messages, { errors: false, warnings: false, tool: "all" }).length, 0);
  assert.deepEqual(filterIssues(messages, { errors: true, warnings: false, tool: "spec" }).map(i => i.id), ["spec/02/error"]);
});

test("navigation uses the first grid cell, restores a minimized window and preserves project data", () => {
  const p = project(); p.workspace.mode = "grid";
  p.workspace.grid.cells[0] = "model";
  p.workspace.windows.find(window => window.id === "model").minimized = true;
  const original = structuredClone(p);
  const next = openIssueInFirstPanel(p, issue, "navigation");
  assert.equal(next.panelId, "model");
  const first = next.project.workspace.windows.find(window => window.id === "model");
  assert.equal(first.activeTool, "spec"); assert.equal(first.entityId, "station-spec"); assert.equal(first.minimized, false);
  assert.deepEqual(next.project.entities, original.entities);
  assert.deepEqual(p, original);
});

test("navigation keeps the diagnostics list if it is in the first window", () => {
  const p = project(); p.workspace.mode = "grid";
  const first = p.workspace.windows.find(window => window.id === p.workspace.grid.cells[0]);
  first.activeTool = "issues"; first.entityId = "station-issues";
  const next = openIssueInFirstPanel(p, issue, "navigation");
  assert.equal(next.panelId, first.id);
  assert.equal(next.project.workspace.windows.find(window => window.id === first.id).activeTool, "spec");
  assert.ok(next.project.workspace.windows.some(window => window.id !== first.id && window.activeTool === "issues"));
});

test("empty first cell creates a window and free/mobile layouts use their first window", () => {
  const p = project(); p.workspace.mode = "grid"; p.workspace.grid.cells[0] = null;
  const next = openIssueInFirstPanel(p, issue, "navigation");
  assert.equal(next.project.workspace.grid.cells[0], "navigation");
  assert.equal(next.panelId, "navigation");
  for (const mode of ["free", "mobile"]) {
    p.workspace.mode = mode;
    const opened = openIssueInFirstPanel(p, issue, `navigation-${mode}`);
    assert.equal(opened.project.workspace.windows[0].activeTool, "spec");
    assert.equal(opened.panelId, p.workspace.windows[0].id);
  }
});

test("projects round-trip the new tool and older projects receive its entity", () => {
  const p = project();
  p.workspace.windows[0].activeTool = "issues"; p.workspace.windows[0].entityId = "station-issues";
  const loaded = parseProjectConfig(JSON.parse(JSON.stringify(p)));
  assert.equal(loaded.workspace.windows[0].activeTool, "issues");
  assert.equal(loaded.entities["station-issues"].kind, "issues");
  const old = project(); delete old.entities["station-issues"];
  assert.equal(parseProjectConfig(old).entities["station-issues"].kind, "issues");
});

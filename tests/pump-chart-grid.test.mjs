import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadTs } from "./load-ts.mjs";
const { defaultChartGridSettings, automaticChartAxis, chartAxisScale, chartGridStyle, chartTickLabel } = await loadTs(new URL("../app/pump-chart-grid.ts", import.meta.url));
const { pumpCurvePath, interpolateCurve } = await loadTs(new URL("../app/pump-catalog.ts", import.meta.url));

test("default coordinate grid exactly preserves the previous auto scales", () => {
  const settings = defaultChartGridSettings();
  for (const maximum of [.5, 1, 4.5, 9.1, 10, 10.1, 72, 100, 1240]) {
    const step = Math.max(1, Math.ceil(maximum / 10)), divisions = maximum < 10 ? Math.max(1, Math.ceil(maximum)) : 10;
    const expected = { min: 0, max: step * divisions, step, ticks: Array.from({ length: divisions + 1 }, (_, i) => i * step) };
    assert.deepEqual(chartAxisScale(maximum, settings.flow, "Q"), expected);
    assert.deepEqual(automaticChartAxis(maximum), expected);
  }
  assert.deepEqual(chartGridStyle(settings), { stroke: undefined, strokeWidth: 1, strokeDasharray: undefined });
  assert.equal(settings.vertical && settings.horizontal && settings.labels, true);
});

test("custom ranges and spacing generate actual coordinate ticks, including fractional values", () => {
  assert.deepEqual(chartAxisScale(100, { min: 20, max: 80, step: 15 }, "Q"), { min: 20, max: 80, step: 15, ticks: [20,35,50,65,80] });
  assert.deepEqual(chartAxisScale(70, { min: 20, max: null, step: 15 }, "Q").ticks, [20,35,50,65,80]);
  assert.deepEqual(chartAxisScale(1, { min: .1, max: .4, step: .1 }, "Q").ticks, [.1,.2,.3,.4]);
  assert.deepEqual(chartAxisScale(100, { min: 20, max: 82, step: 15 }, "Q").ticks, [20,35,50,65,80,82]);
  assert.equal(chartTickLabel(.0002,.0001), "0,0002");
});

test("invalid or excessively dense grids fail safely instead of creating unbounded SVG elements", () => {
  for (const settings of [{ min: -1, max: null, step: null }, { min: 20, max: 20, step: null }, { min: 20, max: 10, step: null }, { min: 0, max: null, step: 0 }, { min: 0, max: null, step: .00001 }, { min: 0, max: Infinity, step: 1 }]) {
    const axis = chartAxisScale(100, settings, "Q"); assert.ok(axis.issue.startsWith("Q:")); assert.deepEqual(axis.ticks, automaticChartAxis(100).ticks);
  }
});

test("curve coordinates honor both axis origins, all interpolation methods and ten parallel pumps", () => {
  const curve = [[0,60],[10,50],[20,40]];
  const bezier = (a,b,c,d,t) => (1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d;
  for (const method of ["linear","pchip","polynomial"]) {
    const path = pumpCurvePath({ curve }, 10, 200, 65, method, { flow: 50, head: 30 });
    const commands = path.match(/[MCL][^MCL]+/g); let [x0,y0] = commands[0].slice(1).trim().split(/\s+/).map(Number);
    for (const command of commands.slice(1)) {
      const values = command.slice(1).trim().split(/\s+/).map(Number), [x3,y3] = values.slice(-2);
      for (const t of [.2,.5,.8]) {
        const x = x0+(x3-x0)*t, flow = ((x-45)/435*150+50)/10;
        const actualY = command[0] === "L" ? y0+(y3-y0)*t : bezier(y0,values[1],values[3],y3,t);
        assert.ok(Math.abs(actualY-(210-(interpolateCurve(curve,flow,method)-30)/35*190))<1e-7);
      }
      [x0,y0] = [x3,y3];
    }
  }
});

test("rendered SVG used by browser and export contains the selected grid, ten curves and no settings controls", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "pump-chart-render-"));
  try {
    const modulePath = fileURLToPath(new URL("../app/pump-chart-plot.tsx", import.meta.url)).replaceAll("\\", "/");
    const bundle = await build({ stdin: { contents: `import {renderToStaticMarkup} from 'react-dom/server';import {PumpChartPlot} from ${JSON.stringify(modulePath)};export const render=props=>renderToStaticMarkup(<PumpChartPlot {...props}/>);`, loader: "tsx", resolveDir: fileURLToPath(new URL("../", import.meta.url)) }, bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic" });
    const output = join(temporary, "render.cjs"); await writeFile(output, bundle.outputFiles[0].contents);
    const { render } = createRequire(import.meta.url)(output);
    const grid = { ...defaultChartGridSettings(), flow: { min: 20, max: 200, step: 20 }, head: { min: 30, max: 70, step: 10 }, color: "#123456", width: 2, pattern: "dashed", horizontal: false, labels: false };
    const props = { pump: { curve: [[0,60],[10,50],[20,40]] }, count: 10, method: "pchip", label: "PCHIP", input: { flowRate: 100, head: 50 }, xScale: chartAxisScale(200,grid.flow,"Q"), yScale: chartAxisScale(70,grid.head,"H"), grid, system: { solid: "M45 210L480 20", dashed: "" }, actualPoint: null, clipId: "chart1" };
    const svg = render(props);
    assert.match(svg, /stroke:#123456;stroke-width:2;stroke-dasharray:5 4/);
    assert.equal((svg.match(/pump-chart__line--blue/g) ?? []).length, 10);
    const gridPath = svg.match(/<path class="pump-chart__grid"[^>]+>/)[0]; assert.ok(gridPath.includes("V210")); assert.ok(!gridPath.includes("H480"));
    assert.ok(!svg.includes("pump-chart__ticks")); assert.ok(!/<(?:input|select|details|button)\b/.test(svg)); assert.ok(!svg.includes("Настройки"));
    const marker = svg.match(/class="pump-chart__marker pump-chart__marker--requested" cx="([^"]+)" cy="([^"]+)"/);
    assert.ok(Math.abs(Number(marker[1])-(45+80/180*435))<1e-8); assert.equal(Number(marker[2]),115);
    const defaults = defaultChartGridSettings();
    const second = render({ ...props, count: 1, grid: defaults, clipId: "chart2" });
    assert.ok(second.includes('id="chart2"')); assert.ok(second.includes("pump-chart__ticks")); assert.ok(!second.includes("#123456"));
    assert.equal(defaults.flow.max, null);
    const withReference = render({ ...props, referencePump: { curve: [[0,80],[20,60],[30,40]] } });
    assert.equal((withReference.match(/pump-chart__line--nominal/g) ?? []).length,1);
    assert.equal((withReference.match(/pump-chart__line--blue/g) ?? []).length,10);
    assert.ok(!/<(?:input|select|details|button)\b/.test(withReference));
    assert.ok(!second.includes("pump-chart__line--nominal"));
  } finally { assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); await rm(temporary, { recursive: true, force: true }); }
});

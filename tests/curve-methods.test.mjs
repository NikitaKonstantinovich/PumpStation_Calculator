import assert from "node:assert/strict";
import test from "node:test";
import {loadTs} from "./load-ts.mjs";

const {curveSegments, curveMaxHead} = await loadTs(new URL("../app/curve-methods.ts", import.meta.url));
const {interpolateCurve, pumpCurvePath, operatingPoint} = await loadTs(new URL("../app/pump-catalog.ts", import.meta.url));
const close = (a,b,tolerance=1e-8) => assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`);

test("least squares removes noise orthogonal to a cubic, independently of flow units", () => {
  const polynomial = x => 30 + 2*x - x*x - .2*x*x*x;
  // Fourth differences are orthogonal to all polynomials of degree <= 3.
  const noise = [1,-4,6,-4,1];
  for (const [offset,scale] of [[0,1],[1e6,1e4],[.001,.0001]]) {
    const points = noise.map((n,x) => [offset+x*scale,polynomial(x)+n*.1]);
    for (const x of [0,.3,1,2,2.7,4]) close(interpolateCurve(points,offset+x*scale,"polynomial"),polynomial(x));
    assert.notEqual(interpolateCurve(points,offset+2*scale,"polynomial"),points[2][1]);
    assert.equal(interpolateCurve(points,offset-scale,"polynomial"),null);
    assert.equal(interpolateCurve(points,offset+5*scale,"polynomial"),null);
  }
});

test("linear interpolation uses segments; small datasets reduce polynomial degree", () => {
  const points = [[0,30],[2,20],[7,10]];
  close(interpolateCurve(points,1,"linear"),25);
  close(interpolateCurve(points,4,"linear"),16);
  assert.match(pumpCurvePath({curve:points},1,10,40,"linear"),/^M[^C]+L/);
  for (const q of [2,3,4,6]) close(interpolateCurve([[2,10],[6,6]],q,"polynomial"),12-q);
  for (const q of [0,.5,1,1.5,2]) close(interpolateCurve([[0,10],[1,9],[2,6]],q,"polynomial"),10-q*q);
});

test("invalid curves and negative fitted head are unavailable instead of extrapolated", () => {
  for (const method of ["pchip","linear","polynomial"]) for (const points of [[],[[1,2]],[[0,2],[0,3]],[[0,2],[1,NaN]]]) {
    assert.deepEqual(curveSegments(points,method),[]);
    assert.equal(pumpCurvePath({curve:points},1,10,10,method),"");
  }
  const curve = [[0,0],[1,0],[2,0],[3,0],[4,10]];
  assert.deepEqual(curveSegments(curve,"polynomial"),[]);
  assert.equal(interpolateCurve(curve,2,"polynomial"),null);
});

test("axis maximum includes polynomial extrema between source points", () => {
  const curve = [[0,4],[1,4],[2,2]]; // 4 + q - q², maximum at q=.5.
  close(curveMaxHead(curve,"polynomial"),4.25);
});

test("all displayed methods share SVG geometry and intersection math, including parallel pumps", () => {
  const curve = [[0,30],[1,31],[2,28],[3,23],[4,18],[5,9]];
  const bezier=(a,b,c,d,t)=>(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d;
  for (const method of ["pchip","linear","polynomial"]) for (const count of [1,3]) {
    const point=operatingPoint({curve},count,{flowRate:3*count,head:20,staticHead:5},method);
    assert.ok(point);
    close(point.head,interpolateCurve(curve,point.flow/count,method));
    close(point.head,5+15*(point.flow/(3*count))**2);
    const commands=pumpCurvePath({curve},count,20,40,method).match(/[MCL][^MCL]+/g);
    let [x0,y0]=commands[0].slice(1).trim().split(/\s+/).map(Number);
    for (const command of commands.slice(1)) {
      const values=command.slice(1).trim().split(/\s+/).map(Number);
      const [x3,y3]=values.slice(-2);
      for (const t of [.2,.5,.8]) {
        const x=x0+(x3-x0)*t, q=(x-45)/435*20/count;
        const y=command[0]==="L"?y0+(y3-y0)*t:bezier(y0,values[1],values[3],y3,t);
        close(y,210-interpolateCurve(curve,q,method)/40*190);
      }
      [x0,y0]=[x3,y3];
    }
  }
});

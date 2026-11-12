/* node demos/camera-projection.test.js */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const C = require("./camera-projection.js");

function near(a, b, eps) {
  assert.ok(Math.abs(a - b) < (eps || 1e-8), a + " vs " + b);
}
function eye() {
  return {
    fx: 100, fy: 200, s: 0, u0: 320, v0: 240,
    yaw: 0, pitch: 0, roll: 0, tx: 0, ty: 0, tz: 5
  };
}

{
  const p = eye();
  const r = C.project([0, 0, 0], p);
  assert.ok(r.inFront);
  near(r.Xc[0], 0); near(r.Xc[1], 0); near(r.Xc[2], 5);
  near(r.u, 320); near(r.v, 240);
  const K = C.Kof(p);
  const pred = C.mulV(K, r.Xc);
  near(pred[0] / pred[2], r.u);
  near(pred[1] / pred[2], r.v);
  near(pred[2], r.inhom[2]);
}

{
  const p = eye();
  const right = C.project([1, 0, 0], p);
  near(right.Xc[0], 1); near(right.Xc[1], 0); near(right.Xc[2], 5);
  near(right.u, 320 + 100 / 5);
  near(right.v, 240);
  const up = C.project([0, 1, 0], p);
  near(up.Xc[1], -1, 1e-8);
  near(up.v, 240 + 200 * (-1) / 5);
  p.s = 50;
  const sheared = C.project([0, 1, 0], p);
  near(sheared.u, 320 + 50 * (-1) / 5);
}

{
  const p = eye();
  p.tz = -1;
  const behind = C.project([0, 0, 0], p);
  assert.strictEqual(behind.inFront, false);
  assert.ok(behind.Xc[2] <= 0);
}

{
  const R = C.rotation(20, -15, 40);
  const Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
  const I = C.mul(R, Rt);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(I[i][j], i === j ? 1 : 0, 1e-8);
  const det = R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1])
    - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0])
    + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
  near(det, 1, 1e-8);
}

{
  const tip = C.project(C.TIP, C.DEFAULTS);
  assert.ok(tip.inFront, "the tree tip is in front of the default camera");
  assert.ok(tip.u > 0 && tip.u < C.IMG_W && tip.v > 0 && tip.v < C.IMG_H);
  const page = fs.readFileSync(path.join(__dirname, "camera-projection.html"), "utf8");
  const home = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.ok(page.includes("Intrinsic K (5 DOF)"));
  assert.ok(page.includes("Extrinsic [R | t] (6 DOF)"));
  assert.ok(page.includes("James Hays"));
  const harris = home.indexOf("demos/harris.html");
  const cam = home.indexOf("demos/camera-projection.html");
  const nn = home.indexOf("demos/neural-network.html");
  assert.ok(harris > 0 && cam > harris && cam < nn);
}

console.log("camera projection tests passed");

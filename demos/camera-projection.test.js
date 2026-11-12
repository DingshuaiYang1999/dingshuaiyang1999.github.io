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
  assert.ok(page.includes("Aperture (beyond the pinhole model)"));
  assert.ok(page.includes("R<sub>x</sub>(α)"));
  assert.ok(page.includes("R<sub>z</sub>(γ) R<sub>x</sub>(α) R<sub>y</sub>(β)"));
  assert.ok(page.includes("Savarese"));
  assert.ok(page.includes("AFOV"));
  assert.ok(!page.includes("<label for=\"alpha\">Yaw"));
  const harris = home.indexOf("demos/harris.html");
  const cam = home.indexOf("demos/camera-projection.html");
  const nn = home.indexOf("demos/neural-network.html");
  assert.ok(harris > 0 && cam > harris && cam < nn);
}

function matNear(A, B, eps) {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(A[i][j], B[i][j], eps || 1e-12);
}
function so3(R) {
  const Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
  const I = C.mul(R, Rt);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(I[i][j], i === j ? 1 : 0, 1e-8);
  const det = R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1])
    - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0])
    + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
  near(det, 1, 1e-8);
}

{
  const a = 0.37, b = -0.21, g = 0.55;
  const c = Math.cos(a), s = Math.sin(a);
  matNear(C.rotX(a), [[1, 0, 0], [0, c, -s], [0, s, c]]);
  const cy = Math.cos(b), sy = Math.sin(b);
  matNear(C.rotY(b), [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]);
  const cz = Math.cos(g), sz = Math.sin(g);
  matNear(C.rotZ(g), [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]);
  so3(C.rotX(a)); so3(C.rotY(b)); so3(C.rotZ(g));
  const Re = C.elementary(a * 180 / Math.PI, b * 180 / Math.PI, g * 180 / Math.PI);
  matNear(Re, C.mul(C.rotZ(g), C.mul(C.rotX(a), C.rotY(b))));
  matNear(C.rotation(b * 180 / Math.PI, a * 180 / Math.PI, g * 180 / Math.PI), C.mul(Re, C.R0));
  so3(Re);
}

{
  const sharp = C.project(C.TIP, C.DEFAULTS);
  const closed = Object.assign({}, C.DEFAULTS, { fn: 0, focus: 2 });
  const wide = Object.assign({}, C.DEFAULTS, { fn: 1.4, focus: C.DEFAULTS.focus + 4 });
  const shut = C.project(C.TIP, closed);
  const open = C.project(C.TIP, wide);
  near(shut.u, sharp.u); near(shut.v, sharp.v);
  near(open.u, sharp.u); near(open.v, sharp.v);
  assert.strictEqual(C.circleOfConfusion(closed, 12), 0);
  assert.ok(C.circleOfConfusion(wide, wide.focus) < 1e-8);
  assert.ok(C.circleOfConfusion(wide, C.DEFAULTS.focus) > 0);
}

{
  const f = 50, Hx = 36, Hy = 24;
  near(C.afov(Hx, f), 2 * Math.atan(Hx / (2 * f)));
  near(C.afov(Hy, f), 2 * Math.atan(Hy / (2 * f)));
  const fx = C.fxFromLens(f, Hx, C.IMG_W);
  const fy = C.fyFromLens(f, Hy, C.N_V);
  near(fx, f * C.IMG_W / Hx);
  near(fy, f * C.N_V / Hy);
  near(Hx / (2 * f), C.IMG_W / (2 * fx));
  near(Hy / (2 * f), C.N_V / (2 * fy));
  near(C.DEFAULTS.fx, C.fxFromLens(C.DEFAULTS.f, C.DEFAULTS.Hx, C.IMG_W));
  near(C.DEFAULTS.fy, C.fyFromLens(C.DEFAULTS.f, C.DEFAULTS.Hy, C.N_V));
  near(C.asymAngle(C.IMG_W / 2, C.IMG_W, fx), 2 * Math.atan(C.IMG_W / (2 * fx)));
  near(C.asymAngle(100, C.IMG_W, 400), Math.atan(100 / 400) + Math.atan((C.IMG_W - 100) / 400));
  near(C.asymAngle(80, C.N_V, fy), Math.atan(80 / fy) + Math.atan((C.N_V - 80) / fy));
}

console.log("camera projection tests passed");

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
  assert.ok(page.includes("Intrinsic K"));
  assert.ok(page.includes("Extrinsic [R|t]"));
  assert.ok(page.includes("James Hays"));
  assert.ok(page.includes(">Aperture<"));
  assert.ok(page.includes("R_x(\\alpha) &= \\begin{bmatrix}"));
  assert.ok(page.includes("R_z(\\gamma)R_x(\\alpha)R_y(\\beta)"));
  assert.ok(page.includes("Savarese"));
  assert.ok(page.includes("AFOV"));
  assert.ok(!page.includes("<label for=\"alpha\">Yaw"));
  const projects = home.indexOf('id="projects-cv"');
  const harris = home.indexOf("demos/harris.html", projects);
  const cam = home.indexOf("demos/camera-projection.html", projects);
  const nn = home.indexOf("demos/neural-network.html", projects);
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
  const f = 50, Sw = 36, Sh = 24;
  near(C.afov(Sw, f), 2 * Math.atan(Sw / (2 * f)));
  near(C.afov(Sh, f), 2 * Math.atan(Sh / (2 * f)));
  const fx = C.fxFromLens(f, Sw, C.IMG_W);
  const fy = C.fyFromLens(f, Sh, C.IMG_H);
  near(fx, f * C.IMG_W / Sw);
  near(fy, f * C.IMG_H / Sh);
  near(Sw / (2 * f), C.IMG_W / (2 * fx));
  near(Sh / (2 * f), C.IMG_H / (2 * fy));
  near(C.DEFAULTS.fx, C.fxFromLens(C.DEFAULTS.f, C.DEFAULTS.Sw, C.DEFAULTS.W));
  near(C.DEFAULTS.fy, C.fyFromLens(C.DEFAULTS.f, C.DEFAULTS.Sh, C.DEFAULTS.H));
  const fxOther = C.fxFromLens(f, Sw, 1440);
  near(C.afov(Sw, f), 2 * Math.atan(1440 / (2 * fxOther)));
  assert.ok(Math.abs(C.fxFromLens(f, Sw, 720) - C.fyFromLens(f, Sh, 360)) > 1);
  near(C.asymAngle(C.IMG_W / 2, C.IMG_W, fx), 2 * Math.atan(C.IMG_W / (2 * fx)));
  near(C.asymAngle(100, C.IMG_W, 400), Math.atan(100 / 400) + Math.atan((C.IMG_W - 100) / 400));
  near(C.asymAngle(80, C.IMG_H, fy), Math.atan(80 / fy) + Math.atan((C.IMG_H - 80) / fy));
  const sample = [0.35, 1.1, -0.4];
  const hit = C.project(sample, C.DEFAULTS);
  const ndc = C.ndcOf(sample, C.DEFAULTS);
  near(ndc.x, 2 * hit.u / C.DEFAULTS.W - 1, 1e-6);
  near(ndc.y, 1 - 2 * hit.v / C.DEFAULTS.H, 1e-6);
  const skewed = Object.assign({}, C.DEFAULTS, { s: 35, u0: 200, v0: 140 });
  const hitS = C.project(sample, skewed);
  const ndcS = C.ndcOf(sample, skewed);
  near(ndcS.x, 2 * hitS.u / skewed.W - 1, 1e-6);
  near(ndcS.y, 1 - 2 * hitS.v / skewed.H, 1e-6);
}

{
  assert.strictEqual(C.IMG_W, 720);
  assert.strictEqual(C.IMG_H, 480);
  near(C.DEFAULTS.W, 720);
  near(C.DEFAULTS.H, 480);
  near(C.DEFAULTS.fx, C.DEFAULTS.fy);
  near(C.DEFAULTS.u0, C.DEFAULTS.W / 2);
  near(C.DEFAULTS.v0, C.DEFAULTS.H / 2);
  near(C.DEFAULTS.Sw / C.DEFAULTS.W, C.DEFAULTS.Sh / C.DEFAULTS.H);
  const page = fs.readFileSync(path.join(__dirname, "camera-projection.html"), "utf8");
  assert.ok(page.includes("720 × 480"));
  assert.ok(page.includes("S<sub>w</sub>"));
  assert.ok(page.includes("W (px)"));
  assert.ok(page.includes("H (px)"));
  assert.ok(!page.includes("<figcaption><strong>World"));
  assert.ok(!page.includes('id="fov-read" class="cam-note"'));
  const tree = C.project(C.ANCHORS.tree, C.DEFAULTS);
  const nearG = C.project(C.ANCHORS.near, C.DEFAULTS);
  assert.ok(nearG.inFront && nearG.u > tree.u + 140, "gifts sit to the side of the tree");
  assert.ok(C.cocPixels(C.DEFAULTS, nearG.Xc[2]) > 5);
  assert.ok(C.cocPixels(C.DEFAULTS, tree.Xc[2]) < 0.5);
}

{
  assert.ok(C.poseClear(C.DEFAULTS), "default pose is outside every collider");
  assert.ok(C.cameraCenter(C.DEFAULTS)[1] > C.MIN_CAM_Y);
  const level = Object.assign({}, C.DEFAULTS, { alpha: 0, beta: 0, gamma: 0, tx: 0, ty: 1.5, tz: 4 });
  assert.ok(C.poseClear(level));
  const underground = Object.assign({}, level, { ty: -1 });
  assert.strictEqual(C.poseBlocked(underground), "ground");
  const ty = C.clampExtrinsic(level, underground, "ty");
  assert.ok(ty < level.ty && ty > underground.ty, "ty stops between the last valid value and the request");
  const atGround = Object.assign({}, level, { ty: ty });
  assert.ok(C.poseClear(atGround));
  assert.ok(C.cameraCenter(atGround)[1] >= C.MIN_CAM_Y - 1e-6);
  assert.ok(!C.poseClear(Object.assign({}, level, { ty: ty - 0.02 })));
  const intoTree = Object.assign({}, level, { tz: 0 });
  assert.strictEqual(C.poseBlocked(intoTree), "tree");
  const tz = C.clampExtrinsic(level, intoTree, "tz");
  assert.ok(tz < level.tz && tz > intoTree.tz);
  const atTree = Object.assign({}, level, { tz: tz });
  assert.ok(C.poseClear(atTree));
  assert.ok(!C.poseClear(Object.assign({}, level, { tz: tz - 0.02 })));
  const dipped = Object.assign({}, level, { ty: 0.4, tz: 8, alpha: -40 });
  assert.strictEqual(C.poseBlocked(dipped), "ground");
  const baseTilt = Object.assign({}, level, { ty: 0.4, tz: 8, alpha: 0 });
  assert.ok(C.poseClear(baseTilt));
  const alpha = C.clampExtrinsic(baseTilt, dipped, "alpha");
  assert.ok(alpha < 0 && alpha > -40, "a rotation stops at the ground instead of jumping");
  assert.ok(C.poseClear(Object.assign({}, baseTilt, { alpha: alpha })));
  assert.strictEqual(C.poseBlocked(Object.assign({}, C.DEFAULTS, { alpha: 0, beta: 0, gamma: 0, tx: 9, ty: 1.5, tz: -32 })), "house");
}

console.log("camera projection tests passed");

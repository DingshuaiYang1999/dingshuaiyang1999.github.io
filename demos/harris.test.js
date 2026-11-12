/* node demos/harris.test.js */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const H = require("./harris.js");

function fill(w, h, v) {
  const g = new Float64Array(w * h);
  g.fill(v);
  return g;
}

{
  const w = 24, h = 18;
  const g = fill(w, h, 40);
  const r = H.harris(g, w, h, { ksizeD: 1, sigmaD: 1, ksizeI: 5, sigmaI: 1.2, alpha: 0.04, relThresh: 0.01, nms: 3 });
  assert.ok([...r.R].every((v) => Math.abs(v) < 1e-8), "flat image has Harris response near zero");
  assert.ok([...r.corners].every((v) => v === 0), "flat image has no corners");
  assert.ok([...r.ixy].every((v) => v === 0));
}

{
  const w = 31, h = 21;
  const g = fill(w, h, 20);
  for (let y = 0; y < h; y++) for (let x = 16; x < w; x++) g[y * w + x] = 200;
  const r = H.harris(g, w, h, { ksizeD: 1, sigmaD: 0, ksizeI: 5, sigmaI: 1, alpha: 0.06, relThresh: 0.05, nms: 3 });
  const mid = 10 * w + 16;
  assert.ok(r.R[mid] < 0, "a straight vertical edge has negative R, got " + r.R[mid]);
  assert.ok(r.ix[mid] > 0, "brighter to the right is positive Ix");
}

{
  const w = 36, h = 36;
  const g = fill(w, h, 0);
  for (let y = 8; y < 28; y++) for (let x = 8; x < 28; x++) g[y * w + x] = 220;
  const p = { ksizeD: 1, sigmaD: 0, ksizeI: 5, sigmaI: 1.2, alpha: 0.04, relThresh: 0.05, nms: 3 };
  const r = H.harris(g, w, h, p);
  function near(x0, y0) {
    let m = -Infinity;
    for (let y = y0 - 3; y <= y0 + 3; y++) for (let x = x0 - 3; x <= x0 + 3; x++) m = Math.max(m, r.R[y * w + x]);
    return m;
  }
  const corner = near(8, 8);
  const edge = r.R[8 * w + 18];
  const flat = r.R[18 * w + 18];
  assert.ok(corner > 0, "square corner response is positive");
  assert.ok(corner > edge * 2, "corner response exceeds the edge midpoint");
  assert.ok(Math.abs(flat) < corner * 0.05, "the flat interior is near zero");
  let marked = 0, interior = 0;
  for (let i = 0; i < r.corners.length; i++) if (r.corners[i]) {
    marked++;
    const x = i % w, y = (i / w) | 0;
    if (x > 12 && x < 24 && y > 12 && y < 24) interior++;
  }
  assert.ok(marked >= 4, "the square yields several corners, got " + marked);
  assert.strictEqual(interior, 0, "no corner is marked in the flat interior");
  // Signed product: bottom-right of the bright square has Ix>0 and Iy>0 along the edges meeting there.
  assert.ok(r.ix[27 * w + 27] !== 0 || r.iy[27 * w + 27] !== 0);
}

{
  const R = new Float64Array(9);
  R[4] = 5; R[5] = 5;
  const a = H.suppress(R, 3, 3, 3, 1);
  assert.strictEqual(a[4], 255);
  assert.strictEqual(a[5], 0, "a tie keeps the smaller index");
  const border = new Float64Array(4);
  border[1] = 3;
  const b = H.suppress(border, 2, 2, 3, 1);
  assert.strictEqual(b[1], 255, "a border pixel can be a maximum of the pixels that exist");
}

{
  const page = fs.readFileSync(path.join(__dirname, "harris.html"), "utf8");
  const home = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.ok(page.includes(">Run</button>"));
  assert.ok(page.includes("not a probability"));
  assert.ok(page.includes("id=\"stale-note\""));
  assert.ok(!page.includes("autoplay"));
  const projects = home.indexOf('id="projects-cv"');
  const edge = home.indexOf("demos/edge-detection.html", projects);
  const harris = home.indexOf("demos/harris.html", projects);
  const nn = home.indexOf("demos/neural-network.html", projects);
  assert.ok(edge > 0 && harris > edge && harris < nn, "Harris card sits immediately after Edge Detection");
}

console.log("harris tests passed");

import * as THREE from "three";

const core = window.CameraCore;
const $ = (id) => document.getElementById(id);
const NEAR = 0.08;
const FAR = 90;
const PLANE_Z = 2.8;

function params() {
  return {
    f: Number($("fmm").value), Sw: Number($("sw").value), Sh: Number($("sh").value),
    W: Number($("imgw").value), H: Number($("imgh").value),
    fx: Number($("fx").value), fy: Number($("fy").value), s: Number($("s").value),
    u0: Number($("u0").value), v0: Number($("v0").value),
    alpha: Number($("alpha").value), beta: Number($("beta").value), gamma: Number($("gamma").value),
    tx: Number($("tx").value), ty: Number($("ty").value), tz: Number($("tz").value),
    fn: Number($("fn").value), focus: Number($("focus").value)
  };
}
function putSlider(id, value) {
  const el = $(id);
  if (value > Number(el.max)) el.max = String(Math.ceil(value));
  if (value < Number(el.min)) el.min = String(Math.floor(value));
  el.value = value;
}
function syncLens(which) {
  let f = Number($("fmm").value);
  const Sw = Number($("sw").value), Sh = Number($("sh").value);
  const W = Number($("imgw").value), H = Number($("imgh").value);
  if (which === "fx") {
    f = Number($("fx").value) * Sw / W;
    f = Math.min(200, Math.max(14, f));
    $("fmm").value = f;
  } else if (which === "fy") {
    f = Number($("fy").value) * Sh / H;
    f = Math.min(200, Math.max(14, f));
    $("fmm").value = f;
  }
  if (which === "imgw") { $("u0").max = W; $("u0").value = W / 2; }
  if (which === "imgh") { $("v0").max = H; $("v0").value = H / 2; }
  if (which !== "sh" && which !== "imgh") putSlider("fx", core.fxFromLens(f, Sw, W));
  if (which !== "sw" && which !== "imgw") putSlider("fy", core.fyFromLens(f, Sh, H));
}
function writeControls(p) {
  $("fmm").value = p.f; $("sw").value = p.Sw; $("sh").value = p.Sh;
  $("imgw").value = p.W; $("imgh").value = p.H;
  $("u0").max = p.W; $("v0").max = p.H;
  $("fx").value = p.fx; $("fy").value = p.fy; $("s").value = p.s;
  $("u0").value = p.u0; $("v0").value = p.v0;
  $("alpha").value = p.alpha; $("beta").value = p.beta; $("gamma").value = p.gamma;
  $("tx").value = p.tx; $("ty").value = p.ty; $("tz").value = p.tz;
  $("fn").value = p.fn; $("focus").value = p.focus;
}
function fmt(x) {
  const s = (Math.round(x * 100) / 100).toFixed(2);
  return s === "-0.00" ? "0.00" : s;
}
function mathMatrix(M) {
  return matrixMarkup("", M, 2, "matrix-rig");
}
function mathVec(name, v) {
  return "<math><mrow><mi>" + name + "</mi><mo>=</mo><mo>[</mo>" + v.map((c) => "<mn>" + fmt(c) + "</mn>").join("<mo>,</mo>") + "<mo>]</mo></mrow></math>";
}
function showOutputs(p) {
  $("fmm-out").textContent = p.f.toFixed(1) + " mm";
  $("sw-out").textContent = p.Sw.toFixed(1) + " mm";
  $("sh-out").textContent = p.Sh.toFixed(1) + " mm";
  $("imgw-out").textContent = p.W.toFixed(0) + " px";
  $("imgh-out").textContent = p.H.toFixed(0) + " px";
  $("fx-out").textContent = p.fx.toFixed(1) + " px";
  $("fy-out").textContent = p.fy.toFixed(1) + " px";
  $("s-out").textContent = p.s.toFixed(0) + " px";
  $("u0-out").textContent = p.u0.toFixed(0) + " px";
  $("v0-out").textContent = p.v0.toFixed(0) + " px";
  $("alpha-out").textContent = p.alpha.toFixed(0) + "°";
  $("beta-out").textContent = p.beta.toFixed(0) + "°";
  $("gamma-out").textContent = p.gamma.toFixed(0) + "°";
  $("tx-out").textContent = p.tx.toFixed(2) + " m";
  $("ty-out").textContent = p.ty.toFixed(2) + " m";
  $("tz-out").textContent = p.tz.toFixed(2) + " m";
  $("fn-out").textContent = "f/" + p.fn.toFixed(1);
  $("focus-out").textContent = p.focus.toFixed(2) + " m";
  const ah = core.afov(p.Sw, p.f) * 180 / Math.PI;
  const av = core.afov(p.Sh, p.f) * 180 / Math.PI;
  const eq = p.f * 36 / p.Sw;
  const centred = Math.abs(p.u0 - p.W / 2) < 0.5 && Math.abs(p.v0 - p.H / 2) < 0.5 && Math.abs(p.s) < 0.5;
  let line = "AFOV_h = " + ah.toFixed(1) + "° · AFOV_v = " + av.toFixed(1) + "° · full-frame equivalent " + eq.toFixed(1) + " mm";
  if (!centred) {
    const horiz = core.asymAngle(p.u0, p.W, p.fx) * 180 / Math.PI;
    const vert = core.asymAngle(p.v0, p.H, p.fy) * 180 / Math.PI;
    line += ". About the optical axis: " + horiz.toFixed(1) + "° by " + vert.toFixed(1) + "° (skew ignored).";
  }
  $("fov-read").textContent = line;
  const tree = core.project(core.ANCHORS.tree, p);
  const near = core.project(core.ANCHORS.near, p);
  const far = core.project(core.ANCHORS.far, p);
  const blurAt = (hit) => hit.inFront ? core.cocPixels(p, hit.Xc[2]) : 0;
  $("coc-read").textContent = "Circle of confusion: tree " + blurAt(tree).toFixed(1) + " px · near dog " + blurAt(near).toFixed(1) + " px · house " + blurAt(far).toFixed(1) + " px";
}
function fixedCell(x, decimals) {
  const scale = 10 ** decimals;
  let r = Math.round(x * scale) / scale;
  if (r === 0) r = 0;
  return (r < 0 ? "-" : "") + Math.abs(r).toFixed(decimals);
}
function matrixMarkup(name, rows, decimals, className) {
  const cells = rows.map((row) => "<tr>" + row.map((value, index) => "<td>" + fixedCell(value, Array.isArray(decimals) ? decimals[index] : decimals) + "</td>").join("") + "</tr>").join("");
  return '<span class="cam-matrix ' + (className || "") + '"><span class="cam-matrix-name">' + name +
    '</span><span class="cam-matrix-bracket"><table aria-label="' + name + '"><tbody>' + cells + "</tbody></table></span></span>";
}
function liveK(p) {
  const K = core.Kof(p);
  return matrixMarkup("K =", K, 1, "matrix-k");
}
function liveRt(R, p) {
  const t = [p.tx, p.ty, p.tz];
  return matrixMarkup("[R | t] =", R.map((row, i) => row.concat([t[i]])), [3, 3, 3, 2], "matrix-rt");
}
let readoutQueued = 0;
let lastMatrix = "";
function updateReadout(p) {
  const ang = core.angles(p);
  const R = core.rotation(ang.beta, ang.alpha, ang.gamma);
  const kHtml = liveK(p);
  const rtHtml = liveRt(R, p);
  const key = kHtml + rtHtml;
  if (key !== lastMatrix) {
    lastMatrix = key;
    $("mat-k").innerHTML = kHtml;
    $("mat-r").innerHTML = rtHtml;
  }
  const pr = core.project(core.TIP, p);
  let rows = "<p><span>Tree tip in the world</span> " + mathVec("X", [core.TIP[0], core.TIP[1], core.TIP[2], 1]) + "</p>";
  rows += "<p><span>In the camera</span> " + mathVec("Xcam", [pr.Xc[0], pr.Xc[1], pr.Xc[2]]) + "</p>";
  if (pr.inFront) {
    rows += "<p><span>After K, before dividing by w</span> " + mathVec("wuv", pr.inhom) + "</p>";
    rows += "<p><span>Pixel</span> " + mathVec("uv", [pr.u, pr.v]) + "</p>";
  } else rows += "<p>The tip is behind the camera (z<sub>cam</sub> ≤ 0), so it is not drawn.</p>";
  $("worked").innerHTML = rows;
}

function std(color, rough, metal) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal || 0 });
  return m;
}
function needleCone(radius, height) {
  const pts = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const jag = i % 2 === 0 ? 1 : 0.78;
    pts.push(new THREE.Vector2(Math.max(0.001, radius * (1 - t) * jag), height * t));
  }
  return new THREE.LatheGeometry(pts, 28);
}
function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.5, 18), std(0x6b4423, 0.9));
  trunk.position.y = 0.25;
  trunk.castShadow = trunk.receiveShadow = true;
  g.add(trunk);
  const layers = [
    [0.35, 0.85, 1.05, 0x1e6b34],
    [0.7, 0.75, 0.9, 0x2d8744],
    [1.0, 0.66, 0.74, 0x246838],
    [1.28, 0.56, 0.58, 0x348f4c],
    [1.52, 0.46, 0.42, 0x1f6430],
    [1.74, 0.38, 0.28, 0x3c9a52]
  ];
  layers.forEach((L) => {
    const mesh = new THREE.Mesh(needleCone(L[2], L[1]), std(L[3], 0.74));
    mesh.position.y = L[0];
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  });
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.28, 10), std(0xc2a05a, 0.5, 0.2));
  mount.position.y = 2.28;
  g.add(mount);
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.045 : 0.14;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1 }), std(0xe6b325, 0.35, 0.45));
  star.position.set(0, 2.5, 0);
  g.add(star);
  const colors = [0xc4473a, 0xe6b325, 0x2a6fbf, 0xf4f4f4, 0x7a3e8a];
  [[0.62, 0.72, 0.2], [-0.48, 1.05, 0.25], [0.3, 1.35, -0.4], [-0.22, 1.62, 0.18], [0.16, 1.88, 0.12]].forEach((b, i) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 16), std(colors[i], 0.28, 0.22));
    ball.position.set(b[0], b[1], b[2]);
    ball.castShadow = true;
    g.add(ball);
  });
  for (let i = 0; i < 16; i++) {
    const h = 0.55 + i * 0.09;
    const rad = Math.max(0.12, 0.98 - h * 0.4);
    const a = i * 0.95;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffc86a, emissiveIntensity: 1.5, roughness: 0.3 }));
    bulb.position.set(Math.cos(a) * rad, h, Math.sin(a) * rad);
    g.add(bulb);
  }
  return g;
}
function makeHouse() {
  const g = new THREE.Group();
  const siding = document.createElement("canvas");
  siding.width = 64; siding.height = 64;
  const sg = siding.getContext("2d");
  sg.fillStyle = "#d2c2a4";
  sg.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    sg.fillStyle = y % 16 === 0 ? "#c4b08e" : "#ddceb4";
    sg.fillRect(0, y, 64, 7);
  }
  const sidingMap = new THREE.CanvasTexture(siding);
  sidingMap.wrapS = sidingMap.wrapT = THREE.RepeatWrapping;
  sidingMap.repeat.set(3, 2);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3, 5.2), new THREE.MeshStandardMaterial({ map: sidingMap, roughness: 0.86 }));
  walls.position.y = 1.5;
  walls.castShadow = walls.receiveShadow = true;
  g.add(walls);
  const tiles = document.createElement("canvas");
  tiles.width = 64; tiles.height = 32;
  const tg = tiles.getContext("2d");
  tg.fillStyle = "#8d4038";
  tg.fillRect(0, 0, 64, 32);
  tg.strokeStyle = "#6d3028";
  for (let y = 4; y < 32; y += 8) { tg.beginPath(); tg.moveTo(0, y); tg.lineTo(64, y); tg.stroke(); }
  const tileMap = new THREE.CanvasTexture(tiles);
  tileMap.wrapS = tileMap.wrapT = THREE.RepeatWrapping;
  tileMap.repeat.set(6, 2);
  const roofMat = new THREE.MeshStandardMaterial({ map: tileMap, color: 0x8d4038, roughness: 0.72 });
  const slopeLen = Math.hypot(2.8, 3);
  const ang = Math.atan2(3, 2.8);
  const front = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.1, slopeLen), roofMat);
  front.position.set(0, 3 + 1.5, 1.4);
  front.rotation.x = -ang;
  front.castShadow = true;
  g.add(front);
  const back = front.clone();
  back.position.z = -1.4;
  back.rotation.x = ang;
  g.add(back);
  const snowMat = std(0xf7f9fc, 0.95);
  const snowA = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.06, slopeLen * 0.55), snowMat);
  snowA.position.set(0, 5.15, 0.7);
  snowA.rotation.x = -ang;
  g.add(snowA);
  const snowB = snowA.clone();
  snowB.position.z = -0.7;
  snowB.rotation.x = ang;
  g.add(snowB);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.55), std(0x8d5a48, 0.8));
  chimney.position.set(1.6, 5.6, 0);
  chimney.castShadow = true;
  g.add(chimney);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.7), snowMat);
  cap.position.set(1.6, 6.25, 0);
  g.add(cap);
  function windowAt(x, y, z, w, h) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.08), std(0xf3ecdf, 0.5));
    frame.position.set(x, y, z);
    g.add(frame);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), new THREE.MeshStandardMaterial({ color: 0xffe7a3, emissive: 0xffc86a, emissiveIntensity: 0.8, roughness: 0.2 }));
    glass.position.set(x, y, z + 0.04);
    g.add(glass);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.06, 0.16), std(0xd9c7a4, 0.6));
    sill.position.set(x, y - h / 2 - 0.04, z + 0.06);
    g.add(sill);
  }
  windowAt(-2.1, 1.7, 2.62, 0.9, 0.7);
  windowAt(0, 1.85, 2.62, 0.8, 0.6);
  windowAt(2.1, 1.7, 2.62, 0.9, 0.7);
  windowAt(-1.2, 0.9, 2.62, 0.7, 0.55);
  windowAt(1.5, 0.9, 2.62, 0.7, 0.55);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.08), std(0x6a3b2a, 0.6));
  door.position.set(0, 0.9, 2.64);
  g.add(door);
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.55), std(0x9a8b78, 0.8));
  step.position.set(0, 0.07, 2.9);
  step.receiveShadow = true;
  g.add(step);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 1.1), std(0x8d4038, 0.7));
  porch.position.set(0, 2.35, 3.0);
  g.add(porch);
  g.position.set(-9, 0, -32);
  return g;
}
function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.02, len), 4, 10), mat);
  m.castShadow = true;
  return m;
}
function makeSanta() {
  const g = new THREE.Group();
  const red = std(0xc4473a, 0.55);
  const white = std(0xf7f7f7, 0.7);
  const skin = std(0xe7b898, 0.6);
  const bootL = capsule(0.09, 0.12, std(0x2a2420, 0.6));
  bootL.position.set(-0.12, 0.14, 0.06);
  const bootR = bootL.clone(); bootR.position.x = 0.12;
  g.add(bootL, bootR);
  const legL = capsule(0.09, 0.55, red); legL.position.set(-0.11, 0.52, 0);
  const legR = legL.clone(); legR.position.x = 0.11;
  g.add(legL, legR);
  const body = capsule(0.24, 0.42, red); body.position.y = 1.1;
  g.add(body);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 16), white);
  trim.rotation.x = Math.PI / 2; trim.position.y = 0.88; g.add(trim);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 16), std(0x1c1c1c, 0.5));
  belt.rotation.x = Math.PI / 2; belt.position.y = 1.05; g.add(belt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), skin);
  head.position.y = 1.5; g.add(head);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), white);
  beard.position.set(0, 1.42, 0.08); g.add(beard);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 16), red);
  hat.position.y = 1.78; g.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16), white);
  brim.position.y = 1.6; g.add(brim);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), white);
  pom.position.y = 1.98; g.add(pom);
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), std(0x6b4423, 0.8));
  sack.position.set(0.32, 0.85, -0.05); g.add(sack);
  g.position.set(-2.3, 0, 0.45);
  return g;
}
function makeReindeer() {
  const g = new THREE.Group();
  const fur = std(0xa56b3c, 0.75);
  const body = capsule(0.22, 0.7, fur);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.85, 0);
  g.add(body);
  [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]].forEach(([x, z]) => {
    const leg = capsule(0.06, 0.45, fur);
    leg.position.set(x, 0.35, z);
    g.add(leg);
  });
  const neck = capsule(0.08, 0.28, fur);
  neck.position.set(0.42, 1.1, 0);
  neck.rotation.z = -0.6;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), fur);
  head.position.set(0.62, 1.22, 0);
  g.add(head);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc4473a, emissive: 0x802020, emissiveIntensity: 0.4 }));
  nose.position.set(0.76, 1.2, 0);
  g.add(nose);
  [-0.08, 0.08].forEach((z) => {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.32, 8), std(0x6b4423, 0.7));
    ant.position.set(0.58, 1.46, z);
    g.add(ant);
  });
  g.position.set(2.8, 0, -2.6);
  return g;
}
function makeDog() {
  const g = new THREE.Group();
  const fur = std(0xd2b48a, 0.7);
  const body = capsule(0.12, 0.28, fur);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.28, 0);
  g.add(body);
  [[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.1], [0.12, 0.1]].forEach(([x, z]) => {
    const leg = capsule(0.035, 0.12, fur);
    leg.position.set(x, 0.12, z);
    g.add(leg);
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), fur);
  head.position.set(0.2, 0.4, 0);
  g.add(head);
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), std(0x8a6239, 0.7));
  earL.position.set(0.16, 0.48, 0.06);
  const earR = earL.clone(); earR.position.z = -0.06;
  g.add(earL, earR);
  g.position.set(0.9, 0, 7.0);
  return g;
}
function makeSnowman() {
  const g = new THREE.Group();
  const white = std(0xf7f9fc, 0.85);
  [[0.42, 0.42], [0.3, 1.05], [0.2, 1.48]].forEach(([r, y]) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), white);
    s.position.y = y;
    s.castShadow = true;
    g.add(s);
  });
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 16), std(0x2a2420, 0.6));
  hat.position.y = 1.78;
  g.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 16), std(0x2a2420, 0.6));
  brim.position.y = 1.64;
  g.add(brim);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 16), std(0xc4473a, 0.55));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.22;
  g.add(scarf);
  g.position.set(-4.8, 0, -3.4);
  return g;
}
function makeGift(w, h, d, color) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color, 0.45));
  box.position.y = h / 2;
  box.castShadow = true;
  g.add(box);
  const ribbon = std(0xf2d56a, 0.35, 0.3);
  const v = new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, h + 0.01, d * 1.02), ribbon);
  v.position.y = h / 2;
  const hz = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 0.18, d * 0.18), ribbon);
  hz.position.y = h * 0.62;
  g.add(v, hz);
  const bow = new THREE.Mesh(new THREE.SphereGeometry(w * 0.16, 12, 8), ribbon);
  bow.position.y = h + w * 0.08;
  g.add(bow);
  return g;
}
function makeCameraModel() {
  const g = new THREE.Group();
  const bodyMat = std(0x3a4450, 0.48, 0.2);
  const metal = std(0x4d565f, 0.35, 0.6);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.082, 0.07), bodyMat);
  body.position.set(0, 0.005, 0.055);
  g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.06), std(0x3c4450, 0.4, 0.3));
  top.position.set(0, 0.05, 0.055);
  g.add(top);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.07, 0.055), std(0x1e2226, 0.7));
  grip.position.set(0.062, 0.01, 0.06);
  g.add(grip);
  const hump = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.028, 0.04), bodyMat);
  hump.position.set(-0.005, 0.068, 0.06);
  g.add(hump);
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.008, 0.018), metal);
  shoe.position.set(0, 0.086, 0.055);
  g.add(shoe);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.09, 24), std(0x1c2024, 0.4, 0.45));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, 0.02);
  g.add(barrel);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.012, 24), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = 0.01;
  g.add(ring);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), new THREE.MeshStandardMaterial({ color: 0x9ec4dc, metalness: 0.85, roughness: 0.08, emissive: 0x203040, emissiveIntensity: 0.25 }));
  glass.position.z = -0.026;
  g.add(glass);
  const glint = new THREE.Mesh(new THREE.CircleGeometry(0.006, 12), new THREE.MeshBasicMaterial({ color: 0xf7fbff }));
  glint.position.set(0.008, 0.008, -0.027);
  g.add(glint);
  [-0.058, 0.074].forEach((x) => {
    const lug = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0025, 6, 10), metal);
    lug.position.set(x, 0.03, 0.07);
    g.add(lug);
  });
  const shutter = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 12), metal);
  shutter.position.set(0.04, 0.058, 0.04);
  g.add(shutter);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.006, 16), metal);
  dial.position.set(-0.03, 0.058, 0.04);
  g.add(dial);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.04), std(0x22262b, 0.45, 0.3));
  plate.position.set(0, -0.045, 0.05);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), metal);
  ball.position.set(0, -0.056, 0.05);
  g.add(plate, ball);
  return g;
}
function pathCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-9, 0, -29.15),
    new THREE.Vector3(-7.7, 0, -20.2),
    new THREE.Vector3(-4.3, 0, -11.2),
    new THREE.Vector3(-1.15, 0, -2.4)
  ]);
}
function distToPath(x, z, samples) {
  let best = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const dx = x - samples[i].x, dz = z - samples[i].z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
function ribbonGeometry(samples, width, y) {
  const n = samples.length;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx = [];
  let travelled = 0;
  for (let i = 0; i < n; i++) {
    const p = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x, tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    if (i > 0) travelled += Math.hypot(p.x - samples[i - 1].x, p.z - samples[i - 1].z);
    pos.set([p.x + nx * width, y, p.z + nz * width, p.x - nx * width, y, p.z - nz * width], i * 6);
    uv.set([travelled / 1.15, 0, travelled / 1.15, 1], i * 4);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function stoneTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#8d8680";
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    const shift = (y / 32) % 2 ? 20 : 0;
    for (let x = -40; x < 256; x += 52) {
      const shade = 150 + ((x * 3 + y * 5) % 40);
      g.fillStyle = "rgb(" + shade + "," + (shade - 6) + "," + (shade - 12) + ")";
      g.fillRect(x + shift + 2, y + 2, 46, 26);
    }
  }
  g.fillStyle = "rgba(246,249,252,0.85)";
  [[30, 40, 18, 10], [140, 90, 28, 12], [70, 180, 22, 8], [190, 200, 16, 14], [110, 20, 12, 7]].forEach(([x, y, w, h]) => {
    g.beginPath();
    g.ellipse(x, y, w, h, 0.4, 0, Math.PI * 2);
    g.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function grassTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#6f8f58";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const x = (i * 47) % 256, y = (i * 91) % 256;
    const shade = 70 + (i % 50);
    g.strokeStyle = "rgb(" + (shade - 20) + "," + (shade + 40) + "," + (shade - 30) + ")";
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + ((i % 5) - 2), y - 4 - (i % 4));
    g.stroke();
  }
  g.fillStyle = "rgba(244,248,252,0.92)";
  [[40, 50, 22, 14], [180, 70, 16, 10], [90, 190, 26, 12], [200, 210, 18, 11]].forEach(([x, y, w, h]) => {
    g.beginPath();
    g.ellipse(x, y, w, h, 0.2, 0, Math.PI * 2);
    g.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function tuftGeometry() {
  const positions = [];
  const normals = [];
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI / 3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const w = 0.011, h = 0.12, lean = 0.018;
    const pts = [[-w, 0, 0], [w, 0, 0], [w * 0.35, h, lean], [-w * 0.35, h, lean]];
    const rot = (p) => [p[0] * ca - p[2] * sa, p[1], p[0] * sa + p[2] * ca];
    const q = pts.map(rot);
    const push = (p) => { positions.push(p[0], p[1], p[2]); normals.push(ca, 0.2, sa); };
    push(q[0]); push(q[1]); push(q[2]);
    push(q[0]); push(q[2]); push(q[3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return g;
}
function makeGroundCover() {
  const group = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ map: grassTexture(), color: 0xffffff, roughness: 0.96 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const curve = pathCurve();
  const samples = curve.getPoints(72);
  const edgeMat = std(0x4a4540, 0.9);
  edgeMat.side = THREE.DoubleSide;
  const edge = new THREE.Mesh(ribbonGeometry(samples, 0.72, 0.012), edgeMat);
  edge.receiveShadow = true;
  const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.82, color: 0xffffff, side: THREE.DoubleSide });
  const paving = new THREE.Mesh(ribbonGeometry(samples, 0.58, 0.026), stone);
  paving.receiveShadow = true;
  group.add(edge, paving);
  const snowMat = std(0xf7fbff, 0.95);
  [[3.4, 2.2, 1.5, 0.9], [-3.6, 4.2, 1.2, 0.8], [6.2, -3.5, 1.7, 1.1], [-7.4, -8.5, 1.4, 1.0], [1.8, -15, 1.6, 0.9], [-2.4, -18.5, 1.3, 0.85], [4.5, -7.5, 1.1, 0.7], [-6.2, 5.5, 1.0, 0.75]].forEach(([x, z, rx, rz]) => {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(1, 18), snowMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.008, z);
    patch.scale.set(rx, rz, 1);
    patch.receiveShadow = true;
    group.add(patch);
  });
  const snowDiscs = [[3.4, 2.2, 1.6], [-3.6, 4.2, 1.3], [6.2, -3.5, 1.9], [-7.4, -8.5, 1.5], [1.8, -15, 1.7], [-2.4, -18.5, 1.4], [4.5, -7.5, 1.2], [-6.2, 5.5, 1.1]];
  const count = 1500;
  const tufts = new THREE.InstancedMesh(tuftGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, side: THREE.DoubleSide }), count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let n = 0;
  for (let i = 0; i < count && n < count; i++) {
    const x = ((i * 73) % 2800) / 100 - 14;
    const z = ((i * 131) % 4200) / 100 - 32;
    if (x > -13.2 && x < -4.8 && z > -35.2 && z < -28.6) continue;
    if (distToPath(x, z, samples) < 0.78) continue;
    if (x * x + z * z < 0.35) continue;
    let snowed = false;
    for (let s = 0; s < snowDiscs.length; s++) {
      const dx = (x - snowDiscs[s][0]) / snowDiscs[s][2];
      const dz = (z - snowDiscs[s][1]) / snowDiscs[s][2];
      if (dx * dx + dz * dz < 1) { snowed = true; break; }
    }
    if (snowed) continue;
    const h = 0.65 + ((i * 17) % 70) / 100;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, (i % 18) * 0.35, 0);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    tufts.setMatrixAt(n, dummy.matrix);
    color.setHex((i % 3 === 0) ? 0x3f7a3a : (i % 3 === 1) ? 0x4e8c45 : 0x2f6a34);
    tufts.setColorAt(n, color);
    n++;
  }
  tufts.count = n;
  tufts.instanceMatrix.needsUpdate = true;
  if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
  group.add(tufts);
  return group;
}
function makeTripod() {
  const g = new THREE.Group();
  const legMat = std(0x2a3036, 0.45, 0.35);
  const footMat = std(0x1a1e22, 0.7);
  const metal = std(0x8d949c, 0.35, 0.55);
  g.userData.legs = [0, 1, 2].map(() => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 1, 8), legMat);
    g.add(leg);
    return leg;
  });
  g.userData.feet = [0, 1, 2].map(() => {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), footMat);
    g.add(foot);
    return foot;
  });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 1, 10), metal);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.05, 10), std(0x3a4148, 0.4, 0.4));
  g.add(column, hub);
  g.userData.column = column;
  g.userData.hub = hub;
  return g;
}

const worldEl = $("view-world");
const photoEl = $("view-photo");
const compactDisplay = window.matchMedia("(max-width: 860px)").matches;
const worldRenderer = new THREE.WebGLRenderer({ canvas: worldEl, antialias: !compactDisplay, alpha: false, powerPreference: "low-power" });
worldRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compactDisplay ? 1 : 1.5));
worldRenderer.shadowMap.enabled = !compactDisplay;
worldRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
worldRenderer.outputColorSpace = THREE.SRGBColorSpace;
const photoRenderer = new THREE.WebGLRenderer({ canvas: photoEl, antialias: !compactDisplay, alpha: false, powerPreference: "low-power" });
photoRenderer.setPixelRatio(1);
photoRenderer.shadowMap.enabled = !compactDisplay;
photoRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
photoRenderer.outputColorSpace = THREE.SRGBColorSpace;
photoRenderer.autoClear = false;

const worldScene = new THREE.Scene();
worldScene.background = new THREE.Color(0xc5dff2);
worldScene.fog = new THREE.Fog(0xd5e6f2, 22, 86);
const hemi = new THREE.HemisphereLight(0xe7f3ff, 0xf7f4ee, 1.25);
hemi.layers.enable(1);
worldScene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6e8, 1.85);
sun.layers.enable(1);
sun.position.set(10, 16, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = sun.shadow.camera.bottom = -24;
sun.shadow.camera.right = sun.shadow.camera.top = 24;
sun.shadow.bias = -0.0004;
worldScene.add(sun);
worldScene.add(sun.target);
const fill = new THREE.DirectionalLight(0xf4f7ff, 0.55);
fill.layers.enable(1);
fill.position.set(-4, 6, 14);
worldScene.add(fill);

const content = new THREE.Group();
content.add(makeGroundCover());
content.add(makeTree());
[[2.8, 0, -9, 0.55], [-5.2, 0, -12, 0.45], [5.2, 0, -16, 0.38]].forEach(([x, y, z, s]) => {
  const t = makeTree();
  t.scale.setScalar(s);
  t.position.set(x, y, z);
  content.add(t);
});
content.add(makeHouse());
content.add(makeSanta());
content.add(makeReindeer());
content.add(makeDog());
content.add(makeSnowman());
const giftA = makeGift(0.32, 0.28, 0.32, 0xc4473a);
giftA.position.set(1.55, 0, 1.25);
const giftB = makeGift(0.24, 0.22, 0.24, 0x2a6fbf);
giftB.position.set(-1.45, 0, 1.5);
content.add(giftA, giftB);
const fenceMat = std(0x8a6a42, 0.7);
for (let i = 0; i < 6; i++) {
  const x = -11 + i * 1.3;
  if (x > -10.15 && x < -7.85) continue;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), fenceMat);
  post.position.set(x, 0.5, -28.5);
  post.castShadow = true;
  content.add(post);
}
[[-10.65, 1.15], [-6.05, 3.7]].forEach(([x, w]) => {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.06), std(0xa68455, 0.65));
  rail.position.set(x, 0.72, -28.5);
  content.add(rail);
});
const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.5, 10), std(0x3a4148, 0.5, 0.3));
lamp.position.set(-5, 1.75, -26);
content.add(lamp);
const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff1c2, emissive: 0xffc86a, emissiveIntensity: 1.2 }));
lampHead.position.set(-5, 3.5, -26);
content.add(lampHead);

const snowCount = 260;
const snowGeo = new THREE.BufferGeometry();
const snowPos = new Float32Array(snowCount * 3);
for (let i = 0; i < snowCount; i++) {
  snowPos[i * 3] = (Math.random() * 2 - 1) * 12;
  snowPos[i * 3 + 1] = Math.random() * 7;
  snowPos[i * 3 + 2] = Math.random() * 36 - 24;
}
snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
const snowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, sizeAttenuation: true, transparent: true, opacity: 0.9 });
const snow = new THREE.Points(snowGeo, snowMat);
content.add(snow);
worldScene.add(content);

const rig = new THREE.Group();
rig.matrixAutoUpdate = false;
rig.add(makeCameraModel());
const planeMat = new THREE.MeshBasicMaterial({ color: 0x8eb4dc, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
const plane = new THREE.Mesh(new THREE.BufferGeometry(), planeMat);
const planeLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x1d4e89 }));
const frustumLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x245ea8 }));
rig.add(plane, planeLines, frustumLines);
worldScene.add(rig);
const tripod = makeTripod();
worldScene.add(tripod);
rig.traverse((obj) => obj.layers.set(1));
tripod.traverse((obj) => obj.layers.set(1));

const orbit = { az: 0.75, el: 0.18, dist: 13.2, target: new THREE.Vector3(0.2, 1.2, 6) };
const orbitCam = new THREE.PerspectiveCamera(44, 1, 0.08, 140);
orbitCam.layers.enable(1);
const insetCam = new THREE.PerspectiveCamera(34, 1, 0.05, 3.2);
insetCam.layers.set(1);
const photoCam = new THREE.Camera();
photoCam.matrixAutoUpdate = false;
photoCam.matrixWorldAutoUpdate = false;

let photoTarget = null;
const dofScene = new THREE.Scene();
const dofCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const dofMat = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    resolution: { value: new THREE.Vector2(720, 480) },
    near: { value: NEAR },
    far: { value: FAR },
    focus: { value: 10 },
    focalMm: { value: 50 },
    aperture: { value: 0 },
    pitch: { value: 0.05 },
    u0: { value: 360 },
    v0: { value: 240 }
  },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: `
    precision highp float;
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform float near;
    uniform float far;
    uniform float focus;
    uniform float focalMm;
    uniform float aperture;
    uniform float pitch;
    uniform float u0;
    uniform float v0;
    varying vec2 vUv;
    float demoZ(float depth) {
      float zndc = depth * 2.0 - 1.0;
      float A = -(far + near) / (far - near);
      float B = -2.0 * far * near / (far - near);
      float zEye = -B / (zndc + A);
      return -zEye;
    }
    float cocPx(float Zm) {
      if (aperture <= 0.0001 || Zm <= 0.02) return 0.0;
      float d = Zm * 1000.0;
      float df = focus * 1000.0;
      float den = d * (df - focalMm);
      if (abs(den) < 0.001) return 0.0;
      return abs(aperture * focalMm * (d - df) / den) / pitch;
    }
    void main() {
      vec4 base = texture2D(tColor, vUv);
      float depth = texture2D(tDepth, vUv).x;
      vec3 color = base.rgb;
      if (depth < 0.999 && aperture > 0.0001) {
        float coc = min(cocPx(demoZ(depth)), 12.0);
        if (coc > 0.7) {
          vec2 px = 1.0 / resolution;
          vec3 acc = vec3(0.0);
          float wsum = 0.0;
          for (int i = 0; i < 13; i++) {
            float ang = float(i) * 6.2831853 / 13.0;
            float ring = i == 0 ? 0.0 : (i < 7 ? 0.55 : 1.0);
            vec2 o = vec2(cos(ang), sin(ang)) * coc * ring * px;
            acc += texture2D(tColor, vUv + o).rgb;
            wsum += 1.0;
          }
          color = acc / wsum;
        }
      }
      vec2 pix = vUv * resolution;
      if ((abs(pix.x - u0) < 1.15 && abs(pix.y - v0) < 8.0) || (abs(pix.y - v0) < 1.15 && abs(pix.x - u0) < 8.0)) color = vec3(0.77, 0.28, 0.23);
      gl_FragColor = vec4(color, 1.0);
    }
  `
});
const dofQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dofMat);
dofScene.add(dofQuad);

function resizePhotoTarget(W, H) {
  if (photoTarget && photoTarget.width === W && photoTarget.height === H) return;
  if (photoTarget) photoTarget.dispose();
  photoTarget = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  photoTarget.depthTexture = new THREE.DepthTexture(W, H);
  photoTarget.depthTexture.format = THREE.DepthFormat;
  photoTarget.depthTexture.type = THREE.UnsignedShortType;
  photoRenderer.setSize(W, H, false);
  photoEl.style.width = "100%";
  photoEl.style.height = "auto";
  photoEl.style.aspectRatio = W + " / " + H;
  dofMat.uniforms.resolution.value.set(W, H);
}
function setRowMajor(matrix, a) {
  matrix.set(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13], a[14], a[15]);
}
function applyPhotoCamera(p) {
  const mats = core.viewProjection(p, NEAR, FAR);
  setRowMajor(photoCam.matrixWorldInverse, mats.view);
  photoCam.matrixWorld.copy(photoCam.matrixWorldInverse).invert();
  setRowMajor(photoCam.projectionMatrix, mats.proj);
  photoCam.projectionMatrixInverse.copy(photoCam.projectionMatrix).invert();
}
function poseRig(p) {
  const ang = core.angles(p);
  const R = core.rotation(ang.beta, ang.alpha, ang.gamma);
  const right = new THREE.Vector3(R[0][0], R[0][1], R[0][2]);
  const down = new THREE.Vector3(R[1][0], R[1][1], R[1][2]);
  const fwd = new THREE.Vector3(R[2][0], R[2][1], R[2][2]);
  const Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
  const c = core.mulV(Rt, [p.tx, p.ty, p.tz]);
  const C = new THREE.Vector3(-c[0], -c[1], -c[2]);
  const basis = new THREE.Matrix4().makeBasis(right, down.clone().negate(), fwd.clone().negate());
  basis.setPosition(C);
  rig.matrix.copy(basis);
  rig.matrixWorldNeedsUpdate = true;
  const corners = [[0, 0], [p.W, 0], [p.W, p.H], [0, p.H]].map(([u, v]) => {
    const Y = (v - p.v0) * PLANE_Z / p.fy;
    const X = ((u - p.u0) - (p.s || 0) * (v - p.v0) / p.fy) * PLANE_Z / p.fx;
    return new THREE.Vector3(X, -Y, -PLANE_Z);
  });
  const pos = plane.geometry.getAttribute("position");
  if (!pos) {
    plane.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(18), 3));
    planeLines.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24), 3));
    frustumLines.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24), 3));
  }
  const pv = plane.geometry.getAttribute("position").array;
  const order = [0, 1, 2, 0, 2, 3];
  for (let i = 0; i < 6; i++) {
    const c = corners[order[i]];
    pv[i * 3] = c.x; pv[i * 3 + 1] = c.y; pv[i * 3 + 2] = c.z;
  }
  plane.geometry.getAttribute("position").needsUpdate = true;
  plane.geometry.computeVertexNormals();
  const ev = planeLines.geometry.getAttribute("position").array;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    ev.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
  }
  planeLines.geometry.getAttribute("position").needsUpdate = true;
  const rv = frustumLines.geometry.getAttribute("position").array;
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    rv.set([0, 0, 0, a.x, a.y, a.z], i * 6);
  }
  frustumLines.geometry.getAttribute("position").needsUpdate = true;
  rig.updateMatrixWorld(true);
  const mount = rig.localToWorld(new THREE.Vector3(0, -0.056, 0.05));
  const columnLen = Math.min(1.05, Math.max(0.05, mount.y * 0.42));
  let hubY = mount.y - columnLen;
  if (hubY < 0.1) hubY = Math.min(0.1, Math.max(0.06, mount.y - 0.04));
  const hub = new THREE.Vector3(mount.x, hubY, mount.z);
  const horiz = new THREE.Vector3(fwd.x, 0, fwd.z);
  if (horiz.lengthSq() < 1e-8) horiz.set(0, 0, -1);
  horiz.normalize();
  const side = new THREE.Vector3(-horiz.z, 0, horiz.x);
  const splay = hubY < 0.55 ? 0.62 : Math.min(1.45, 0.36 + hubY * 0.32);
  const feet = [
    horiz.clone().multiplyScalar(splay),
    horiz.clone().multiplyScalar(-splay * 0.5).addScaledVector(side, splay * 0.86),
    horiz.clone().multiplyScalar(-splay * 0.5).addScaledVector(side, -splay * 0.86)
  ];
  tripod.userData.column.scale.set(1, Math.max(0.04, mount.y - hub.y), 1);
  tripod.userData.column.position.set(mount.x, (mount.y + hub.y) / 2, mount.z);
  tripod.userData.column.quaternion.identity();
  tripod.userData.hub.position.copy(hub);
  for (let i = 0; i < 3; i++) {
    const foot = new THREE.Vector3(hub.x + feet[i].x, 0.02, hub.z + feet[i].z);
    const dir = foot.clone().sub(hub);
    const len = dir.length() || 1;
    dir.multiplyScalar(1 / len);
    const leg = tripod.userData.legs[i];
    leg.position.copy(hub).addScaledVector(dir, len * 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    leg.scale.set(1, len, 1);
    tripod.userData.feet[i].position.copy(foot);
  }
  insetCam.position.copy(mount).addScaledVector(rightVec(R), 0.7).add(new THREE.Vector3(0, 0.32, 0)).addScaledVector(fwd, 0.45);
  insetCam.up.set(0, 1, 0);
  insetCam.lookAt(mount);
}
function rightVec(R) { return new THREE.Vector3(R[0][0], R[0][1], R[0][2]); }
function updateOrbit() {
  const d = orbit.dist, a = orbit.az, e = orbit.el, t = orbit.target;
  orbitCam.position.set(
    t.x + d * Math.cos(e) * Math.sin(a),
    t.y + d * Math.sin(e),
    t.z + d * Math.cos(e) * Math.cos(a)
  );
  orbitCam.lookAt(t);
}
function resizeWorld() {
  const w = Math.max(320, worldEl.clientWidth);
  const h = Math.max(96, worldEl.clientHeight);
  worldRenderer.setSize(w, h, false);
  orbitCam.aspect = w / h;
  orbitCam.updateProjectionMatrix();
}
function renderPhoto(p) {
  const W = Math.max(64, Math.round(p.W));
  const H = Math.max(64, Math.round(p.H));
  resizePhotoTarget(W, H);
  applyPhotoCamera(p);
  const N = p.fn;
  const aperture = N > 0 && isFinite(N) ? p.f / N : 0;
  dofMat.uniforms.focus.value = p.focus;
  dofMat.uniforms.focalMm.value = p.f;
  dofMat.uniforms.aperture.value = aperture;
  dofMat.uniforms.pitch.value = p.Sw / W;
  dofMat.uniforms.u0.value = p.u0;
  dofMat.uniforms.v0.value = p.v0;
  dofMat.uniforms.tColor.value = photoTarget.texture;
  dofMat.uniforms.tDepth.value = photoTarget.depthTexture;
  photoRenderer.setRenderTarget(photoTarget);
  photoRenderer.clear();
  photoRenderer.render(worldScene, photoCam);
  photoRenderer.setRenderTarget(null);
  photoRenderer.clear();
  photoRenderer.render(dofScene, dofCam);
}
function renderWorld() {
  resizeWorld();
  updateOrbit();
  const buf = worldRenderer.getSize(new THREE.Vector2());
  worldRenderer.setScissorTest(false);
  worldRenderer.setViewport(0, 0, buf.x, buf.y);
  worldRenderer.setClearColor(0xc5dff2, 1);
  worldRenderer.render(worldScene, orbitCam);
  const iw = Math.floor(buf.x * 0.28);
  const ih = Math.floor(buf.y * 0.30);
  const ix = 12;
  const iy = 12;
  worldRenderer.setScissorTest(true);
  worldRenderer.setViewport(ix - 2, iy - 2, iw + 4, ih + 4);
  worldRenderer.setScissor(ix - 2, iy - 2, iw + 4, ih + 4);
  worldRenderer.setClearColor(0x1c2430, 1);
  worldRenderer.clear(true, false, false);
  worldRenderer.setViewport(ix, iy, iw, ih);
  worldRenderer.setScissor(ix, iy, iw, ih);
  worldRenderer.setClearColor(0xd7e7f4, 1);
  worldRenderer.clear(true, true, false);
  insetCam.aspect = iw / Math.max(1, ih);
  insetCam.updateProjectionMatrix();
  worldRenderer.render(worldScene, insetCam);
  worldRenderer.setScissorTest(false);
}
function stepSnow(dt) {
  const arr = snowGeo.attributes.position.array;
  for (let i = 0; i < snowCount; i++) {
    arr[i * 3 + 1] -= (0.35 + (i % 5) * 0.06) * dt;
    arr[i * 3] += Math.sin(i + arr[i * 3 + 1]) * 0.02 * dt;
    if (arr[i * 3 + 1] < 0) {
      arr[i * 3 + 1] = 5.5 + (i % 7) * 0.2;
      arr[i * 3] = ((i * 17) % 240) / 10 - 12;
      arr[i * 3 + 2] = ((i * 29) % 360) / 10 - 24;
    }
  }
  snowGeo.attributes.position.needsUpdate = true;
}

let reduceMotion = false;
try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
let last = 0;
let lastRender = 0;
function frame(now) {
  if (document.hidden || (compactDisplay && now - lastRender < 1000 / 30)) {
    requestAnimationFrame(frame);
    return;
  }
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
  last = now;
  lastRender = now;
  if (!reduceMotion) stepSnow(dt);
  const p = params();
  poseRig(p);
  renderWorld();
  renderPhoto(p);
  if (!reduceMotion) requestAnimationFrame(frame);
}
function refreshReadouts() {
  const p = params();
  showOutputs(p);
  if (!readoutQueued) {
    readoutQueued = requestAnimationFrame(() => {
      readoutQueued = 0;
      updateReadout(params());
    });
  }
  if (reduceMotion) {
    poseRig(p);
    renderWorld();
    renderPhoto(p);
  }
}

const extrinsicKey = { alpha: "alpha", beta: "beta", gamma: "gamma", tx: "tx", ty: "ty", tz: "tz" };
let lastValid = null;
function rememberPose(p) {
  lastValid = { alpha: p.alpha, beta: p.beta, gamma: p.gamma, tx: p.tx, ty: p.ty, tz: p.tz };
}
function enforcePose(changedId) {
  const key = extrinsicKey[changedId];
  if (!key || !lastValid) return;
  const proposed = params();
  if (core.poseClear(proposed)) { rememberPose(proposed); return; }
  const base = Object.assign({}, proposed, lastValid);
  const el = $(changedId);
  el.value = String(core.clampExtrinsic(base, proposed, key));
  if (!core.poseClear(params())) {
    const step = Number(el.step) || 0;
    const dir = Math.sign(base[key] - proposed[key]) || 1;
    let guard = 0;
    while (step > 0 && !core.poseClear(params()) && guard < 12) {
      el.value = String(Number(el.value) + dir * step);
      guard++;
    }
  }
  rememberPose(params());
}
["fmm", "sw", "sh", "imgw", "imgh", "fx", "fy", "s", "u0", "v0", "alpha", "beta", "gamma", "tx", "ty", "tz", "fn", "focus"].forEach((id) => {
  $(id).addEventListener("input", () => {
    if (id === "fmm") syncLens("f");
    else if (id === "sw") syncLens("sw");
    else if (id === "sh") syncLens("sh");
    else if (id === "imgw") syncLens("imgw");
    else if (id === "imgh") syncLens("imgh");
    else if (id === "fx") syncLens("fx");
    else if (id === "fy") syncLens("fy");
    enforcePose(id);
    refreshReadouts();
  });
});
$("btn-reset").addEventListener("click", () => { writeControls(core.DEFAULTS); rememberPose(params()); refreshReadouts(); });
window.addEventListener("resize", () => { if (reduceMotion) refreshReadouts(); });
let dragging = false, lx = 0, ly = 0;
worldEl.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; try { worldEl.setPointerCapture(e.pointerId); } catch (err) {} });
worldEl.addEventListener("pointerup", () => { dragging = false; });
worldEl.addEventListener("pointercancel", () => { dragging = false; });
worldEl.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  orbit.az += (e.clientX - lx) * 0.008;
  orbit.el = Math.max(-0.2, Math.min(1.2, orbit.el + (e.clientY - ly) * 0.006));
  lx = e.clientX; ly = e.clientY;
});

const rigEl = $("rig-view");
const rctx = rigEl.getContext("2d");
const RIG_P = [0.9, 0.5, 0.45];
function drawRig() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = rigEl.getBoundingClientRect();
  const w = Math.max(280, rect.width || 360), h = Math.max(220, rect.height || 240);
  rigEl.width = Math.round(w * dpr); rigEl.height = Math.round(h * dpr);
  rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  rctx.fillStyle = "#f4f7fb";
  rctx.fillRect(0, 0, w, h);
  const alpha = Number($("rig-alpha").value), beta = Number($("rig-beta").value), gamma = Number($("rig-gamma").value);
  const t = [Number($("rig-tx").value), Number($("rig-ty").value), Number($("rig-tz").value)];
  const R = core.elementary(alpha, beta, gamma);
  const Rp = core.mulV(R, RIG_P);
  const pp = [Rp[0] + t[0], Rp[1] + t[1], Rp[2] + t[2]];
  const eye = [2.5, 1.65, 2.7], tgt = [0.2, 0.35, 0.15];
  const f = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]);
  f[0] /= fl; f[1] /= fl; f[2] /= fl;
  const right = [-f[2], 0, f[0]];
  const rl = Math.hypot(right[0], right[2]) || 1;
  right[0] /= rl; right[2] /= rl;
  const up = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
  function P(q) {
    const rel = [q[0] - eye[0], q[1] - eye[1], q[2] - eye[2]];
    const x = rel[0] * right[0] + rel[1] * right[1] + rel[2] * right[2];
    const y = rel[0] * up[0] + rel[1] * up[1] + rel[2] * up[2];
    const z = rel[0] * f[0] + rel[1] * f[1] + rel[2] * f[2];
    if (z < 0.05) return null;
    const focal = h * 1.05;
    return { u: w / 2 + x / z * focal, v: h / 2 - y / z * focal };
  }
  function line(a, b, color, width) {
    const A = P(a), B = P(b);
    if (!A || !B) return;
    rctx.strokeStyle = color; rctx.lineWidth = width;
    rctx.beginPath(); rctx.moveTo(A.u, A.v); rctx.lineTo(B.u, B.v); rctx.stroke();
  }
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  function axes(origin, M, len, width) {
    line(origin, [origin[0] + M[0][0] * len, origin[1] + M[1][0] * len, origin[2] + M[2][0] * len], "#c4473a", width);
    line(origin, [origin[0] + M[0][1] * len, origin[1] + M[1][1] * len, origin[2] + M[2][1] * len], "#2f8f4e", width);
    line(origin, [origin[0] + M[0][2] * len, origin[1] + M[1][2] * len, origin[2] + M[2][2] * len], "#2a5fbf", width);
  }
  axes([0, 0, 0], I, 1.15, 2);
  axes(t, R, 0.85, 1.6);
  line([0, 0, 0], RIG_P, "#8b9098", 1.2);
  line([0, 0, 0], Rp, "#245c38", 1.5);
  line(Rp, pp, "#c47a20", 2);
  if (Math.hypot(t[0], t[1], t[2]) > 0.02) line([0, 0, 0], t, "#c47a20", 2);
  function dot(q, color, label) {
    const s = P(q); if (!s) return;
    rctx.fillStyle = color;
    rctx.beginPath(); rctx.arc(s.u, s.v, 4.5, 0, Math.PI * 2); rctx.fill();
    rctx.fillStyle = "#1c2430";
    rctx.font = "13px system-ui, sans-serif";
    rctx.fillText(label, s.u + 6, s.v - 6);
  }
  dot(RIG_P, "#5c6570", "p");
  dot(Rp, "#245c38", "Rp");
  dot(pp, "#8a4b12", "p′");
  $("rig-alpha-out").textContent = alpha.toFixed(0) + "°";
  $("rig-beta-out").textContent = beta.toFixed(0) + "°";
  $("rig-gamma-out").textContent = gamma.toFixed(0) + "°";
  $("rig-tx-out").textContent = t[0].toFixed(2) + " m";
  $("rig-ty-out").textContent = t[1].toFixed(2) + " m";
  $("rig-tz-out").textContent = t[2].toFixed(2) + " m";
  $("rig-text").textContent = "rotated alpha=" + alpha.toFixed(0) + "° about x, beta=" + beta.toFixed(0) + "° about y, gamma=" + gamma.toFixed(0) + "° about z";
  $("rig-math").innerHTML = "<p>R = R<sub>z</sub>(γ) R<sub>x</sub>(α) R<sub>y</sub>(β)</p>" + mathMatrix(R) + "<p>p′ = R p + t</p>" + mathVec("p'", pp);
}
["rig-alpha", "rig-beta", "rig-gamma", "rig-tx", "rig-ty", "rig-tz"].forEach((id) => $(id).addEventListener("input", drawRig));
const how = document.querySelector(".how-it-works");
if (how) how.addEventListener("toggle", () => { if (how.open) drawRig(); });

writeControls(core.DEFAULTS);
rememberPose(params());
refreshReadouts();
drawRig();
if (!reduceMotion) requestAnimationFrame(frame);
else { poseRig(params()); renderWorld(); renderPhoto(params()); }

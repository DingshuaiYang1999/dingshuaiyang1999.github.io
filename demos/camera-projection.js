/* Pinhole projection: w [u, v, 1]^T = K [R | t] [x, y, z, 1]^T.
   Camera axes: x right, y down, z forward. Lens distortion is ignored.
   World: x right, y up, z toward the default viewer.
   R = R_z(roll) R_x(pitch) R_y(yaw) R_0, with R_0 = diag(1, -1, -1).
   At zero angles the camera looks toward the world origin from positive z. */
(function (root) {
  "use strict";

  var IMG_W = 640, IMG_H = 480;
  var R0 = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
  var DEFAULTS = {
    fx: 520, fy: 520, s: 0, u0: 320, v0: 240,
    yaw: 0, pitch: 0, roll: 0,
    tx: 0, ty: 1.35, tz: 4.2
  };
  var TIP = [0, 2.55, 0];

  function rad(d) { return d * Math.PI / 180; }
  function mul(A, B) {
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], i, j;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {
      C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    }
    return C;
  }
  function mulV(A, v) {
    return [
      A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
      A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
      A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]
    ];
  }
  function rotX(a) {
    var c = Math.cos(a), s = Math.sin(a);
    return [[1, 0, 0], [0, c, -s], [0, s, c]];
  }
  function rotY(a) {
    var c = Math.cos(a), s = Math.sin(a);
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
  }
  function rotZ(a) {
    var c = Math.cos(a), s = Math.sin(a);
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  }
  function rotation(yaw, pitch, roll) {
    return mul(rotZ(rad(roll)), mul(rotX(rad(pitch)), mul(rotY(rad(yaw)), R0)));
  }
  function Kof(p) {
    return [[p.fx, p.s, p.u0], [0, p.fy, p.v0], [0, 0, 1]];
  }
  function project(X, p) {
    var R = rotation(p.yaw, p.pitch, p.roll);
    var Xc = mulV(R, X);
    Xc[0] += p.tx; Xc[1] += p.ty; Xc[2] += p.tz;
    var Z = Xc[2];
    var inhom = [p.fx * Xc[0] + p.s * Xc[1] + p.u0 * Z, p.fy * Xc[1] + p.v0 * Z, Z];
    if (Z <= 1e-6) return { R: R, Xc: Xc, inhom: inhom, u: null, v: null, inFront: false };
    return { R: R, Xc: Xc, inhom: inhom, u: inhom[0] / Z, v: inhom[1] / Z, inFront: true };
  }

  function cone(y0, y1, radius, n, color, tris, edges) {
    var i, a0, a1, p0, p1, tip = [0, y1, 0];
    for (i = 0; i < n; i++) {
      a0 = (i / n) * Math.PI * 2;
      a1 = ((i + 1) / n) * Math.PI * 2;
      p0 = [Math.cos(a0) * radius, y0, Math.sin(a0) * radius];
      p1 = [Math.cos(a1) * radius, y0, Math.sin(a1) * radius];
      tris.push({ p: [tip, p0, p1], color: color });
      edges.push([tip, p0], [p0, p1]);
    }
  }
  function prism(y0, y1, radius, n, color, tris, edges) {
    var i, a0, a1, b0, b1, t0, t1;
    for (i = 0; i < n; i++) {
      a0 = (i / n) * Math.PI * 2;
      a1 = ((i + 1) / n) * Math.PI * 2;
      b0 = [Math.cos(a0) * radius, y0, Math.sin(a0) * radius];
      b1 = [Math.cos(a1) * radius, y0, Math.sin(a1) * radius];
      t0 = [Math.cos(a0) * radius, y1, Math.sin(a0) * radius];
      t1 = [Math.cos(a1) * radius, y1, Math.sin(a1) * radius];
      tris.push({ p: [b0, b1, t1], color: color }, { p: [b0, t1, t0], color: color });
      edges.push([b0, t0], [b0, b1]);
    }
  }
  function scene() {
    var tris = [], edges = [];
    prism(0, 0.42, 0.055, 6, "#5c3b22", tris, edges);
    cone(0.32, 1.15, 0.92, 8, "#8fce78", tris, edges);
    cone(0.85, 1.65, 0.70, 8, "#7dba68", tris, edges);
    cone(1.32, 2.05, 0.48, 8, "#6aaa58", tris, edges);
    cone(1.72, 2.38, 0.28, 8, "#9ed688", tris, edges);
    var star = [0, 2.55, 0];
    var i, a, b;
    for (i = 0; i < 4; i++) {
      a = [Math.cos(i * Math.PI / 2) * 0.09, 2.40, Math.sin(i * Math.PI / 2) * 0.09];
      b = [Math.cos((i + 1) * Math.PI / 2) * 0.09, 2.40, Math.sin((i + 1) * Math.PI / 2) * 0.09];
      tris.push({ p: [star, a, b], color: "#e2b84a" });
      edges.push([star, a]);
    }
    return { tris: tris, edges: edges, tip: TIP };
  }
  function gridLines() {
    var lines = [], i, t;
    for (i = -3; i <= 3; i++) {
      t = i * 0.5;
      lines.push([[t, 0, -1.5], [t, 0, 1.5]], [[-1.5, 0, t], [1.5, 0, t]]);
    }
    return lines;
  }

  var core = {
    IMG_W: IMG_W, IMG_H: IMG_H, DEFAULTS: DEFAULTS, TIP: TIP, R0: R0,
    rotation: rotation, Kof: Kof, project: project, scene: scene, gridLines: gridLines, mul: mul, mulV: mulV
  };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.CameraCore = core;
  if (typeof document === "undefined") return;

  var $ = function (id) { return document.getElementById(id); };
  var world = $("view-world"), photo = $("view-photo");
  var wctx = world.getContext("2d"), pctx = photo.getContext("2d");
  var built = scene();
  var grid = gridLines();
  var view = { az: 0.75, el: 0.32, dist: 7.2 };
  var dragging = false, lastX = 0, lastY = 0;

  function params() {
    return {
      fx: Number($("fx").value), fy: Number($("fy").value), s: Number($("s").value),
      u0: Number($("u0").value), v0: Number($("v0").value),
      yaw: Number($("yaw").value), pitch: Number($("pitch").value), roll: Number($("roll").value),
      tx: Number($("tx").value), ty: Number($("ty").value), tz: Number($("tz").value)
    };
  }
  function writeControls(p) {
    ["fx", "fy", "s", "u0", "v0", "yaw", "pitch", "roll", "tx", "ty", "tz"].forEach(function (k) {
      $(k).value = p[k];
    });
    showOutputs(p);
  }
  function showOutputs(p) {
    $("fx-out").textContent = p.fx.toFixed(0);
    $("fy-out").textContent = p.fy.toFixed(0);
    $("s-out").textContent = p.s.toFixed(0);
    $("u0-out").textContent = p.u0.toFixed(0);
    $("v0-out").textContent = p.v0.toFixed(0);
    $("yaw-out").textContent = p.yaw.toFixed(0) + "°";
    $("pitch-out").textContent = p.pitch.toFixed(0) + "°";
    $("roll-out").textContent = p.roll.toFixed(0) + "°";
    $("tx-out").textContent = p.tx.toFixed(2);
    $("ty-out").textContent = p.ty.toFixed(2);
    $("tz-out").textContent = p.tz.toFixed(2);
  }
  function fmt(x) {
    var s = (Math.round(x * 100) / 100).toFixed(2);
    return s === "-0.00" ? "0.00" : s;
  }
  function mathMatrix(M) {
    return "<math><mrow><mo>[</mo><mtable>" + M.map(function (row) {
      return "<mtr>" + row.map(function (c) { return "<mtd><mn>" + fmt(c) + "</mn></mtd>"; }).join("") + "</mtr>";
    }).join("") + "</mtable><mo>]</mo></mrow></math>";
  }
  function mathVec(name, v, digits) {
    return "<math><mrow><mi>" + name + "</mi><mo>=</mo><mo>[</mo>" + v.map(function (c) {
      return "<mn>" + fmt(c) + "</mn>";
    }).join("<mo>,</mo>") + "<mo>]</mo></mrow></math>";
  }

  function orbit(P, w, h) {
    var az = view.az, el = view.el, dist = view.dist;
    var tgt = [0, 1.15, 0];
    var eye = [
      tgt[0] + dist * Math.cos(el) * Math.sin(az),
      tgt[1] + dist * Math.sin(el),
      tgt[2] + dist * Math.cos(el) * Math.cos(az)
    ];
    var f = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]];
    var fl = Math.hypot(f[0], f[1], f[2]);
    f = [f[0] / fl, f[1] / fl, f[2] / fl];
    var right = [-f[2], 0, f[0]];
    var rl = Math.hypot(right[0], right[1], right[2]) || 1;
    right = [right[0] / rl, right[1] / rl, right[2] / rl];
    var up = [
      right[1] * f[2] - right[2] * f[1],
      right[2] * f[0] - right[0] * f[2],
      right[0] * f[1] - right[1] * f[0]
    ];
    var rel = [P[0] - eye[0], P[1] - eye[1], P[2] - eye[2]];
    var x = rel[0] * right[0] + rel[1] * right[1] + rel[2] * right[2];
    var y = rel[0] * up[0] + rel[1] * up[1] + rel[2] * up[2];
    var z = rel[0] * f[0] + rel[1] * f[1] + rel[2] * f[2];
    if (z < 0.08) return null;
    var focal = h * 1.15;
    return { u: w / 2 + (x / z) * focal, v: h / 2 - (y / z) * focal, z: z };
  }

  function cameraCenter(p) {
    var R = rotation(p.yaw, p.pitch, p.roll);
    var Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
    var t = [p.tx, p.ty, p.tz];
    var c = mulV(Rt, t);
    return [-c[0], -c[1], -c[2]];
  }
  function frustumCorners(p, depth) {
    var Kinv = function (u, v, Z) {
      var Y = (v - p.v0) * Z / p.fy;
      var X = ((u - p.u0) - p.s * Y / Z) * Z / p.fx;
      return [X, Y, Z];
    };
    var R = rotation(p.yaw, p.pitch, p.roll);
    var Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
    var C = cameraCenter(p);
    return [[0, 0], [IMG_W, 0], [IMG_W, IMG_H], [0, IMG_H]].map(function (px) {
      var Xc = Kinv(px[0], px[1], depth);
      var d = mulV(Rt, Xc);
      return [C[0] + d[0], C[1] + d[1], C[2] + d[2]];
    });
  }

  function cssColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function drawWorld(p) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = world.getBoundingClientRect();
    var w = Math.max(320, rect.width), h = Math.max(280, rect.height);
    world.width = Math.round(w * dpr); world.height = Math.round(h * dpr);
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wctx.fillStyle = cssColor("--bg", "#fff");
    wctx.fillRect(0, 0, w, h);
    function line(a, b, color, width) {
      var A = orbit(a, w, h), B = orbit(b, w, h);
      if (!A || !B) return;
      wctx.strokeStyle = color; wctx.lineWidth = width;
      wctx.beginPath(); wctx.moveTo(A.u, A.v); wctx.lineTo(B.u, B.v); wctx.stroke();
    }
    grid.forEach(function (seg) { line(seg[0], seg[1], "#c5cad3", 1); });
    line([0, 0, 0], [1.3, 0, 0], "#c4473a", 2);
    line([0, 0, 0], [0, 1.3, 0], "#2f8f4e", 2);
    line([0, 0, 0], [0, 0, 1.3], "#2a5fbf", 2);
    var faces = built.tris.map(function (t) {
      var c = [(t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3, (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3];
      var q = orbit(c, w, h);
      return { t: t, z: q ? q.z : 0 };
    }).sort(function (a, b) { return b.z - a.z; });
    faces.forEach(function (f) {
      var pts = f.t.p.map(function (q) { return orbit(q, w, h); });
      if (pts.some(function (q) { return !q; })) return;
      wctx.fillStyle = f.t.color;
      wctx.beginPath();
      wctx.moveTo(pts[0].u, pts[0].v);
      wctx.lineTo(pts[1].u, pts[1].v);
      wctx.lineTo(pts[2].u, pts[2].v);
      wctx.closePath();
      wctx.fill();
    });
    var C = cameraCenter(p);
    var planeZ = 1.55;
    var plane = frustumCorners(p, planeZ);
    var poly = plane.map(function (q) { return orbit(q, w, h); });
    if (poly.every(function (q) { return q; })) {
      wctx.fillStyle = "rgba(61, 111, 191, 0.16)";
      wctx.beginPath();
      wctx.moveTo(poly[0].u, poly[0].v);
      for (var pi = 1; pi < 4; pi++) wctx.lineTo(poly[pi].u, poly[pi].v);
      wctx.closePath();
      wctx.fill();
    }
    function onPlane(P) {
      var hit = project(P, p);
      if (!hit.inFront) return null;
      var Y = (hit.v - p.v0) * planeZ / p.fy;
      var X = ((hit.u - p.u0) - p.s * (hit.v - p.v0) / p.fy) * planeZ / p.fx;
      var R = rotation(p.yaw, p.pitch, p.roll);
      var Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
      var d = mulV(Rt, [X, Y, planeZ]);
      return [C[0] + d[0], C[1] + d[1], C[2] + d[2]];
    }
    built.edges.forEach(function (e) {
      var A = onPlane(e[0]), B = onPlane(e[1]);
      if (A && B) line(A, B, "#1f7a45", 1.15);
    });
    plane.forEach(function (q) { line(C, q, "#3d6fbf", 1.15); });
    for (var i = 0; i < 4; i++) line(plane[i], plane[(i + 1) % 4], "#3d6fbf", 1.6);
    var rays = [built.tip];
    for (var k = 0; k < 4; k++) {
      var ang = k * Math.PI / 2;
      rays.push([Math.cos(ang) * 0.92, 0.32, Math.sin(ang) * 0.92]);
    }
    rays.forEach(function (q) { line(q, C, "rgba(61, 111, 191, 0.45)", 1); });
  }

  function photoPoint(P, p) {
    var r = project(P, p);
    if (!r.inFront) return null;
    return { u: r.u, v: r.v };
  }
  function drawPhoto(p) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    photo.width = Math.round(IMG_W * dpr); photo.height = Math.round(IMG_H * dpr);
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.fillStyle = "#eef0f3";
    pctx.fillRect(0, 0, IMG_W, IMG_H);
    pctx.strokeStyle = "#8b9098";
    pctx.lineWidth = 2;
    pctx.strokeRect(1, 1, IMG_W - 2, IMG_H - 2);
    function strokeEdges(params, color, width) {
      pctx.strokeStyle = color; pctx.lineWidth = width;
      function seg(a, b) {
        var A = photoPoint(a, params), B = photoPoint(b, params);
        if (!A || !B) return;
        pctx.beginPath(); pctx.moveTo(A.u, A.v); pctx.lineTo(B.u, B.v); pctx.stroke();
      }
      grid.forEach(function (ln) { seg(ln[0], ln[1]); });
      built.edges.forEach(function (ln) { seg(ln[0], ln[1]); });
    }
    strokeEdges(DEFAULTS, "rgba(90, 96, 104, 0.38)", 1.15);
    strokeEdges(p, "#245c38", 1.7);
    pctx.strokeStyle = "#c4473a";
    pctx.lineWidth = 1.25;
    pctx.beginPath();
    pctx.moveTo(p.u0 - 8, p.v0); pctx.lineTo(p.u0 + 8, p.v0);
    pctx.moveTo(p.u0, p.v0 - 8); pctx.lineTo(p.u0, p.v0 + 8);
    pctx.stroke();
    pctx.fillStyle = "#5c6570";
    pctx.font = "14px system-ui, sans-serif";
    pctx.fillText("u", IMG_W - 18, IMG_H - 10);
    pctx.fillText("v", 8, 16);
  }

  function updateReadout(p) {
    var R = rotation(p.yaw, p.pitch, p.roll);
    var K = Kof(p);
    var pr = project(TIP, p);
    $("mat-k").innerHTML = mathMatrix(K);
    $("mat-r").innerHTML = mathMatrix(R);
    $("mat-t").innerHTML = mathVec("t", [p.tx, p.ty, p.tz]);
    var rows = "";
    rows += "<p><span>Tree tip in the world</span> " + mathVec("X", [TIP[0], TIP[1], TIP[2], 1]) + "</p>";
    rows += "<p><span>In the camera</span> " + mathVec("Xcam", [pr.Xc[0], pr.Xc[1], pr.Xc[2]]) + "</p>";
    if (pr.inFront) {
      rows += "<p><span>After K, before dividing by w</span> " + mathVec("wuv", pr.inhom) + "</p>";
      rows += "<p><span>Pixel</span> " + mathVec("uv", [pr.u, pr.v]) + "</p>";
    } else {
      rows += "<p>The tip is behind the camera (z<sub>cam</sub> ≤ 0), so it is not drawn.</p>";
    }
    $("worked").innerHTML = rows;
  }

  function draw() {
    var p = params();
    showOutputs(p);
    drawWorld(p);
    drawPhoto(p);
    updateReadout(p);
  }

  ["fx", "fy", "s", "u0", "v0", "yaw", "pitch", "roll", "tx", "ty", "tz"].forEach(function (id) {
    $(id).addEventListener("input", draw);
  });
  $("btn-reset").addEventListener("click", function () { writeControls(DEFAULTS); draw(); });
  world.addEventListener("pointerdown", function (e) {
    dragging = true; lastX = e.clientX; lastY = e.clientY; world.setPointerCapture(e.pointerId);
  });
  world.addEventListener("pointerup", function () { dragging = false; });
  world.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    view.az += (e.clientX - lastX) * 0.008;
    view.el = Math.max(-0.4, Math.min(1.1, view.el + (e.clientY - lastY) * 0.006));
    lastX = e.clientX; lastY = e.clientY;
    drawWorld(params());
  });
  var themeBtn = document.querySelector(".theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", function () { setTimeout(draw, 0); });
  window.addEventListener("resize", draw);
  writeControls(DEFAULTS);
  draw();
})(typeof window !== "undefined" ? window : globalThis);

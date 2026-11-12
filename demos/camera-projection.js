/* Pinhole projection: w [u, v, 1]^T = K [R | t] [x, y, z, 1]^T.
   Camera axes: x right, y down, z forward. Lens distortion is ignored.
   World: x right, y up, z toward the default viewer.
   Elementary product R_e = R_z(γ) R_x(α) R_y(β), counter-clockwise.
   The camera uses R = R_e R_0 with R_0 = diag(1, -1, -1), so X_cam = R X + t.
   α, β, γ are the slider angles about x, y, z. */
(function (root) {
  "use strict";

  var IMG_W = 720, IMG_H = 480;
  var R0 = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
  var SENSOR_SCALE = 28;
  var DEFAULTS = {
    f: 50, Sw: 36, Sh: 24, W: IMG_W, H: IMG_H,
    fx: 50 * IMG_W / 36, fy: 50 * IMG_H / 24,
    s: 0, u0: IMG_W / 2, v0: IMG_H / 2,
    alpha: 4, beta: 0, gamma: 0,
    tx: 0, ty: 1.45, tz: 6.4,
    fn: 1.8, focus: 6.3
  };
  var TIP = [0, 2.55, 0];
  var ANCHORS = {
    tree: [0, 1.2, 0],
    near: [0.58, 1.62, 4.22],
    far: [-3.2, 1.4, -14]
  };
  var LIGHT = null;

  function rad(d) { return d * Math.PI / 180; }
  function hypot(a, b, c) { return Math.hypot(a, b, c); }
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
  function elementary(alpha, beta, gamma) {
    return mul(rotZ(rad(gamma)), mul(rotX(rad(alpha)), rotY(rad(beta))));
  }
  function rotation(yaw, pitch, roll) {
    return mul(elementary(pitch, yaw, roll), R0);
  }
  function angles(p) {
    return {
      alpha: p.alpha != null ? p.alpha : (p.pitch != null ? p.pitch : 0),
      beta: p.beta != null ? p.beta : (p.yaw != null ? p.yaw : 0),
      gamma: p.gamma != null ? p.gamma : (p.roll != null ? p.roll : 0)
    };
  }
  function Kof(p) {
    return [[p.fx, p.s, p.u0], [0, p.fy, p.v0], [0, 0, 1]];
  }
  function project(X, p) {
    var ang = angles(p);
    var R = rotation(ang.beta, ang.alpha, ang.gamma);
    var Xc = mulV(R, X);
    Xc[0] += p.tx; Xc[1] += p.ty; Xc[2] += p.tz;
    var Z = Xc[2];
    var inhom = [p.fx * Xc[0] + p.s * Xc[1] + p.u0 * Z, p.fy * Xc[1] + p.v0 * Z, Z];
    if (Z <= 1e-6) return { R: R, Xc: Xc, inhom: inhom, u: null, v: null, inFront: false };
    return { R: R, Xc: Xc, inhom: inhom, u: inhom[0] / Z, v: inhom[1] / Z, inFront: true };
  }
  function imageSize(p) {
    return { W: p && p.W != null ? p.W : IMG_W, H: p && p.H != null ? p.H : IMG_H };
  }
  function focalMm(p) {
    if (p.f != null && isFinite(p.f)) return p.f;
    var Sw = p.Sw != null ? p.Sw : 36;
    return p.fx * Sw / imageSize(p).W;
  }
  function fxFromLens(f, Sw, W) { return f * (W || IMG_W) / Sw; }
  function fyFromLens(f, Sh, H) { return f * (H || IMG_H) / Sh; }
  function afov(sensorMm, focal) { return 2 * Math.atan(sensorMm / (2 * focal)); }
  function asymAngle(principal, size, focalPx) {
    return Math.atan(principal / focalPx) + Math.atan((size - principal) / focalPx);
  }
  function circleOfConfusion(p, dMetres) {
    var N = p.fn;
    if (!(N > 0) || !isFinite(N)) return 0;
    var f = focalMm(p);
    var A = f / N;
    if (!(A > 0) || !(dMetres > 1e-8)) return 0;
    var d = dMetres * 1000;
    var df = (p.focus != null ? p.focus : dMetres) * 1000;
    var den = d * (df - f);
    if (Math.abs(den) < 1e-6) return 0;
    return Math.abs(A * f * (d - df) / den);
  }
  function cocPixels(p, dMetres) {
    var Sw = p.Sw != null ? p.Sw : 36;
    return circleOfConfusion(p, dMetres) / (Sw / imageSize(p).W);
  }

  function norm(v) {
    var L = hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scl(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function hexToRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function shade(hex, n, mode) {
    if (!LIGHT) LIGHT = norm([0.28, 0.92, 0.26]);
    var nd = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
    if (nd < 0) nd = 0;
    var k = 0.4 + 0.48 * nd + 0.16 * nd * nd;
    var c = hexToRgb(hex);
    if (mode === "emit") k = 0.94 + 0.1 * nd;
    if (mode === "spec" && nd > 0.62) {
      var sp = (nd - 0.62) / 0.38;
      k = Math.min(1.15, k + 0.35 * sp * sp);
      c = [c[0] + (255 - c[0]) * sp * 0.72, c[1] + (255 - c[1]) * sp * 0.72, c[2] + (255 - c[2]) * sp * 0.72];
    }
    return "rgb(" + (Math.max(0, Math.min(255, c[0] * k)) | 0) + "," + (Math.max(0, Math.min(255, c[1] * k)) | 0) + "," + (Math.max(0, Math.min(255, c[2] * k)) | 0) + ")";
  }
  function triNormal(a, b, c) {
    return norm(cross(sub(b, a), sub(c, a)));
  }
  function addTri(tris, a, b, c, hex, bias, mode) {
    var n = triNormal(a, b, c);
    if (bias && (n[0] * bias[0] + n[1] * bias[1] + n[2] * bias[2]) < 0) {
      var tmp = a; a = b; b = tmp;
      n = [-n[0], -n[1], -n[2]];
    }
    tris.push({ p: [a, b, c], color: shade(hex, n, mode) });
  }
  function addQuad(tris, a, b, c, d, hex) {
    addTri(tris, a, b, c, hex);
    addTri(tris, a, c, d, hex);
  }
  function addBox(tris, edges, x0, y0, z0, x1, y1, z1, hex) {
    var p000 = [x0, y0, z0], p100 = [x1, y0, z0], p110 = [x1, y1, z0], p010 = [x0, y1, z0];
    var p001 = [x0, y0, z1], p101 = [x1, y0, z1], p111 = [x1, y1, z1], p011 = [x0, y1, z1];
    addQuad(tris, p001, p101, p111, p011, hex);
    addQuad(tris, p100, p000, p010, p110, hex);
    addQuad(tris, p000, p001, p011, p010, hex);
    addQuad(tris, p101, p100, p110, p111, hex);
    addQuad(tris, p010, p011, p111, p110, hex);
    addQuad(tris, p000, p100, p101, p001, hex);
    if (edges) edges.push([p000, p100], [p100, p110], [p110, p010], [p010, p000], [p001, p101], [p101, p111], [p111, p011], [p011, p001], [p000, p001], [p100, p101], [p110, p111], [p010, p011]);
  }
  var GREENS = ["#1c6430", "#2d8744", "#246838", "#3c9a50", "#184f28", "#4aaa56", "#215e34"];
  function ringPoint(y, radius, a, i, origin, scale, phase) {
    var jag = (i % 2 === 0) ? 1 : 0.56;
    var wobble = jag * (1 + 0.09 * Math.sin(3 * a + phase) + 0.05 * Math.sin(7 * a + 0.6));
    return [
      origin[0] + Math.cos(a) * radius * wobble * scale,
      origin[1] + y * scale,
      origin[2] + Math.sin(a) * radius * wobble * scale
    ];
  }
  function addCone(tris, edges, y0, y1, radius, n, origin, scale, phase) {
    var tip = [origin[0], origin[1] + y1 * scale, origin[2]];
    var i, a0, a1, p0, p1, mid, hex;
    for (i = 0; i < n; i++) {
      a0 = (i / n) * Math.PI * 2;
      a1 = ((i + 1) / n) * Math.PI * 2;
      p0 = ringPoint(y0, radius, a0, i, origin, scale, phase);
      p1 = ringPoint(y0, radius, a1, i + 1, origin, scale, phase);
      mid = [(p0[0] + p1[0]) / 2 - origin[0], 0, (p0[2] + p1[2]) / 2 - origin[2]];
      hex = GREENS[(i + (phase * 3 | 0)) % GREENS.length];
      addTri(tris, tip, p1, p0, hex, [mid[0], 0.2, mid[2]]);
      if (edges && i % 3 === 0) edges.push([tip, p0]);
    }
  }
  function addTrunk(tris, edges, y0, y1, radius, n, origin, scale) {
    var barks = ["#5a381f", "#7a4e2c", "#4a2e18", "#6b4426"];
    var i, a0, a1, b0, b1, t0, t1, rr0, rr1;
    for (i = 0; i < n; i++) {
      a0 = (i / n) * Math.PI * 2;
      a1 = ((i + 1) / n) * Math.PI * 2;
      rr0 = radius * (0.92 + 0.1 * Math.sin(i * 2.2));
      rr1 = radius * (0.92 + 0.1 * Math.sin((i + 1) * 2.2));
      b0 = [origin[0] + Math.cos(a0) * rr0 * scale, origin[1] + y0 * scale, origin[2] + Math.sin(a0) * rr0 * scale];
      b1 = [origin[0] + Math.cos(a1) * rr1 * scale, origin[1] + y0 * scale, origin[2] + Math.sin(a1) * rr1 * scale];
      t0 = [origin[0] + Math.cos(a0) * rr0 * 0.86 * scale, origin[1] + y1 * scale, origin[2] + Math.sin(a0) * rr0 * 0.86 * scale];
      t1 = [origin[0] + Math.cos(a1) * rr1 * 0.86 * scale, origin[1] + y1 * scale, origin[2] + Math.sin(a1) * rr1 * 0.86 * scale];
      addTri(tris, b0, b1, t1, barks[i % 4], [Math.cos(a0), 0, Math.sin(a0)]);
      addTri(tris, b0, t1, t0, barks[(i + 1) % 4], [Math.cos(a0), 0, Math.sin(a0)]);
      if (edges && i % 2 === 0) edges.push([b0, t0]);
    }
  }
  function addOcta(tris, c, r, hex, mode) {
    var px = [c[0] + r, c[1], c[2]], nx = [c[0] - r, c[1], c[2]];
    var py = [c[0], c[1] + r, c[2]], ny = [c[0], c[1] - r, c[2]];
    var pz = [c[0], c[1], c[2] + r], nz = [c[0], c[1], c[2] - r];
    addTri(tris, py, pz, px, hex, null, mode);
    addTri(tris, py, px, nz, hex, null, mode);
    addTri(tris, py, nz, nx, hex, null, mode);
    addTri(tris, py, nx, pz, hex, null, mode);
    addTri(tris, ny, px, pz, hex, null, mode);
    addTri(tris, ny, nz, px, hex, null, mode);
    addTri(tris, ny, nx, nz, hex, null, mode);
    addTri(tris, ny, pz, nx, hex, null, mode);
  }
  function addBauble(tris, c, r, hex) {
    var t = (1 + Math.sqrt(5)) / 2;
    var raw = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    var v = raw.map(function (p) { var L = Math.hypot(p[0], p[1], p[2]); return [c[0] + p[0] / L * r, c[1] + p[1] / L * r, c[2] + p[2] / L * r]; });
    var f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    f.forEach(function (ix) { addTri(tris, v[ix[0]], v[ix[1]], v[ix[2]], hex, null, "spec"); });
  }
  function addStar(tris, edges, origin, scale) {
    var tip = [origin[0], origin[1] + 2.55 * scale, origin[2]];
    var i, a, outer, inner;
    for (i = 0; i < 5; i++) {
      a = i * Math.PI * 2 / 5 - Math.PI / 2;
      outer = [origin[0] + Math.cos(a) * 0.16 * scale, origin[1] + 2.38 * scale, origin[2] + Math.sin(a) * 0.16 * scale];
      inner = [origin[0] + Math.cos(a + Math.PI / 5) * 0.055 * scale, origin[1] + 2.40 * scale, origin[2] + Math.sin(a + Math.PI / 5) * 0.055 * scale];
      addTri(tris, tip, outer, inner, i % 2 ? "#ffe38a" : "#e6b325", [0, 1, 0], "spec");
      if (edges) edges.push([tip, outer]);
    }
  }
  function addTree(tris, edges, origin, scale, phase, detail) {
    var tiers = detail > 1
      ? [[0.22, 0.78, 1.02], [0.52, 1.05, 0.9], [0.78, 1.28, 0.78], [1.02, 1.5, 0.66], [1.24, 1.7, 0.54], [1.46, 1.9, 0.42], [1.66, 2.08, 0.3], [1.86, 2.28, 0.18]]
      : detail > 0
        ? [[0.24, 0.9, 0.9], [0.62, 1.25, 0.72], [0.98, 1.55, 0.54], [1.3, 1.85, 0.36], [1.6, 2.15, 0.22]]
        : [[0.28, 1.05, 0.85], [0.75, 1.5, 0.58], [1.15, 1.9, 0.36], [1.55, 2.2, 0.2]];
    var n = detail > 1 ? 14 : detail > 0 ? 10 : 8;
    var i, h, ang, radAt, colors = ["#c4473a", "#e6b325", "#2a6fbf", "#f2f2f2", "#7a3e8a"];
    addTrunk(tris, edges, 0, 0.42, 0.075, detail > 0 ? 8 : 6, origin, scale);
    for (i = 0; i < tiers.length; i++) addCone(tris, edges, tiers[i][0], tiers[i][1], tiers[i][2], n, origin, scale, phase + i * 0.4);
    addStar(tris, edges, origin, scale);
    if (detail > 0) {
      var baubles = detail > 1 ? 6 : 2;
      for (i = 0; i < baubles; i++) {
        h = 0.55 + i * (1.5 / baubles);
        ang = phase + i * 2.2;
        radAt = (0.72 - h * 0.22) * scale;
        addBauble(tris, [origin[0] + Math.cos(ang) * radAt, origin[1] + h * scale, origin[2] + Math.sin(ang) * radAt], 0.055 * scale, colors[i % colors.length]);
      }
    }
    var lights = detail > 1 ? 18 : detail > 0 ? 8 : 5;
    for (i = 0; i < lights; i++) {
      h = 0.4 + (i / lights) * 1.75;
      ang = phase + i * 1.15;
      radAt = (0.78 - h * 0.28) * scale * (i % 2 ? 0.92 : 0.7);
      addOcta(tris, [origin[0] + Math.cos(ang) * radAt, origin[1] + h * scale, origin[2] + Math.sin(ang) * radAt], 0.03 * scale, i % 3 ? "#ffe7a0" : "#fff6d4", "emit");
    }
    if (detail > 1) {
      addSnow(tris, origin[0] + 0.35, origin[2] + 0.15, 0.55, 0.38);
      addSnow(tris, origin[0] - 0.45, origin[2] - 0.2, 0.42, 0.5);
      addSnow(tris, origin[0] + 0.05, origin[2] + 0.55, 0.36, 0.28);
    }
  }
  function addSnow(tris, x, z, rx, rz) {
    var c = [x, 0.025, z], i, a0, a1;
    for (i = 0; i < 7; i++) {
      a0 = (i / 7) * Math.PI * 2;
      a1 = ((i + 1) / 7) * Math.PI * 2;
      addTri(tris, c, [x + Math.cos(a0) * rx, 0.025, z + Math.sin(a0) * rz], [x + Math.cos(a1) * rx, 0.025, z + Math.sin(a1) * rz], "#f3f7fb", [0, 1, 0]);
    }
  }
  function addEmitQuad(tris, a, b, c, d, hex) {
    addTri(tris, a, b, c, hex, null, "emit");
    addTri(tris, a, c, d, hex, null, "emit");
  }
  function addHouse(tris, edges, x, z) {
    addBox(tris, edges, x - 1.2, 0, z - 0.95, x + 1.2, 1.55, z + 0.95, "#d9c7a4");
    var peak = [x, 2.45, z];
    var a = [x - 1.35, 1.48, z - 1.05], b = [x + 1.35, 1.48, z - 1.05];
    var c = [x + 1.35, 1.48, z + 1.05], d = [x - 1.35, 1.48, z + 1.05];
    addTri(tris, a, b, peak, "#8d4038", [0, 0.4, -1]);
    addTri(tris, b, c, peak, "#7a342e", [1, 0.4, 0]);
    addTri(tris, c, d, peak, "#8d4038", [0, 0.4, 1]);
    addTri(tris, d, a, peak, "#7a342e", [-1, 0.4, 0]);
    addBox(tris, null, x + 0.55, 1.7, z - 0.15, x + 0.85, 2.55, z + 0.18, "#6e5848");
    var fz = z + 0.97;
    addEmitQuad(tris, [x - 0.72, 0.85, fz], [x - 0.28, 0.85, fz], [x - 0.28, 1.25, fz], [x - 0.72, 1.25, fz], "#ffe7a3");
    addEmitQuad(tris, [x + 0.28, 0.85, fz], [x + 0.72, 0.85, fz], [x + 0.72, 1.25, fz], [x + 0.28, 1.25, fz], "#ffe7a3");
    addEmitQuad(tris, [x - 0.22, 0.95, fz], [x + 0.22, 0.95, fz], [x + 0.22, 1.22, fz], [x - 0.22, 1.22, fz], "#fff2c4");
    addQuad(tris, [x - 0.28, 0, fz], [x + 0.28, 0, fz], [x + 0.28, 0.78, fz], [x - 0.28, 0.78, fz], "#5c3a28");
    addEmitQuad(tris, [x + 1.22, 0.7, z - 0.25], [x + 1.22, 0.7, z + 0.25], [x + 1.22, 1.15, z + 0.25], [x + 1.22, 1.15, z - 0.25], "#ffe7a3");
    if (edges) edges.push([a, peak], [b, peak], [c, peak], [d, peak]);
  }
  function addLamp(tris, x, z) {
    addBox(tris, null, x - 0.04, 0, z - 0.04, x + 0.04, 2.15, z + 0.04, "#3a4148");
    addBox(tris, null, x - 0.04, 2.05, z - 0.04, x + 0.28, 2.12, z + 0.04, "#3a4148");
    addOcta(tris, [x + 0.28, 1.98, z], 0.09, "#fff1c2", "emit");
  }
  function addFenceRun(tris, edges, x0, x1, z) {
    var i, x, n = 5;
    for (i = 0; i < n; i++) {
      x = x0 + (x1 - x0) * (i / (n - 1));
      addBox(tris, edges, x - 0.04, 0, z - 0.04, x + 0.04, 0.85, z + 0.04, "#8a6a42");
    }
    addBox(tris, edges, x0, 0.38, z - 0.03, x1, 0.46, z + 0.03, "#a68455");
    addBox(tris, edges, x0, 0.62, z - 0.03, x1, 0.7, z + 0.03, "#a68455");
  }
  function addBow(tris, x, y, z, s) {
    var gold = "#f4d56a";
    var top = [x, y + s * 0.62, z];
    var L = [x - s * 0.62, y + s * 0.12, z];
    var R = [x + s * 0.62, y + s * 0.12, z];
    var F = [x, y + s * 0.18, z + s * 0.32];
    var B = [x, y + s * 0.18, z - s * 0.32];
    addTri(tris, top, L, F, gold, [0, 1, 1], "spec");
    addTri(tris, top, F, R, gold, [0, 1, 1], "spec");
    addTri(tris, top, R, B, gold, [0, 1, -1], "spec");
    addTri(tris, top, B, L, gold, [0, 1, -1], "spec");
  }
  function addGift(tris, edges, x, y, z, s, hex) {
    addBox(tris, edges, x - s, y, z - s, x + s, y + s * 1.15, z + s, hex);
    addBox(tris, null, x - s * 0.14, y, z - s * 1.04, x + s * 0.14, y + s * 1.15, z + s * 1.04, "#f2d56a");
    addBox(tris, null, x - s * 1.04, y + s * 0.42, z - s * 0.14, x + s * 1.04, y + s * 0.68, z + s * 0.14, "#f2d56a");
    addBow(tris, x, y + s * 1.15, z, s);
  }
  function tileHash(i, j) {
    var n = (i * 374761393 + j * 668265263) | 0;
    n = Math.imul(n ^ (n >> 13), 1274126177);
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }
  function scene() {
    var tris = [], edges = [], main = [];
    addTree(tris, main, [0, 0, 0], 1, 0.2, 2);
    addTree(tris, edges, [2.7, 0, -8.6], 0.52, 1.1, 1);
    addTree(tris, edges, [-4.5, 0, -10.2], 0.48, 2.4, 1);
    addTree(tris, edges, [-1.9, 0, -16.2], 0.4, 0.7, 0);
    addTree(tris, edges, [4.5, 0, -17.5], 0.36, 1.8, 0);
    addTree(tris, edges, [3.6, 0, -6.6], 0.3, 0.4, 0);
    addHouse(tris, edges, -3.2, -14);
    addFenceRun(tris, edges, -5.5, -1.3, -12.3);
    addLamp(tris, -5.3, -11.2);
    addGift(tris, edges, 0.58, 1.48, 4.22, 0.12, "#c4473a");
    addGift(tris, edges, 0.95, 1.36, 3.9, 0.1, "#2a6fbf");
    addBox(tris, edges, 0.54, 1.15, 4.18, 0.62, 1.48, 4.26, "#6b4423");
    addBox(tris, edges, 0.91, 1.08, 3.86, 0.99, 1.36, 3.94, "#6b4423");
    var gx, gz, x0, z0, span = 1.6;
    for (gx = -5; gx < 5; gx++) for (gz = -11; gz < 4; gz++) {
      x0 = gx * span; z0 = gz * span;
      var h = tileHash(gx + 9, gz + 20);
      var tile = h > 0.84 ? "#e8eef3" : h > 0.62 ? "#8eb56e" : h > 0.35 ? "#6f9456" : "#5c8448";
      var cx = x0 + span / 2, cz = z0 + span / 2;
      var dist = Math.hypot(cx, cz);
      var t = dist < 2.3 ? dist / 2.3 : 1;
      var smooth = t * t * (3 - 2 * t);
      var shadow = 0.55 + 0.45 * smooth;
      var rgb = hexToRgb(tile);
      var col = "rgb(" + (rgb[0] * shadow | 0) + "," + (rgb[1] * shadow | 0) + "," + (rgb[2] * shadow | 0) + ")";
      var y = 0, pad = 0.03;
      var xA = x0 - pad, xB = x0 + span + pad, zA = z0 - pad, zB = z0 + span + pad;
      tris.push({ p: [[xA, y, zA], [xB, y, zA], [xB, y, zB]], color: col });
      tris.push({ p: [[xA, y, zA], [xB, y, zB], [xA, y, zB]], color: col });
    }
    return { tris: tris, edges: main.concat(edges), main: main, tip: TIP };
  }

  DEFAULTS.focus = 0;
  var core = {
    IMG_W: IMG_W, IMG_H: IMG_H, DEFAULTS: DEFAULTS, TIP: TIP, ANCHORS: ANCHORS, R0: R0,
    rotation: rotation, elementary: elementary, rotX: rotX, rotY: rotY, rotZ: rotZ,
    Kof: Kof, project: project, scene: scene, mul: mul, mulV: mulV,
    circleOfConfusion: circleOfConfusion, cocPixels: cocPixels,
    afov: afov, asymAngle: asymAngle, fxFromLens: fxFromLens, fyFromLens: fyFromLens, focalMm: focalMm
  };
  DEFAULTS.focus = project(ANCHORS.tree, DEFAULTS).Xc[2];
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.CameraCore = core;
  if (typeof document === "undefined") return;

  var $ = function (id) { return document.getElementById(id); };
  var world = $("view-world"), photo = $("view-photo"), rig = $("rig-view");
  var wctx = world.getContext("2d"), pctx = photo.getContext("2d"), rctx = rig.getContext("2d");
  var built = scene();
  var scratch = document.createElement("canvas");
  scratch.width = IMG_W; scratch.height = IMG_H;
  var sctx = scratch.getContext("2d");
  var view = { az: 0.58, el: 0.34, dist: 9.2, tgt: [0.1, 1.55, 4.15] };
  var dragging = false, lastX = 0, lastY = 0;
  var RIG_P = [0.9, 0.5, 0.45];

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
  function showOutputs(p) {
    var wh = imageSize(p);
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
    var ah = afov(p.Sw, p.f) * 180 / Math.PI;
    var av = afov(p.Sh, p.f) * 180 / Math.PI;
    var eq = p.f * 36 / p.Sw;
    var centred = Math.abs(p.u0 - wh.W / 2) < 0.5 && Math.abs(p.v0 - wh.H / 2) < 0.5 && Math.abs(p.s) < 0.5;
    var line = "AFOV_h = " + ah.toFixed(1) + "° · AFOV_v = " + av.toFixed(1) + "° · full-frame equivalent " + eq.toFixed(1) + " mm";
    if (!centred) {
      var horiz = asymAngle(p.u0, wh.W, p.fx) * 180 / Math.PI;
      var vert = asymAngle(p.v0, wh.H, p.fy) * 180 / Math.PI;
      line += ". About the optical axis: " + horiz.toFixed(1) + "° by " + vert.toFixed(1) + "° (skew ignored).";
    }
    $("fov-read").textContent = line;
    var tree = project(ANCHORS.tree, p);
    var near = project(ANCHORS.near, p);
    var far = project(ANCHORS.far, p);
    function blurAt(hit) { return hit.inFront ? cocPixels(p, hit.Xc[2]) : 0; }
    $("coc-read").textContent = "Circle of confusion: tree " + blurAt(tree).toFixed(1) + " px · near gifts " + blurAt(near).toFixed(1) + " px · house " + blurAt(far).toFixed(1) + " px";
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
  function mathVec(name, v) {
    return "<math><mrow><mi>" + name + "</mi><mo>=</mo><mo>[</mo>" + v.map(function (c) {
      return "<mn>" + fmt(c) + "</mn>";
    }).join("<mo>,</mo>") + "<mo>]</mo></mrow></math>";
  }
  function putSlider(id, value) {
    var el = $(id);
    if (value > Number(el.max)) el.max = String(Math.ceil(value));
    if (value < Number(el.min)) el.min = String(Math.floor(value));
    el.value = value;
  }
  function syncLens(which) {
    var f = Number($("fmm").value);
    var Sw = Number($("sw").value), Sh = Number($("sh").value);
    var W = Number($("imgw").value), H = Number($("imgh").value);
    if (which === "fx") {
      f = Number($("fx").value) * Sw / W;
      if (f < 14) f = 14;
      if (f > 200) f = 200;
      $("fmm").value = f;
    } else if (which === "fy") {
      f = Number($("fy").value) * Sh / H;
      if (f < 14) f = 14;
      if (f > 200) f = 200;
      $("fmm").value = f;
    }
    if (which === "imgw") {
      $("u0").max = W;
      $("u0").value = W / 2;
    }
    if (which === "imgh") {
      $("v0").max = H;
      $("v0").value = H / 2;
    }
    if (which !== "sh" && which !== "imgh") putSlider("fx", fxFromLens(f, Sw, W));
    if (which !== "sw" && which !== "imgw") putSlider("fy", fyFromLens(f, Sh, H));
  }

  function look(P, eye, tgt, w, h, focalScale) {
    var f = sub(tgt, eye);
    f = norm(f);
    var right = norm([-f[2], 0, f[0]]);
    var up = cross(right, f);
    var rel = sub(P, eye);
    var x = rel[0] * right[0] + rel[1] * right[1] + rel[2] * right[2];
    var y = rel[0] * up[0] + rel[1] * up[1] + rel[2] * up[2];
    var z = rel[0] * f[0] + rel[1] * f[1] + rel[2] * f[2];
    if (z < 0.05) return null;
    var focal = h * (focalScale || 1.15);
    return { u: w / 2 + (x / z) * focal, v: h / 2 - (y / z) * focal, z: z };
  }
  function orbit(P, w, h) {
    var az = view.az, el = view.el, dist = view.dist, tgt = view.tgt;
    var eye = [
      tgt[0] + dist * Math.cos(el) * Math.sin(az),
      tgt[1] + dist * Math.sin(el),
      tgt[2] + dist * Math.cos(el) * Math.cos(az)
    ];
    return look(P, eye, tgt, w, h, 1.15);
  }
  function cameraCenter(p) {
    var ang = angles(p);
    var R = rotation(ang.beta, ang.alpha, ang.gamma);
    var Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
    var c = mulV(Rt, [p.tx, p.ty, p.tz]);
    return [-c[0], -c[1], -c[2]];
  }
  function basis(p) {
    var ang = angles(p);
    var R = rotation(ang.beta, ang.alpha, ang.gamma);
    var Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
    return {
      C: cameraCenter(p), R: R,
      right: mulV(Rt, [1, 0, 0]),
      down: mulV(Rt, [0, 1, 0]),
      fwd: mulV(Rt, [0, 0, 1])
    };
  }
  function frustumCorners(p, depth) {
    var B = basis(p);
    var wh = imageSize(p);
    return [[0, 0], [wh.W, 0], [wh.W, wh.H], [0, wh.H]].map(function (px) {
      var Y = (px[1] - p.v0) * depth / p.fy;
      var X = ((px[0] - p.u0) - p.s * (px[1] - p.v0) / p.fy) * depth / p.fx;
      return add(B.C, add(scl(B.right, X), add(scl(B.down, Y), scl(B.fwd, depth))));
    });
  }
  function cssColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function paintFaces(ctx, faces, projectPt) {
    var drawn = faces.map(function (t) {
      var c = [(t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3, (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3];
      var q = projectPt(c);
      return { t: t, z: q ? q.z : -1 };
    }).filter(function (f) { return f.z > 0; }).sort(function (a, b) { return b.z - a.z; });
    drawn.forEach(function (f) {
      var pts = f.t.p.map(projectPt);
      if (pts.some(function (q) { return !q; })) return;
      ctx.fillStyle = f.t.color;
      ctx.beginPath();
      ctx.moveTo(pts[0].u, pts[0].v);
      ctx.lineTo(pts[1].u, pts[1].v);
      ctx.lineTo(pts[2].u, pts[2].v);
      ctx.closePath();
      ctx.fill();
    });
  }
  function cameraFaces(p) {
    var B = basis(p);
    var faces = [];
    function at(x, y, z) {
      return add(B.C, add(scl(B.right, x), add(scl(B.down, y), scl(B.fwd, z))));
    }
    function quad(a, b, c, d, hex) { addQuad(faces, a, b, c, d, hex); }
    var z0 = -0.62, z1 = -0.16, x = 0.34, y = 0.24;
    quad(at(-x, -y, z1), at(x, -y, z1), at(x, y, z1), at(-x, y, z1), "#3a414a");
    quad(at(x, -y, z0), at(-x, -y, z0), at(-x, y, z0), at(x, y, z0), "#2c3138");
    quad(at(-x, -y, z0), at(-x, -y, z1), at(-x, y, z1), at(-x, y, z0), "#323840");
    quad(at(x, -y, z1), at(x, -y, z0), at(x, y, z0), at(x, y, z1), "#323840");
    quad(at(-x, -y, z0), at(x, -y, z0), at(x, -y, z1), at(-x, -y, z1), "#4a515a");
    quad(at(-x, y, z1), at(x, y, z1), at(x, y, z0), at(-x, y, z0), "#262b31");
    var n = 8, i, a0, a1, r = 0.13;
    for (i = 0; i < n; i++) {
      a0 = (i / n) * Math.PI * 2; a1 = ((i + 1) / n) * Math.PI * 2;
      var p0 = at(Math.cos(a0) * r, Math.sin(a0) * r, -0.02);
      var p1 = at(Math.cos(a1) * r, Math.sin(a1) * r, -0.02);
      var q0 = at(Math.cos(a0) * r, Math.sin(a0) * r, 0.28);
      var q1 = at(Math.cos(a1) * r, Math.sin(a1) * r, 0.28);
      addQuad(faces, p0, p1, q1, q0, "#1c1f24");
      addTri(faces, at(0, 0, 0.28), q1, q0, "#8aa4bc", B.fwd);
    }
    return faces;
  }

  function drawWorld(p) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = world.getBoundingClientRect();
    var w = Math.max(320, rect.width), h = Math.max(280, rect.height);
    world.width = Math.round(w * dpr); world.height = Math.round(h * dpr);
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var sky = wctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#b7d4ef");
    sky.addColorStop(0.55, "#e7f0e6");
    sky.addColorStop(1, "#d5e2c8");
    wctx.fillStyle = sky;
    wctx.fillRect(0, 0, w, h);
    function line(a, b, color, width) {
      var A = orbit(a, w, h), B = orbit(b, w, h);
      if (!A || !B) return;
      wctx.strokeStyle = color; wctx.lineWidth = width;
      wctx.beginPath(); wctx.moveTo(A.u, A.v); wctx.lineTo(B.u, B.v); wctx.stroke();
    }
    var faces = built.tris.concat(cameraFaces(p));
    var sensorZ = (p.f / 1000) * SENSOR_SCALE;
    var plane = frustumCorners(p, sensorZ);
    faces.push({ p: [plane[0], plane[1], plane[2]], color: "rgba(190, 214, 232, 0.45)" });
    faces.push({ p: [plane[0], plane[2], plane[3]], color: "rgba(190, 214, 232, 0.45)" });
    paintFaces(wctx, faces, function (q) { return orbit(q, w, h); });
    line([0, 0, 0], [0.8, 0, 0], "#c4473a", 2);
    line([0, 0, 0], [0, 0.8, 0], "#2f8f4e", 2);
    line([0, 0, 0], [0, 0, 0.8], "#2a5fbf", 2);
    var B = basis(p);
    plane.forEach(function (q) { line(B.C, q, "#3d6fbf", 1.15); });
    for (var i = 0; i < 4; i++) line(plane[i], plane[(i + 1) % 4], "#3d6fbf", 1.6);
    function arc(axis, a0, a1) {
      var steps = 14, k, ang, dir, prev = null;
      for (k = 0; k <= steps; k++) {
        ang = a0 + (a1 - a0) * (k / steps);
        if (axis === "h") dir = add(scl(B.fwd, Math.cos(ang)), scl(B.right, Math.sin(ang)));
        else dir = add(scl(B.fwd, Math.cos(ang)), scl(B.down, Math.sin(ang)));
        var pt = add(B.C, scl(norm(dir), 1.05));
        if (prev) line(prev, pt, "#c47a20", axis === "h" ? 2 : 1.3);
        prev = pt;
      }
    }
    var whArc = imageSize(p);
    arc("h", -Math.atan(p.u0 / p.fx), Math.atan((whArc.W - p.u0) / p.fx));
    arc("v", -Math.atan(p.v0 / p.fy), Math.atan((whArc.H - p.v0) / p.fy));
    function onPlane(P) {
      var hit = project(P, p);
      if (!hit.inFront) return null;
      var Y = (hit.v - p.v0) * sensorZ / p.fy;
      var X = ((hit.u - p.u0) - p.s * (hit.v - p.v0) / p.fy) * sensorZ / p.fx;
      return add(B.C, add(scl(B.right, X), add(scl(B.down, Y), scl(B.fwd, sensorZ))));
    }
    built.main.forEach(function (e) {
      var A = onPlane(e[0]), Bp = onPlane(e[1]);
      if (A && Bp) line(A, Bp, "#1f7a45", 1);
    });
    [TIP, ANCHORS.near, ANCHORS.far].forEach(function (q) { line(q, B.C, "rgba(61, 111, 191, 0.35)", 1); });
  }

  function drawPhoto(p) {
    var wh = imageSize(p);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (wh.W * wh.H * dpr * dpr > 1920 * 1280) dpr = 1;
    if (scratch.width !== wh.W || scratch.height !== wh.H) {
      scratch.width = wh.W;
      scratch.height = wh.H;
    }
    photo.width = Math.round(wh.W * dpr); photo.height = Math.round(wh.H * dpr);
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var sky = pctx.createLinearGradient(0, 0, 0, wh.H);
    sky.addColorStop(0, "#8ebbe0");
    sky.addColorStop(0.45, "#d7e8f6");
    sky.addColorStop(1, "#d5e4c4");
    pctx.fillStyle = sky;
    pctx.fillRect(0, 0, wh.W, wh.H);
    var bins = [];
    for (var bi = 0; bi < 10; bi++) bins.push([]);
    built.tris.forEach(function (t) {
      var c = [(t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3, (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3];
      var hit = project(c, p);
      if (!hit.inFront) return;
      var idx = Math.floor(Math.log(Math.max(hit.Xc[2], 0.35)) / 0.32);
      if (idx < 0) idx = 0;
      if (idx > 9) idx = 9;
      bins[idx].push(t);
    });
    function fillOn(ctx, t) {
      var pts = t.p.map(function (q) { return project(q, p); });
      if (pts.some(function (q) { return !q.inFront; })) return;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(pts[0].u, pts[0].v);
      ctx.lineTo(pts[1].u, pts[1].v);
      ctx.lineTo(pts[2].u, pts[2].v);
      ctx.closePath();
      ctx.fill();
    }
    for (var b = bins.length - 1; b >= 0; b--) {
      if (!bins[b].length) continue;
      var depth = 0, n = 0;
      bins[b].forEach(function (t) {
        var c = [(t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3, (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3];
        var hit = project(c, p);
        if (hit.inFront) { depth += hit.Xc[2]; n++; }
      });
      var rad = n ? cocPixels(p, depth / n) : 0;
      if (rad < 0.8) bins[b].forEach(function (t) { fillOn(pctx, t); });
      else {
        sctx.clearRect(0, 0, wh.W, wh.H);
        bins[b].forEach(function (t) { fillOn(sctx, t); });
        pctx.save();
        pctx.filter = "blur(" + Math.min(16, rad * 0.5).toFixed(2) + "px)";
        pctx.drawImage(scratch, 0, 0, wh.W, wh.H);
        pctx.restore();
      }
    }
    var samePose = ["fx", "fy", "s", "u0", "v0", "alpha", "beta", "gamma", "tx", "ty", "tz"].every(function (k) {
      return Math.abs(p[k] - DEFAULTS[k]) < 0.02;
    });
    if (!samePose) {
      pctx.strokeStyle = "rgba(70, 74, 80, 0.55)";
      pctx.lineWidth = 1;
      built.main.forEach(function (e) {
        var A = project(e[0], DEFAULTS), B = project(e[1], DEFAULTS);
        if (!A.inFront || !B.inFront) return;
        pctx.beginPath(); pctx.moveTo(A.u, A.v); pctx.lineTo(B.u, B.v); pctx.stroke();
      });
    }
    pctx.strokeStyle = "#8b9098";
    pctx.lineWidth = 2;
    pctx.strokeRect(1, 1, wh.W - 2, wh.H - 2);
    pctx.strokeStyle = "#c4473a";
    pctx.lineWidth = 1.25;
    pctx.beginPath();
    pctx.moveTo(p.u0 - 8, p.v0); pctx.lineTo(p.u0 + 8, p.v0);
    pctx.moveTo(p.u0, p.v0 - 8); pctx.lineTo(p.u0, p.v0 + 8);
    pctx.stroke();
    pctx.fillStyle = "#5c6570";
    pctx.font = "14px system-ui, sans-serif";
    pctx.fillText("u", wh.W - 18, wh.H - 10);
    pctx.fillText("v", 8, 16);
  }

  function updateReadout(p) {
    var ang = angles(p);
    var R = rotation(ang.beta, ang.alpha, ang.gamma);
    $("mat-k").innerHTML = mathMatrix(Kof(p));
    $("mat-r").innerHTML = mathMatrix(R);
    $("mat-t").innerHTML = mathVec("t", [p.tx, p.ty, p.tz]);
    var pr = project(TIP, p);
    var rows = "";
    rows += "<p><span>Tree tip in the world</span> " + mathVec("X", [TIP[0], TIP[1], TIP[2], 1]) + "</p>";
    rows += "<p><span>In the camera</span> " + mathVec("Xcam", [pr.Xc[0], pr.Xc[1], pr.Xc[2]]) + "</p>";
    if (pr.inFront) {
      rows += "<p><span>After K, before dividing by w</span> " + mathVec("wuv", pr.inhom) + "</p>";
      rows += "<p><span>Pixel</span> " + mathVec("uv", [pr.u, pr.v]) + "</p>";
    } else rows += "<p>The tip is behind the camera (z<sub>cam</sub> ≤ 0), so it is not drawn.</p>";
    $("worked").innerHTML = rows;
  }

  function drawRig() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = rig.getBoundingClientRect();
    var w = Math.max(280, rect.width || 360), h = Math.max(220, rect.height || 240);
    rig.width = Math.round(w * dpr); rig.height = Math.round(h * dpr);
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rctx.fillStyle = "#f4f7fb";
    rctx.fillRect(0, 0, w, h);
    var alpha = Number($("rig-alpha").value), beta = Number($("rig-beta").value), gamma = Number($("rig-gamma").value);
    var t = [Number($("rig-tx").value), Number($("rig-ty").value), Number($("rig-tz").value)];
    var R = elementary(alpha, beta, gamma);
    var Rp = mulV(R, RIG_P);
    var pp = add(Rp, t);
    var eye = [2.5, 1.65, 2.7], tgt = [0.2, 0.35, 0.15];
    function P(q) { return look(q, eye, tgt, w, h, 1.05); }
    function line(a, b, color, width) {
      var A = P(a), B = P(b);
      if (!A || !B) return;
      rctx.strokeStyle = color; rctx.lineWidth = width;
      rctx.beginPath(); rctx.moveTo(A.u, A.v); rctx.lineTo(B.u, B.v); rctx.stroke();
    }
    function arrow(a, b, color) {
      line(a, b, color, 2);
      var A = P(a), B = P(b);
      if (!A || !B) return;
      var dx = B.u - A.u, dy = B.v - A.v, L = Math.hypot(dx, dy) || 1;
      dx /= L; dy /= L;
      rctx.fillStyle = color;
      rctx.beginPath();
      rctx.moveTo(B.u, B.v);
      rctx.lineTo(B.u - 11 * dx + 5 * -dy, B.v - 11 * dy + 5 * dx);
      rctx.lineTo(B.u - 11 * dx - 5 * -dy, B.v - 11 * dy - 5 * dx);
      rctx.closePath();
      rctx.fill();
    }
    function axes(origin, M, len, width) {
      line(origin, add(origin, scl([M[0][0], M[1][0], M[2][0]], len)), "#c4473a", width);
      line(origin, add(origin, scl([M[0][1], M[1][1], M[2][1]], len)), "#2f8f4e", width);
      line(origin, add(origin, scl([M[0][2], M[1][2], M[2][2]], len)), "#2a5fbf", width);
    }
    var I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    axes([0, 0, 0], I, 1.15, 2);
    axes(t, R, 0.85, 1.6);
    line([0, 0, 0], RIG_P, "#8b9098", 1.25);
    line([0, 0, 0], Rp, "#245c38", 1.5);
    arrow(Rp, pp, "#c47a20");
    if (Math.hypot(t[0], t[1], t[2]) > 0.02) arrow([0, 0, 0], t, "#c47a20");
    function dot(q, color, label) {
      var s = P(q);
      if (!s) return;
      rctx.fillStyle = color;
      rctx.beginPath(); rctx.arc(s.u, s.v, 4.5, 0, Math.PI * 2); rctx.fill();
      rctx.fillStyle = "#1c2430";
      rctx.font = "13px system-ui, sans-serif";
      rctx.fillText(label, s.u + 6, s.v - 6);
    }
    dot(RIG_P, "#5c6570", "p");
    dot(Rp, "#245c38", "Rp");
    dot(pp, "#8a4b12", "p′");
    function arcAngle(axis, deg, radius) {
      if (Math.abs(deg) < 0.4) return;
      var steps = 18, k, ang, pt, prev = null, mid = null;
      for (k = 0; k <= steps; k++) {
        ang = rad(deg) * (k / steps);
        if (axis === "x") pt = [0, Math.cos(ang) * radius, Math.sin(ang) * radius];
        else if (axis === "y") pt = [Math.sin(ang) * radius, 0, Math.cos(ang) * radius];
        else pt = [Math.cos(ang) * radius, Math.sin(ang) * radius, 0];
        if (prev) line(prev, pt, "#1c2430", 1.25);
        if (k === Math.floor(steps * 0.65)) mid = pt;
        prev = pt;
      }
      var s = mid && P(mid);
      if (s) {
        rctx.fillStyle = "#1c2430";
        rctx.font = "12px system-ui, sans-serif";
        rctx.fillText(deg.toFixed(0) + "°", s.u + 4, s.v - 4);
      }
    }
    arcAngle("x", alpha, 0.48);
    arcAngle("y", beta, 0.62);
    arcAngle("z", gamma, 0.76);
    $("rig-alpha-out").textContent = alpha.toFixed(0) + "°";
    $("rig-beta-out").textContent = beta.toFixed(0) + "°";
    $("rig-gamma-out").textContent = gamma.toFixed(0) + "°";
    $("rig-tx-out").textContent = t[0].toFixed(2) + " m";
    $("rig-ty-out").textContent = t[1].toFixed(2) + " m";
    $("rig-tz-out").textContent = t[2].toFixed(2) + " m";
    $("rig-text").textContent = "rotated alpha=" + alpha.toFixed(0) + "° about x, beta=" + beta.toFixed(0) + "° about y, gamma=" + gamma.toFixed(0) + "° about z";
    $("rig-math").innerHTML = "<p>R = R<sub>z</sub>(γ) R<sub>x</sub>(α) R<sub>y</sub>(β)</p>" + mathMatrix(R) +
      "<p>p′ = R p + t</p>" + mathVec("p'", pp);
  }

  function draw() {
    var p = params();
    showOutputs(p);
    drawWorld(p);
    drawPhoto(p);
    updateReadout(p);
  }

  ["fmm", "sw", "sh", "imgw", "imgh", "fx", "fy", "s", "u0", "v0", "alpha", "beta", "gamma", "tx", "ty", "tz", "fn", "focus"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      if (id === "fmm") syncLens("f");
      else if (id === "sw") syncLens("sw");
      else if (id === "sh") syncLens("sh");
      else if (id === "imgw") syncLens("imgw");
      else if (id === "imgh") syncLens("imgh");
      else if (id === "fx") syncLens("fx");
      else if (id === "fy") syncLens("fy");
      draw();
    });
  });
  $("btn-reset").addEventListener("click", function () { writeControls(DEFAULTS); draw(); });
  ["rig-alpha", "rig-beta", "rig-gamma", "rig-tx", "rig-ty", "rig-tz"].forEach(function (id) {
    $(id).addEventListener("input", drawRig);
  });
  var how = document.querySelector(".how-it-works");
  if (how) how.addEventListener("toggle", function () { if (how.open) drawRig(); });
  world.addEventListener("pointerdown", function (e) {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    try { world.setPointerCapture(e.pointerId); } catch (err) {}
  });
  world.addEventListener("pointerup", function () { dragging = false; });
  world.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    view.az += (e.clientX - lastX) * 0.008;
    view.el = Math.max(-0.2, Math.min(1.15, view.el + (e.clientY - lastY) * 0.006));
    lastX = e.clientX; lastY = e.clientY;
    drawWorld(params());
  });
  var themeBtn = document.querySelector(".theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", function () { setTimeout(draw, 0); });
  window.addEventListener("resize", function () { draw(); if (how && how.open) drawRig(); });
  writeControls(DEFAULTS);
  draw();
  drawRig();
})(typeof window !== "undefined" ? window : globalThis);

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
  var DEFAULTS = {
    f: 50, Sw: 36, Sh: 24, W: IMG_W, H: IMG_H,
    fx: 50 * IMG_W / 36, fy: 50 * IMG_H / 24,
    s: 0, u0: IMG_W / 2, v0: IMG_H / 2,
    alpha: 5, beta: 0, gamma: 0,
    tx: 0, ty: 0.65, tz: 10.6,
    fn: 1.8, focus: 6.3
  };
  var TIP = [0, 2.55, 0];
  var ANCHORS = {
    tree: [0, 1.2, 0],
    near: [0.9, 0.5, 7.0],
    far: [-8, 3, -32]
  };
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

  function apply4(m, v) {
    var x = v[0], y = v[1], z = v[2], w = v.length > 3 ? v[3] : 1;
    return [
      m[0] * x + m[1] * y + m[2] * z + m[3] * w,
      m[4] * x + m[5] * y + m[6] * z + m[7] * w,
      m[8] * x + m[9] * y + m[10] * z + m[11] * w,
      m[12] * x + m[13] * y + m[14] * z + m[15] * w
    ];
  }
  function viewProjection(p, near, far) {
    var ang = angles(p);
    var R = rotation(ang.beta, ang.alpha, ang.gamma);
    var size = imageSize(p);
    var W = size.W, H = size.H;
    var fx = p.fx, fy = p.fy, s = p.s || 0, u0 = p.u0, v0 = p.v0;
    var n = near == null ? 0.08 : near;
    var f = far == null ? 80 : far;
    var view = [
      R[0][0], R[0][1], R[0][2], p.tx,
      -R[1][0], -R[1][1], -R[1][2], -p.ty,
      -R[2][0], -R[2][1], -R[2][2], -p.tz,
      0, 0, 0, 1
    ];
    var proj = [
      2 * fx / W, -2 * s / W, 1 - 2 * u0 / W, 0,
      0, 2 * fy / H, 2 * v0 / H - 1, 0,
      0, 0, -(f + n) / (f - n), -2 * f * n / (f - n),
      0, 0, -1, 0
    ];
    return { view: view, proj: proj, near: n, far: f };
  }
  function ndcOf(X, p, near, far) {
    var mats = viewProjection(p, near, far);
    var eye = apply4(mats.view, [X[0], X[1], X[2], 1]);
    var clip = apply4(mats.proj, eye);
    return { x: clip[0] / clip[3], y: clip[1] / clip[3], z: clip[2] / clip[3], eye: eye };
  }

  DEFAULTS.focus = 0;
  var core = {
    IMG_W: IMG_W, IMG_H: IMG_H, DEFAULTS: DEFAULTS, TIP: TIP, ANCHORS: ANCHORS, R0: R0,
    rotation: rotation, elementary: elementary, rotX: rotX, rotY: rotY, rotZ: rotZ,
    Kof: Kof, project: project, mul: mul, mulV: mulV, angles: angles, imageSize: imageSize,
    circleOfConfusion: circleOfConfusion, cocPixels: cocPixels,
    afov: afov, asymAngle: asymAngle, fxFromLens: fxFromLens, fyFromLens: fyFromLens, focalMm: focalMm,
    viewProjection: viewProjection, ndcOf: ndcOf
  };
  DEFAULTS.focus = project(ANCHORS.tree, DEFAULTS).Xc[2];
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.CameraCore = core;
})(typeof window !== "undefined" ? window : globalThis);

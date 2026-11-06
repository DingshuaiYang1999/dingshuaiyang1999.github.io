#!/usr/bin/env python3
"""Mathematically generated surface drawings for the edge-detection revision notes.

Continuous functions at sigma = 1 (not the demo's discrete filters):

    G(x, y) = 1 / (2 π σ²) · exp(−(x² + y²) / (2 σ²))
    ∂G/∂x = −(x / σ²) · G
    ∂G/∂y = −(y / σ²) · G
    ∇²G = (x² + y² − 2 σ²) / σ⁴ · G

The script checks the signs, writes four SVG files, and can splice them into
demos/edge-detection.html between SVG markers. Fills are computed from the
formulas. Nothing is drawn by hand or by an image model.
"""
from __future__ import annotations

import math
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "demos" / "surfaces"
HTML = ROOT / "demos" / "edge-detection.html"
SIGMA = 1.0
LIM = 3.0
N = 40  # intervals on each axis


def gauss(x: float, y: float, sigma: float = SIGMA) -> float:
    s2 = sigma * sigma
    return math.exp(-(x * x + y * y) / (2 * s2)) / (2 * math.pi * s2)


def dgdx(x: float, y: float, sigma: float = SIGMA) -> float:
    return -(x / (sigma * sigma)) * gauss(x, y, sigma)


def dgdy(x: float, y: float, sigma: float = SIGMA) -> float:
    return -(y / (sigma * sigma)) * gauss(x, y, sigma)


def log_g(x: float, y: float, sigma: float = SIGMA) -> float:
    s2 = sigma * sigma
    return (x * x + y * y - 2 * s2) / (s2 * s2) * gauss(x, y, sigma)


FUNCS = {
    "gaussian": gauss,
    "dgdx": dgdx,
    "dgdy": dgdy,
    "log": log_g,
}


def check() -> None:
    g0 = gauss(0, 0)
    assert g0 > 0
    assert gauss(2, 0) > 0
    assert g0 > gauss(2, 0) > gauss(3, 0)
    assert dgdx(-1, 0) > 0 > dgdx(1, 0)
    assert abs(dgdx(0, 0)) < 1e-15
    assert dgdy(0, -1) > 0 > dgdy(0, 1)
    assert abs(dgdy(0, 0)) < 1e-15
    assert log_g(0, 0) < 0
    assert log_g(2, 0) > 0
    assert abs(log_g(math.sqrt(2), 0)) < 1e-12
    # Shared identity: ∇²G = ∂²G/∂x² + ∂²G/∂y², checked by a finite difference.
    h = 1e-4
    def d2(fn_shift) -> float:
        return fn_shift
    cxx = (gauss(h, 0) - 2 * g0 + gauss(-h, 0)) / (h * h)
    cyy = (gauss(0, h) - 2 * g0 + gauss(0, -h)) / (h * h)
    assert abs((cxx + cyy) - log_g(0, 0)) < 1e-4
    # Positive ring is lower than the central bowl. The drawing must not hide that.
    assert abs(log_g(0, 0)) > log_g(2, 0) * 4


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> str:
    t = 0 if t < 0 else 1 if t > 1 else t
    return "#{:02x}{:02x}{:02x}".format(
        round(a[0] + (b[0] - a[0]) * t),
        round(a[1] + (b[1] - a[1]) * t),
        round(a[2] + (b[2] - a[2]) * t),
    )


# Mid-light colours that stay distinct on white and on #111418.
NEG = (61, 111, 191)     # blue
POS = (196, 114, 42)     # amber
ZERO = (168, 174, 182)   # neutral
GAUSS_LO = (214, 224, 234)
GAUSS_HI = (20, 78, 140)


def color_for(kind: str, z: float, zmin: float, zmax: float) -> str:
    if kind == "gaussian":
        t = 0 if zmax == zmin else (z - zmin) / (zmax - zmin)
        return mix(GAUSS_LO, GAUSS_HI, t)
    # Signed surfaces: hue follows the sign, strength follows |z| / peak of that sign
    # so the low positive ring of the LoG remains visible.
    if z < 0:
        peak = abs(zmin) if zmin < 0 else 1e-12
        return mix(ZERO, NEG, min(1, abs(z) / peak))
    if z > 0:
        peak = zmax if zmax > 0 else 1e-12
        return mix(ZERO, POS, min(1, z / peak))
    return mix(ZERO, ZERO, 0)


def project(x: float, y: float, z: float) -> tuple[float, float, float]:
    """Oblique view. Mathematical y increases toward the back-left of the drawing.
    Screen y increases downward. Depth key is independent of height."""
    ang = math.radians(34)
    sxy = 34.0
    sz = 210.0  # shared response scale: LoG centre (~−0.32) sets the vertical room
    sx = (x * math.cos(ang) - y * math.sin(ang)) * sxy
    depth = x * math.sin(ang) + y * math.cos(ang)
    sy = depth * sxy * 0.50 - z * sz
    return sx, sy, depth


def surface(kind: str) -> str:
    fn = FUNCS[kind]
    xs = [LIM * (2 * i / N - 1) for i in range(N + 1)]
    ys = xs
    pts = []
    vals = []
    for y in ys:
        row_p = []
        row_v = []
        for x in xs:
            z = fn(x, y)
            row_v.append(z)
            row_p.append(project(x, y, z))
        pts.append(row_p)
        vals.append(row_v)
    flat = [z for row in vals for z in row]
    zmin, zmax = min(flat), max(flat)
    # Two triangles per cell, far ones first, so a steep bowl does not fold into a spike.
    tris = []
    for j in range(N):
        for i in range(N):
            for tri in (
                ((j, i), (j, i + 1), (j + 1, i)),
                ((j, i + 1), (j + 1, i + 1), (j + 1, i)),
            ):
                corners = [pts[a][b] for a, b in tri]
                zs = [vals[a][b] for a, b in tri]
                depth = sum(c[2] for c in corners) / 3
                tris.append((depth, zs, corners))
    tris.sort(key=lambda q: q[0])

    def floor(x: float, y: float) -> tuple[float, float]:
        sx, sy, _ = project(x, y, 0)
        return sx, sy

    parts: list[str] = []
    centre_fill = None
    for _depth, zs, corners in tris:
        zbar = sum(zs) / 3
        fill = color_for(kind, zbar, zmin, zmax)
        # The triangle that contains the origin records the centre colour.
        if centre_fill is None and abs(sum(zs) / 3 - fn(0, 0)) < 0.02 and kind != "gaussian":
            centre_fill = fill
        d = " ".join(
            ("M" if k == 0 else "L") + f"{c[0]:.2f},{c[1]:.2f}" for k, c in enumerate(corners)
        ) + " Z"
        parts.append(f'<path d="{d}" fill="{fill}" stroke="none"/>')
    if kind == "log":
        # Centre of ∇²G is negative, so its fill must sit toward the blue, not the amber.
        neg = mix(ZERO, NEG, 1)
        assert centre_fill is not None
        assert centre_fill == neg or abs(int(centre_fill[1:3], 16) - NEG[0]) < 40

    # Zero plane outline and axes on the floor.
    frame = []
    corners_xy = [(-LIM, -LIM), (LIM, -LIM), (LIM, LIM), (-LIM, LIM)]
    line = " ".join(("M" if i == 0 else "L") + f"{floor(*p)[0]:.2f},{floor(*p)[1]:.2f}" for i, p in enumerate(corners_xy)) + " Z"
    frame.append(f'<path d="{line}" fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1"/>')
    # x axis (y = 0) and y axis (x = 0) on the floor, plus a response stem at the origin.
    def seg(a, b) -> str:
        return f'<line x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{b[0]:.2f}" y2="{b[1]:.2f}" stroke="currentColor" stroke-opacity="0.75" stroke-width="1.25"/>'

    frame.append(seg(floor(-LIM, 0), floor(LIM, 0)))
    frame.append(seg(floor(0, -LIM), floor(0, LIM)))
    ox, oy = floor(0, 0)
    top = project(0, 0, max(0.34, zmax))
    frame.append(seg((ox, oy), (top[0], top[1])))
    if kind == "log":
        # Circle x² + y² = 2 on the floor: analytic zero set of ∇²G at σ = 1.
        r = math.sqrt(2)
        circle = []
        for k in range(73):
            th = 2 * math.pi * k / 72
            circle.append(floor(r * math.cos(th), r * math.sin(th)))
        d = " ".join(("M" if i == 0 else "L") + f"{p[0]:.2f},{p[1]:.2f}" for i, p in enumerate(circle))
        frame.append(
            f'<path d="{d}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-dasharray="3 2" stroke-opacity="0.9"/>'
        )

    # Few large tick labels, pushed clear of the corners so "-3" does not collide with "y".
    labels = []
    def text(x, y, s, anchor="middle"):
        labels.append(
            f'<text x="{x:.2f}" y="{y:.2f}" text-anchor="{anchor}" fill="currentColor" font-size="16">{s}</text>'
        )
    text(floor(-LIM, -LIM)[0] - 2, floor(-LIM, -LIM)[1] + 20, "−3")
    text(floor(LIM, -LIM)[0] + 2, floor(LIM, -LIM)[1] + 20, "3")
    text(floor(LIM, -LIM)[0] + 22, floor(LIM, -LIM)[1] + 6, "x", "start")
    text(floor(-LIM, -LIM)[0] - 16, floor(-LIM, -LIM)[1] + 2, "−3", "end")
    text(floor(-LIM, LIM)[0] - 16, floor(-LIM, LIM)[1] + 4, "3", "end")
    text(floor(-LIM, LIM)[0] - 16, floor(-LIM, LIM)[1] - 16, "y", "end")
    text(top[0] + 10, top[1] - 2, "response", "start")

    all_xy = [project(x, y, fn(x, y))[:2] for y in xs for x in xs]
    all_xy += [floor(x, y) for x in (-LIM, LIM) for y in (-LIM, LIM)]
    all_xy += [(top[0], top[1])]
    minx = min(p[0] for p in all_xy) - 36
    maxx = max(p[0] for p in all_xy) + 78
    miny = min(p[1] for p in all_xy) - 22
    maxy = max(p[1] for p in all_xy) + 28
    body = "\n".join(parts + frame + labels)
    aria = {
        "gaussian": "Surface of the Gaussian at sigma 1. A single positive bell. Mathematical y increases toward the back of the drawing.",
        "dgdx": "Surface of dG dx at sigma 1. Positive lobe on the negative x side and negative lobe on the positive x side.",
        "dgdy": "Surface of dG dy at sigma 1. Positive lobe on the negative y side and negative lobe on the positive y side.",
        "log": "Surface of the Laplacian of the Gaussian at sigma 1. Negative centre, zero on the circle of radius square root of 2, and a lower positive ring.",
    }[kind]
    return (
        f'<svg class="kernel-plot" viewBox="{minx:.1f} {miny:.1f} {maxx - minx:.1f} {maxy - miny:.1f}" '
        f'role="img" aria-label="{aria}" data-sigma="1" data-kind="{kind}">\n{body}\n</svg>'
    )


def write_svgs() -> dict[str, str]:
    check()
    OUT.mkdir(parents=True, exist_ok=True)
    out = {}
    for kind in FUNCS:
        svg = surface(kind)
        (OUT / f"{kind}.svg").write_text(svg + "\n", encoding="utf-8")
        out[kind] = svg
        print("wrote", OUT / f"{kind}.svg")
    return out


def splice(svgs: dict[str, str]) -> None:
    text = HTML.read_text(encoding="utf-8")
    for kind, svg in svgs.items():
        pat = re.compile(
            rf"<!--SVG:{kind}-->.*?<!--/SVG:{kind}-->",
            re.S,
        )
        repl = f"<!--SVG:{kind}-->\n{svg}\n<!--/SVG:{kind}-->"
        new, n = pat.subn(repl, text, count=1)
        if n != 1:
            raise SystemExit(f"marker SVG:{kind} missing or duplicated ({n})")
        text = new
    HTML.write_text(text, encoding="utf-8")
    print("spliced SVGs into", HTML)


if __name__ == "__main__":
    svgs = write_svgs()
    if HTML.exists() and "<!--SVG:gaussian-->" in HTML.read_text(encoding="utf-8"):
        splice(svgs)
    print("PLOT_CHECKS_OK")

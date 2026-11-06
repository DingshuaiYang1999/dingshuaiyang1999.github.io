#!/usr/bin/env python3
"""Sigma = 1 wireframe surfaces for the edge-detection notes.

    G = 1/(2 π σ²) exp(-(x²+y²)/(2 σ²))
    ∂G/∂x = -(x/σ²) G          positive when x < 0
    ∂G/∂y = -(y/σ²) G          positive when y < 0
    ∇²G = (x²+y²-2σ²)/σ⁴ G     negative at the origin, zero at r = σ√2

Each drawing uses its own vertical range so the shape is visible. Tick labels
are the true function values. Matplotlib mplot3d wireframes; nothing is drawn
by hand. Algorithms in demos/edge-detection.js are not used here.
"""
from __future__ import annotations

import io
import math
import pathlib
import re

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import MaxNLocator

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "demos" / "surfaces"
HTML = ROOT / "demos" / "edge-detection.html"
SIGMA = 1.0
LIM = 3.2


def fields(n: int = 49):
    x = np.linspace(-LIM, LIM, n)
    y = np.linspace(-LIM, LIM, n)
    X, Y = np.meshgrid(x, y)
    r2 = X * X + Y * Y
    s2 = SIGMA * SIGMA
    g = np.exp(-r2 / (2 * s2)) / (2 * math.pi * s2)
    dgdx = -(X / s2) * g
    dgdy = -(Y / s2) * g
    logg = (r2 - 2 * s2) / (s2 * s2) * g
    return X, Y, {"gaussian": g, "dgdx": dgdx, "dgdy": dgdy, "log": logg}


def check(Z):
    g, dx, dy, logg = Z["gaussian"], Z["dgdx"], Z["dgdy"], Z["log"]
    # Samples nearest the requested points on the grid.
    def at(arr, x, y):
        i = int(np.argmin(np.abs(np.linspace(-LIM, LIM, arr.shape[1]) - x)))
        j = int(np.argmin(np.abs(np.linspace(-LIM, LIM, arr.shape[0]) - y)))
        return float(arr[j, i])

    assert at(g, 0, 0) > at(g, 2, 0) > 0
    assert at(dx, -1, 0) > 0 > at(dx, 1, 0)
    assert abs(at(dx, 0, 0)) < 1e-9
    assert at(dy, 0, -1) > 0 > at(dy, 0, 1)
    assert at(logg, 0, 0) < 0
    assert at(logg, 2, 0) > 0
    s2 = SIGMA * SIGMA
    exact = (2 - 2 * s2) / (s2 * s2) * math.exp(-1) / (2 * math.pi * s2)
    assert abs(exact) < 1e-12
    assert abs(at(logg, 0, 0)) > at(logg, 2, 0) * 4


TITLES = {
    "gaussian": "Gaussian, σ = 1",
    "dgdx": "∂G/∂x, σ = 1",
    "dgdy": "∂G/∂y, σ = 1",
    "log": "∇²G, σ = 1",
}
ZLABEL = {
    "gaussian": "G",
    "dgdx": "∂G/∂x",
    "dgdy": "∂G/∂y",
    "log": "∇²G",
}
ARIA = {
    "gaussian": "Wireframe of the Gaussian at sigma 1. A positive bell. Vertical range is this surface only; tick numbers are the true values. Mathematical y increases along the y axis.",
    "dgdx": "Wireframe of dG dx at sigma 1. Positive lobe on the negative x side and negative lobe on the positive x side. Vertical range is this surface only.",
    "dgdy": "Wireframe of dG dy at sigma 1. Positive lobe on the negative y side and negative lobe on the positive y side. Vertical range is this surface only.",
    "log": "Wireframe of the Laplacian of the Gaussian at sigma 1. Negative bowl at the centre and a lower positive ring outside radius square root of 2. Vertical range is this surface only.",
}


def style_ax(ax, Z, kind):
    ax.plot_wireframe(
        *ax._wf_xyz,
        rstride=2,
        cstride=2,
        color="#1a1a1a",
        linewidth=0.65,
    )
    zmin, zmax = float(np.min(Z)), float(np.max(Z))
    pad = 0.08 * (zmax - zmin if zmax > zmin else 1)
    ax.set_zlim(zmin - pad, zmax + pad)
    ax.set_xlabel("x", labelpad=2)
    ax.set_ylabel("y", labelpad=2)
    ax.set_zlabel(ZLABEL[kind], labelpad=2)
    ax.set_title(TITLES[kind], pad=2)
    ax.view_init(elev=24, azim=-58)
    # Own vertical extent: the z box is tall enough to show the shape.
    ax.set_box_aspect((1.15, 1.15, 0.95))
    for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
        axis.pane.fill = False
        axis.pane.set_edgecolor("#d0d0d0")
        axis.set_major_locator(MaxNLocator(nbins=4))
    ax.grid(False)
    ax.tick_params(labelsize=11, pad=0)


def draw(ax, X, Y, Z, kind):
    ax._wf_xyz = (X, Y, Z)
    style_ax(ax, Z, kind)


def figure_of(X, Y, Z, kind):
    fig = plt.figure(figsize=(4.7, 3.9), facecolor="white")
    ax = fig.add_subplot(111, projection="3d")
    ax.set_facecolor("white")
    draw(ax, X, Y, Z, kind)
    fig.subplots_adjust(left=0.02, right=0.96, bottom=0.02, top=0.90)
    return fig


def svg_for(X, Y, Z, kind) -> str:
    fig = figure_of(X, Y, Z, kind)
    buf = io.StringIO()
    fig.savefig(buf, format="svg")
    plt.close(fig)
    raw = buf.getvalue()
    raw = raw[raw.index("<svg") :]
    raw = raw.replace(
        "<svg ",
        (
            f'<svg class="kernel-plot" role="img" aria-label="{ARIA[kind]}" '
            f'data-sigma="1" data-kind="{kind}" '
        ),
        1,
    )
    return raw


def preview(X, Y, Zs, path: pathlib.Path):
    fig = plt.figure(figsize=(9.2, 7.6), facecolor="white")
    order = ["gaussian", "dgdx", "dgdy", "log"]
    for i, kind in enumerate(order, start=1):
        ax = fig.add_subplot(2, 2, i, projection="3d")
        ax.set_facecolor("white")
        draw(ax, X, Y, Zs[kind], kind)
    fig.suptitle(
        "σ = 1. Each vertical axis is that surface only; tick numbers are the true values.",
        fontsize=12,
    )
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    fig.savefig(path, dpi=130)
    plt.close(fig)
    print("preview", path)


def splice(svgs: dict[str, str]):
    text = HTML.read_text(encoding="utf-8")
    for kind, svg in svgs.items():
        pat = re.compile(rf"<!--SVG:{kind}-->.*?<!--/SVG:{kind}-->", re.S)
        repl = f"<!--SVG:{kind}-->\n{svg}\n<!--/SVG:{kind}-->"
        text, n = pat.subn(repl, text, count=1)
        if n != 1:
            raise SystemExit(f"marker SVG:{kind} count {n}")
    HTML.write_text(text, encoding="utf-8")
    print("spliced", HTML)


def main():
    plt.rcParams.update({
        "font.size": 12,
        "axes.titlesize": 13,
        "axes.labelsize": 12,
        "svg.fonttype": "none",
        "text.color": "#16181b",
        "axes.labelcolor": "#16181b",
        "xtick.color": "#16181b",
        "ytick.color": "#16181b",
    })
    X, Y, Zs = fields()
    check(Zs)
    OUT.mkdir(parents=True, exist_ok=True)
    svgs = {}
    for kind, Z in Zs.items():
        svg = svg_for(X, Y, Z, kind)
        (OUT / f"{kind}.svg").write_text(svg + "\n", encoding="utf-8")
        svgs[kind] = svg
        print(kind, "z", float(np.min(Z)), float(np.max(Z)))
    splice(svgs)
    preview(X, Y, Zs, pathlib.Path("/opt/cursor/artifacts/preview_kernel_wireframes.png"))
    print("PLOT_CHECKS_OK")


if __name__ == "__main__":
    main()

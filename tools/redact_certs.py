#!/usr/bin/env python3
"""Redact scanned certificates for the website (image-only output, no metadata).

Usage:  python3 tools/redact_certs.py ORIG_DIR [--pdf-dir DIR] [--preview-dir DIR]

ORIG_DIR holds the originals (never commit them): dsh.pdf, telc.pdf, goethe.pdf.
Every page is normalised to A4 width at 200 dpi (1654 px). Private regions listed in
CERTS are painted solid with the local paper colour, a diagonal watermark is added,
and the pages are written as web images to assets/certs/<name>-<n>.webp.
Verification: OCR of every output page must not contain any PROBES; the output
files must contain no text layer, metadata, or probe bytes. Exit 1 on failure.
To add a certificate: render its page with --preview-dir, read box coordinates
(x0, y0, x1, y1 in 1654-px-wide page pixels) and add an entry below.
"""
import argparse, io, os, re, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageStat

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "certs"
W = 1654          # A4 width at 200 dpi
WEB_W = 1240      # web image width (150 dpi)
WATERMARK = "Dingshuai Yang · for viewing only"

CERTS = {
    "dsh": {  # DSH-Zeugnis, FH Aachen
        1: [(240, 546, 790, 586),      # born on / in
            (1350, 1145, 1600, 1285),  # contact phone / fax block
            (1350, 1296, 1600, 1406),  # Aktenzeichen (reference no.)
            (240, 1585, 1300, 1808),
            (545, 1538, 1300, 1592)],  # stamp fragment beside the date  # signatures + seal
        "ink1": [(500, 1540, 1320, 1830)],  # blue ink/stamp bleeding over printed text
        2: [],
    },
    "telc": {  # telc Deutsch C1 Hochschule
        1: [(500, 958, 690, 996),      # date of birth
            (990, 958, 1180, 996),     # place of birth
            (1030, 1806, 1160, 1844),  # participant number
            (1180, 1712, 1445, 2080),  # QR verification code + hint
            (470, 1865, 1170, 2108),
            (515, 2134, 570, 2190)],  # pen tail below the label  # signatures + seal
        "ink1": [(380, 2040, 1200, 2200)],  # pen strokes crossing the signature labels
    },
    "goethe": {  # Goethe-Zertifikat B2
        1: [(280, 886, 570, 946),      # date of birth (+label)
            (785, 886, 1010, 946),     # place of birth (+label)
            (792, 1640, 1060, 1702),   # certificate number
            (90, 2130, 130, 2295),     # Mat.-Nr. (vertical)
            (280, 1712, 1100, 1810)],  # signatures
        2: [(770, 2296, 1000, 2340)],  # form serial (WKN)
    },
}
PROBES = ["1999", "08.10", "shanxi", "china", "dsh24", "31109", "vg24", "4304", "92040", "9204018",
          "14543", "1523", "ab2a", "0001716029", "1716029", "317699", "1231726", "results.telc", "scannen"]


def pages(pdf):
    with tempfile.TemporaryDirectory() as t:
        subprocess.run(["pdfimages", "-png", str(pdf), f"{t}/p"], check=True)
        for f in sorted(Path(t).glob("p-*.png")):
            im = Image.open(f).convert("RGB")
            yield im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)


def paper(im, box):
    x0, y0, x1, y1 = box
    ring = [im.crop(b) for b in [(x0, max(0, y0 - 8), x1, y0), (x0, y1, x1, min(im.height, y1 + 8))]]
    vals = [ImageStat.Stat(r).median for r in ring if r.width and r.height]
    return tuple(max(v[i] for v in vals) for i in range(3)) if vals else (255, 255, 255)


def font(size):
    for f in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def watermark(im):
    layer = Image.new("RGBA", (im.width * 2, im.height * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer); f = font(68)
    tw = d.textlength(WATERMARK, font=f)
    for row, y in enumerate(range(0, layer.height, 520)):
        for x in range(-(row % 2) * int(tw * .6), layer.width, int(tw + 260)):
            d.text((x, y), WATERMARK, font=f, fill=(90, 90, 110, 34))
    layer = layer.rotate(35, resample=Image.BICUBIC)
    l, t = (layer.width - im.width) // 2, (layer.height - im.height) // 2
    out = im.convert("RGBA"); out.alpha_composite(layer.crop((l, t, l + im.width, t + im.height)))
    return out.convert("RGB")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("orig_dir")
    ap.add_argument("--pdf-dir"); ap.add_argument("--preview-dir"); a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True); ok = True; outputs = []
    for name, spec in CERTS.items():
        imgs = []
        for n, im in enumerate(pages(Path(a.orig_dir) / f"{name}.pdf"), 1):
            d = ImageDraw.Draw(im)
            for box in spec.get(n, []):
                d.rectangle(box, fill=paper(im, box))
            for box in spec.get(f"ink{n}", []):  # repaint blue pen/stamp pixels only; black print stays
                reg = im.crop(box); px = reg.load(); bg = paper(im, box)
                for y in range(reg.height):
                    for x in range(reg.width):
                        r, g, b = px[x, y]
                        if b - r > 10 and b > 60:
                            px[x, y] = bg
                im.paste(reg, box[:2])
            im = watermark(im); imgs.append(im)
            web = OUT / f"{name}-{n}.webp"
            im.resize((WEB_W, round(im.height * WEB_W / W)), Image.LANCZOS).save(web, "WEBP", quality=80, method=6)
            outputs.append(web)
            if a.preview_dir:
                Path(a.preview_dir).mkdir(parents=True, exist_ok=True)
                im.save(Path(a.preview_dir) / f"{name}-page-{n}-200dpi.png")
            txt = subprocess.run(["tesseract", "-", "-", "--psm", "3"], input=_png(im), capture_output=True).stdout.decode(errors="ignore").lower()
            hits = [p for p in PROBES if p in txt]
            print(f"{name} p{n}: {len(spec.get(n, []))} box(es), OCR {len(txt.split())} words, private hits: {hits or 'none'}")
            ok &= not hits
        if a.pdf_dir:
            pdf = Path(a.pdf_dir) / f"{name}-redacted.pdf"
            imgs[0].save(pdf, save_all=True, append_images=imgs[1:], resolution=200)
            outputs.append(pdf)
            t = subprocess.run(["pdftotext", str(pdf), "-"], capture_output=True, text=True).stdout.strip()
            ni = len(subprocess.run(["pdfimages", "-list", str(pdf)], capture_output=True, text=True).stdout.splitlines()) - 2
            print(f"{name}: pdftotext {len(t)} chars, {ni} image(s) for {len(imgs)} page(s)"); ok &= not t and ni == len(imgs)
    for f in outputs:
        data = f.read_bytes(); raw = data.lower()
        bad = [p for p in PROBES if p.encode() in raw] + [m.decode() for m in (b"XMP ", b"EXIF", b"ICCP") if m in data[:64]]
        if bad: print(f"FAIL raw bytes {f.name}: {bad}"); ok = False
    print("OK" if ok else "CHECK FAILED"); sys.exit(0 if ok else 1)


def _png(im):
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()


if __name__ == "__main__":
    main()

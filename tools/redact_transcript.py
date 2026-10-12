#!/usr/bin/env python3
"""Make a web-safe copy of an FAU campo Transcript of Records (English or German export).

Usage:
    python3 tools/redact_transcript.py ~/Downloads/campo.pdf
        -> assets/transcript/Dingshuai_Yang_Transcript_of_Records.pdf (same URL as before)
    python3 tools/redact_transcript.py in.pdf --out other.pdf --preview-dir shots/

How it works (needs poppler-utils; tesseract optional for the OCR check):
  1. Reads word positions with `pdftotext -bbox`.
  2. Finds private fields: the postal address block under the name in the envelope window,
     the student registration number (any 7-9 digit number next to "registration number" or
     "Mtknr", plus those labels), and the whole "born on <date> in <place>" run.
  3. Renders each page at 200 dpi, paints those areas white, and rebuilds the PDF from the
     images only, so no text layer, metadata or hidden copy of the private data remains.
  4. Verifies: no text layer, only page images, none of the found private strings in the raw
     file, and (if tesseract is installed) none of them in OCR of the output.
Kept: name, programme, courses, grades, ECTS, exam dates, issue date, the exam office address.
Always look at the previews before publishing.
"""
import argparse
import html
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "assets" / "transcript" / "Dingshuai_Yang_Transcript_of_Records.pdf"
DPI = 200
PAD = 1.2  # pt around each redacted word


def words_by_page(pdf):
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "b.html"
        subprocess.run(["pdftotext", "-bbox", str(pdf), str(out)], check=True)
        h = out.read_text(encoding="utf-8")
    pages = []
    for pg in h.split("<page ")[1:]:
        ws = [dict(x0=float(a), y0=float(b), x1=float(c), y1=float(d), t=html.unescape(t))
              for a, b, c, d, t in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', pg)]
        pages.append(ws)
    return pages


def lines_of(ws):
    lines = []
    for w in sorted(ws, key=lambda w: (round(w["y0"]), w["x0"])):
        for ln in lines:
            if abs(ln[0]["y0"] - w["y0"]) < 1.5:
                ln.append(w)
                break
        else:
            lines.append([w])
    return [sorted(ln, key=lambda w: w["x0"]) for ln in lines]


def runs(line, gap=25):
    """Split a line into runs of words separated by large horizontal gaps (columns)."""
    out, cur = [], [line[0]]
    for w in line[1:]:
        if w["x0"] - cur[-1]["x1"] > gap:
            out.append(cur); cur = [w]
        else:
            cur.append(w)
    out.append(cur)
    return out


def find_private(ws):
    """Return (boxes, secrets): word boxes to remove and the private strings they held."""
    boxes, secrets = [], set()
    lines = lines_of(ws)
    text = lambda r: " ".join(w["t"] for w in r)
    for i, ln in enumerate(lines):
        for r in runs(ln):
            t = text(r)
            # "born on 8 October 1999 in Shanxi, ..." / "geboren am ..."
            m = next((k for k, w in enumerate(r) if w["t"].lower() in ("born", "geboren")), None)
            if m is not None:
                boxes += r[m:]; secrets.add(" ".join(w["t"] for w in r[m:]))
            # registration number labels + value ("Student registration number: 23582607", "Mtknr.: 23582607")
            if re.search(r"registration number|matrikel|mtknr", t, re.I):
                k = next(k for k, w in enumerate(r) if re.search(r"^(student|registration|matrikel|mtknr)", w["t"], re.I))
                boxes += r[k:]
            for w in r:
                if re.fullmatch(r"\d{7,9}", w["t"]):
                    boxes.append(w); secrets.add(w["t"])
    # Postal address block: left-column lines directly under the "Mr./Ms." + name lines in the
    # envelope window (top of page), up to the first wide gap.
    for i, ln in enumerate(lines):
        if ln[0]["t"] in ("Mr.", "Ms.", "Mx.", "Herr", "Frau") and ln[0]["x0"] < 120 and ln[0]["y0"] < 220 and len(ln) <= 3:
            left = [l for l in lines[i + 1:] if l[0]["x0"] < 120 and l[0]["y0"] < 240]
            if not left:
                continue
            name_line, prev = left[0], left[0]
            for l in left[1:]:
                # same column as the name, consecutive lines only
                if l[0]["y0"] - prev[0]["y0"] > 22 or abs(l[0]["x0"] - name_line[0]["x0"]) > 3:
                    break
                r = runs(l)[0]
                boxes += r; secrets.add(text(r)); prev = l
            break
    return boxes, secrets


def render(pdf, tmp):
    subprocess.run(["pdftoppm", "-r", str(DPI), "-png", str(pdf), str(Path(tmp) / "p")], check=True)
    return sorted(Path(tmp).glob("p-*.png"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--preview-dir", help="write 200 dpi PNG previews of each output page here")
    a = ap.parse_args()

    pages = words_by_page(a.pdf)
    s = DPI / 72
    all_secrets, kept_words = set(), set()
    with tempfile.TemporaryDirectory() as tmp:
        imgs = []
        for ws, png in zip(pages, render(a.pdf, tmp)):
            boxes, secrets = find_private(ws)
            all_secrets |= secrets
            ids = {id(b) for b in boxes}
            kept_words |= {w["t"].strip(",.:;()").lower() for w in ws if id(w) not in ids}
            im = Image.open(png).convert("RGB")
            d = ImageDraw.Draw(im)
            for b in boxes:
                d.rectangle([(b["x0"] - PAD) * s, (b["y0"] + 2.4) * s, (b["x1"] + PAD) * s, (b["y1"] - 0.6) * s], fill="white")
            imgs.append(im)
        out = Path(a.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        imgs[0].save(out, save_all=True, append_images=imgs[1:], resolution=DPI,
                     title="Transcript of Records - Dingshuai Yang", author="Dingshuai Yang")
        if a.preview_dir:
            pdir = Path(a.preview_dir); pdir.mkdir(parents=True, exist_ok=True)
            for i, im in enumerate(imgs, 1):
                im.save(pdir / f"redacted-page-{i}-200dpi.png")

    # ---- verification ----
    # probe only tokens that do not also appear in the kept text (e.g. "Erlangen" in the office address)
    probes = {p.strip(",.") for sec in all_secrets for p in re.findall(r"[A-Za-zÄÖÜäöüß0-9.\-]{4,}", sec)}
    probes = {p for p in probes if p.lower() not in kept_words and p.lower() not in ("born", "geboren")}
    print("probing for:", ", ".join(sorted(p[:3] + "…" for p in probes)))
    ok = True
    txt = subprocess.run(["pdftotext", str(out), "-"], capture_output=True, text=True).stdout
    if txt.strip():
        ok = False; print("FAIL: output has a text layer")
    lst = subprocess.run(["pdfimages", "-list", str(out)], capture_output=True, text=True).stdout.splitlines()[2:]
    print(f"pages: {len(imgs)}, images in PDF: {len(lst)} (expected one per page)")
    raw = out.read_bytes()
    hits = [p for p in probes if p.encode() in raw or p.encode("utf-16-be") in raw]
    if hits:
        ok = False; print("FAIL: private strings in raw file:", len(hits))
    if shutil.which("tesseract"):
        with tempfile.TemporaryDirectory() as tmp:
            ocr = ""
            for png in render(out, tmp):
                ocr += subprocess.run(["tesseract", str(png), "-"], capture_output=True, text=True).stdout
        bad = [p for p in probes if p.lower() in ocr.lower()]
        if bad:
            ok = False; print("FAIL: OCR still reads", len(bad), "private token(s)")
        print(f"OCR: {len(ocr.split())} words read, private tokens found: {len(bad)}")
    else:
        print("OCR check skipped (install tesseract-ocr)")
    print(f"redacted {len(all_secrets)} distinct private value(s); checked {len(probes)} tokens")
    print("OK" if ok else "CHECK FAILED", "->", out)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

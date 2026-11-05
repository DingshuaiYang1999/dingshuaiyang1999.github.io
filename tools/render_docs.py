#!/usr/bin/env python3
"""Render the CV and the Transcript of Records PDFs to WebP page images for the in-page viewers.

The home page opens these images in a dialog instead of a PDF iframe, because embedded PDFs
fail on iPhone Safari/Chrome. Re-run this after replacing a PDF (needs poppler-utils):

    python3 tools/render_docs.py                                  # CV only (PDF is in the repo)
    python3 tools/render_docs.py --transcript ~/Transcript_redacted.pdf   # also the transcript

Writes assets/cv/cv-<n>.webp and assets/transcript/transcript-<n>.webp, and prints the page
count and pixel size of each image so the <img width/height> attributes in index.html can be checked.
The transcript PDF is deliberately NOT stored in the repo (view-only on the site): pass its path with
--transcript, e.g. the output of tools/redact_transcript.py. Without that option the existing
transcript images are left untouched. The PDFs themselves are not modified.
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--transcript", type=Path, help="redacted transcript PDF (kept outside the repo)")
    args = ap.parse_args()
    jobs = [(ROOT / "assets/cv/Dingshuai_Yang_CV.pdf", "assets/cv/cv", 170)]
    if args.transcript:
        jobs.append((args.transcript.expanduser().resolve(), "assets/transcript/transcript", 200))
    else:
        print("transcript: no --transcript given, existing images kept")
    for pdf, prefix, dpi in jobs:
        for old in (ROOT / prefix).parent.glob(Path(prefix).name + "-*.webp"):
            old.unlink()
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["pdftoppm", "-r", str(dpi), "-png", str(pdf), f"{tmp}/p"], check=True)
            for n, png in enumerate(sorted(Path(tmp).glob("p-*.png")), 1):
                out = ROOT / f"{prefix}-{n}.webp"
                im = Image.open(png).convert("RGB")
                im.save(out, "WEBP", quality=82, method=6)
                print(f"{out.relative_to(ROOT)}  {im.width}x{im.height}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

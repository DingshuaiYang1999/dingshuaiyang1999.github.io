#!/usr/bin/env python3
"""Generate a narration MP3 (+ M4A) for a blog post.

Usage:
    pip install edge-tts markdown numpy     # once; ffmpeg must be installed
    python3 tools/make_audio.py blog/posts/<slug>.md
    python3 tools/build_blog.py             # picks up assets/audio/<slug>.mp3 automatically

Reads the post title, subtitle and body exactly as published (headings + paragraphs),
skipping figures, captions, alt text, HTML and emoji, with short pauses between paragraphs
and headings. English is read by a natural female neural voice (Microsoft Edge "Read aloud"
voices via the edge-tts package: online, free, no account). Terms listed in GERMAN_TERMS are
synthesised separately with a German voice and spliced in place (loudness-matched, short
crossfades), so only those words are pronounced in German. The service does not accept
custom SSML, so <lang> tags cannot be used.

Options: --voice / --de-voice to change voices, --only N to render just the first N segments,
--out to write somewhere else (e.g. samples).
"""
import argparse
import asyncio
import html
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from build_blog import parse  # noqa: E402

EN_VOICE = "en-US-AvaMultilingualNeural"
DE_VOICE = "de-DE-SeraphinaMultilingualNeural"
DE_PITCH = "+12Hz"   # lift the German voice slightly to sit closer to the English voice
SR = 24000
# German terms read with the German voice. Value = text sent to the German voice.
GERMAN_TERMS = {
    "Friedrich-Alexander-Universität Erlangen-Nürnberg": "Friedrich-Alexander-Universität Erlangen-Nürnberg",
    "Goethe-Zertifikat": "Goethe-Zertifikat",
    "Goethe-Institut": "Goethe-Institut",
    "Deutsche Bahn's": "Deutsche Bahns",
    "Deutsche Bahn": "Deutsche Bahn",
    "Dortmund": "Dortmund",
    "ICE": "I C E",            # spelled with German letter names (ih, tseh, eh)
}
EMOJI = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\uFE0F\u200D\u20E3]")
PAUSE = {"title": 0.9, "h": 0.8, "before_h": 0.5, "p": 0.55}
GAP = 0.06        # silence kept around a spliced German term (s)
XFADE = 0.012     # crossfade at each splice (s)


def clean(text):
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    return re.sub(r"\s+", " ", EMOJI.sub("", text)).strip()


def segments(post_path):
    meta = parse(Path(post_path))
    body = re.sub(r"<figure.*?</figure>", "", meta["body"], flags=re.S)
    segs = [("title", clean(meta["title"]))]
    if meta.get("subtitle"):
        segs.append(("title", clean(meta["subtitle"])))
    for tag, inner in re.findall(r"<(h[1-6]|p|li)[^>]*>(.*?)</\1>", body, flags=re.S):
        t = clean(inner)
        if t:
            segs.append(("h" if tag.startswith("h") else "p", t))
    return meta, segs


TERM_RE = re.compile(r"(?<![\w-])(" + "|".join(re.escape(t) for t in sorted(GERMAN_TERMS, key=len, reverse=True)) + r")(?![\w-])")


def split_terms(text):
    """[(lang, text)] with German terms separated from the surrounding English."""
    out, pos = [], 0
    for m in TERM_RE.finditer(text):
        if m.start() > pos:
            out.append(("en", text[pos:m.start()]))
        out.append(("de", GERMAN_TERMS[m.group(1)]))
        pos = m.end()
    if pos < len(text):
        out.append(("en", text[pos:]))
    return [(l, t.strip()) for l, t in out if t.strip(" ,.")] or [("en", text)]


async def tts(text, voice, path, pitch="+0Hz"):
    import edge_tts
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, voice, pitch=pitch).save(str(path))
            return
        except Exception:
            if attempt == 3:
                raise
            await asyncio.sleep(2 + attempt * 2)


def decode(path):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def trim(x, keep=GAP, thr=0.008):
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx):
        return x[:0]
    k = int(keep * SR)
    return x[max(0, idx[0] - k): idx[-1] + k]


def rms(x):
    v = x[np.abs(x) > 0.01]
    return float(np.sqrt((v ** 2).mean())) if len(v) else 0.0


def join(parts):
    n = int(XFADE * SR)
    out = parts[0]
    for p in parts[1:]:
        if len(out) > n and len(p) > n:
            fade = np.linspace(0, 1, n, dtype=np.float32)
            out = np.concatenate([out[:-n], out[-n:] * (1 - fade) + p[:n] * fade, p[n:]])
        else:
            out = np.concatenate([out, p])
    return out


async def render(segs, en_voice, de_voice, tmp):
    pcm, k = [], 0
    for i, (kind, text) in enumerate(segs):
        pieces = split_terms(text)
        clips = []
        for lang, t in pieces:
            k += 1
            f = Path(tmp) / f"{k:04d}.mp3"
            await tts(t, en_voice if lang == "en" else de_voice, f, "+0Hz" if lang == "en" else DE_PITCH)
            clips.append((lang, decode(f)))
        if len(clips) == 1:
            audio = trim(clips[0][1], keep=0.05)
        else:
            en_level = np.mean([rms(c) for l, c in clips if l == "en"] or [rms(clips[0][1])])
            fixed = []
            for lang, c in clips:
                c = trim(c)
                if lang == "de" and rms(c) > 0:
                    c = c * min(2.0, en_level / rms(c))   # loudness-match the German term
                fixed.append(c)
            audio = join(fixed)
        if kind == "h" and i:
            pcm.append(np.zeros(int(SR * PAUSE["before_h"]), np.float32))
        pcm += [audio, np.zeros(int(SR * PAUSE[kind]), np.float32)]
        print(f"  {i + 1}/{len(segs)}", end="\r", flush=True)
    return np.concatenate(pcm)


def encode(audio, base, meta, voices):
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "a.wav"
        pcm16 = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm16.tobytes())
        tags = ["-metadata", f"title={meta['title']}", "-metadata", f"artist={meta.get('author', 'Dingshuai Yang')}",
                "-metadata", f"comment=Narration: computer-generated voice ({voices})"]
        af = ["-af", "loudnorm=I=-18:TP=-1.5:LRA=11"]
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), *af, "-ac", "1", "-ar", "44100",
                        "-c:a", "libmp3lame", "-b:a", "80k", *tags, f"{base}.mp3"], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), *af, "-ac", "1", "-ar", "44100",
                        "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", *tags, f"{base}.m4a"], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("post")
    ap.add_argument("--voice", default=EN_VOICE)
    ap.add_argument("--de-voice", default=DE_VOICE)
    ap.add_argument("--only", type=int, help="render only the first N segments (for samples)")
    ap.add_argument("--select", help="comma-separated segment indices to render (for samples)")
    ap.add_argument("--out", help="output path without extension (default assets/audio/<slug>)")
    ap.add_argument("--text-out", help="also write the narrated text here (for checking)")
    a = ap.parse_args()

    meta, segs = segments(a.post)
    if a.select:
        segs = [segs[int(i)] for i in a.select.split(",")]
    elif a.only:
        segs = segs[: a.only]
    out = Path(a.out) if a.out else ROOT / "assets" / "audio" / meta["slug"]
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        audio = asyncio.run(render(segs, a.voice, a.de_voice, tmp))
    encode(audio, out, meta, f"{a.voice}; German terms: {a.de_voice}")
    if a.text_out:
        Path(a.text_out).write_text("\n".join(t for _, t in segs), encoding="utf-8")
    secs = len(audio) / SR
    print(f"wrote {out}.mp3 and .m4a — {int(secs // 60)}:{int(secs % 60):02d}, {len(segs)} segments")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate a narration MP3 (+ M4A) for a blog post with a local Piper neural voice.

Usage:
    pip install piper-tts            # once; ffmpeg must be installed
    python3 tools/make_audio.py blog/posts/2024-05-11-beginning-my-german-life.md
    python3 tools/build_blog.py      # picks up assets/audio/<slug>.mp3 automatically

Reads the post title, subtitle and body (headings + paragraphs, exactly as published),
skips figures, captions, alt text, HTML and emoji, and inserts short pauses between
paragraphs and headings. Voice: Piper en_GB-cori-high (trained on public-domain LibriVox
recordings), downloaded once into ~/.local/share/piper/. Override with --voice/--voice-dir.
Output: assets/audio/<slug>.mp3 (80 kbps mono) and assets/audio/<slug>.m4a (AAC 64 kbps).
"""
import argparse
import html
import re
import subprocess
import sys
import tempfile
import urllib.request
import wave
from pathlib import Path

import markdown
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from build_blog import parse  # noqa: E402  (same front-matter parser as the site build)

VOICE = "en_GB-cori-high"
HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/high/"
EMOJI = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\uFE0F\u200D\u20E3]")
PAUSE = {"title": 1.0, "h": 0.9, "before_h": 0.5, "p": 0.55}


def clean(text):
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    return re.sub(r"\s+", " ", EMOJI.sub("", text)).strip()


def segments(post_path):
    meta = parse(Path(post_path))
    body = re.sub(r"<figure.*?</figure>", "", meta["body"], flags=re.S)   # no captions/alt text
    segs = [("title", clean(meta["title"]))]
    if meta.get("subtitle"):
        segs.append(("title", clean(meta["subtitle"])))
    for tag, inner in re.findall(r"<(h[1-6]|p|li)[^>]*>(.*?)</\1>", body, flags=re.S):
        t = clean(inner)
        if t:
            segs.append(("h" if tag.startswith("h") else "p", t))
    return meta, segs


def load_voice(name, voice_dir):
    from piper import PiperVoice
    d = Path(voice_dir).expanduser()
    d.mkdir(parents=True, exist_ok=True)
    model = d / f"{name}.onnx"
    for f in (model, d / f"{name}.onnx.json"):
        if not f.exists():
            if name != VOICE:
                sys.exit(f"missing {f}; download it from huggingface.co/rhasspy/piper-voices")
            print("downloading", f.name)
            urllib.request.urlretrieve(HF + f.name, f)
    return PiperVoice.load(str(model))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("post")
    ap.add_argument("--voice", default=VOICE)
    ap.add_argument("--voice-dir", default="~/.local/share/piper")
    ap.add_argument("--text-out", help="also write the narrated text here (for checking)")
    a = ap.parse_args()

    meta, segs = segments(a.post)
    voice = load_voice(a.voice, a.voice_dir)
    from piper import SynthesisConfig
    cfg = SynthesisConfig(length_scale=0.97)   # natural reading pace
    rate, pcm = voice.config.sample_rate, []
    for i, (kind, text) in enumerate(segs):
        if kind == "h" and i:
            pcm.append(np.zeros(int(rate * PAUSE["before_h"]), np.int16))
        for chunk in voice.synthesize(text, syn_config=cfg):
            pcm.append(chunk.audio_int16_array)
        pcm.append(np.zeros(int(rate * PAUSE[kind]), np.int16))
    audio = np.concatenate(pcm)

    out = ROOT / "assets" / "audio"
    out.mkdir(parents=True, exist_ok=True)
    slug = meta["slug"]
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "a.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(audio.tobytes())
        tags = ["-metadata", f"title={meta['title']}", "-metadata", f"artist={meta.get('author', 'Dingshuai Yang')}",
                "-metadata", f"comment=Narration generated with Piper TTS ({a.voice})"]
        af = ["-af", "loudnorm=I=-18:TP=-1.5:LRA=11"]
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), *af, "-ac", "1", "-ar", "44100",
                        "-c:a", "libmp3lame", "-b:a", "80k", *tags, str(out / f"{slug}.mp3")], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), *af, "-ac", "1", "-ar", "44100",
                        "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", *tags, str(out / f"{slug}.m4a")], check=True)
    if a.text_out:
        Path(a.text_out).write_text("\n".join(t for _, t in segs), encoding="utf-8")
    secs = len(audio) / rate
    print(f"wrote assets/audio/{slug}.mp3 and .m4a — {int(secs // 60)}:{int(secs % 60):02d}, {len(segs)} segments")


if __name__ == "__main__":
    main()

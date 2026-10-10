// "Listen" player for blog posts: built-in Web Speech API (speechSynthesis), no third-party service.
// Reads the title, then body headings/paragraphs one chunk at a time (avoids Chrome's ~15 s cutoff),
// highlights the paragraph being read, and skips figures, captions, alt text and emoji.
(function () {
  "use strict";
  const root = document.querySelector("[data-listen]");
  if (!root) return;
  const synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance !== "function") return; // stays hidden

  const playBtn = root.querySelector(".listen-play");
  const playLabel = root.querySelector(".listen-play-label");
  const stopBtn = root.querySelector(".listen-stop");
  const rateSel = root.querySelector(".listen-rate");
  const bar = root.querySelector(".listen-progress");
  const fill = root.querySelector(".listen-progress-fill");
  const status = root.querySelector(".listen-status");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu;
  const clean = (t) => t.replace(EMOJI, "").replace(/\s+/g, " ").trim();

  // Build the reading list: [{el, parts: [text...]}]
  const title = document.querySelector(".post-header h1");
  const nodes = [title, ...document.querySelectorAll(".post-body h2, .post-body h3, .post-body p, .post-body li")]
    .filter((el) => el && !el.closest("figure, figcaption, pre, table") && !(el.tagName === "P" && el.closest("li")));
  const items = nodes
    .map((el) => ({ el, parts: split(clean(el.textContent)) }))
    .filter((it) => it.parts.length);
  if (!items.length) return;

  // Split long paragraphs into sentence groups of ~220 chars (Chrome stops long utterances).
  function split(text) {
    if (!text) return [];
    const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
    const out = [];
    let cur = "";
    sentences.forEach((s) => {
      if ((cur + s).length > 220 && cur) { out.push(cur.trim()); cur = ""; }
      cur += s;
    });
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  let voice = null;
  function pickVoice() {
    const voices = synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
    if (!voices.length) return;
    const score = (v) => {
      let s = 0;
      if (/natural|neural|premium|enhanced/i.test(v.name)) s += 8;
      if (/google/i.test(v.name)) s += 5;
      if (/samantha|daniel|serena|karen|moira|aria|jenny|guy|libby|sonia/i.test(v.name)) s += 4;
      if (/en[-_](GB|US)/i.test(v.lang)) s += 2;
      if (v.localService) s += 1;
      if (/compact|espeak/i.test(v.name)) s -= 6;
      return s;
    };
    voice = voices.sort((a, b) => score(b) - score(a))[0];
  }
  pickVoice();
  if ("onvoiceschanged" in synth) synth.addEventListener("voiceschanged", pickVoice);

  root.hidden = false;
  const total = items.reduce((n, it) => n + it.parts.length, 0);
  let idx = 0, part = 0, state = "idle", token = 0;

  function done() { let n = part; for (let i = 0; i < idx; i++) n += items[i].parts.length; return n; }
  function setProgress() {
    const pct = Math.round((done() / total) * 100);
    fill.style.width = pct + "%";
    bar.setAttribute("aria-valuenow", String(pct));
  }
  function highlight(el) {
    document.querySelectorAll(".is-reading").forEach((e) => e.classList.remove("is-reading"));
    if (!el) return;
    el.classList.add("is-reading");
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 40) {
      el.scrollIntoView({ block: "center", behavior: reduceMotion.matches ? "auto" : "smooth" });
    }
  }
  function setState(s, msg) {
    state = s;
    root.dataset.state = s;
    playBtn.setAttribute("aria-pressed", s === "playing" ? "true" : "false");
    playLabel.textContent = s === "playing" ? "Pause" : s === "paused" ? "Resume" : "Listen";
    playBtn.setAttribute("aria-label", s === "playing" ? "Pause reading" : s === "paused" ? "Resume reading" : "Listen to this post");
    stopBtn.hidden = s === "idle";
    if (msg !== undefined) status.textContent = msg;
  }

  function speakNext() {
    if (state !== "playing") return;
    if (idx >= items.length) { finish(); return; }
    const it = items[idx];
    highlight(it.el);
    setProgress();
    const u = new SpeechSynthesisUtterance(it.parts[part]);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = "en-GB"; }
    u.rate = parseFloat(rateSel.value) || 1;
    const my = ++token;
    u.onend = () => {
      if (my !== token || state !== "playing") return;
      part++;
      if (part >= it.parts.length) { part = 0; idx++; }
      speakNext();
    };
    u.onerror = (e) => {
      if (my !== token || e.error === "interrupted" || e.error === "canceled") return;
      stop("Audio playback is not available in this browser.");
    };
    synth.speak(u);
  }

  function play() {
    // Must start synchronously inside the tap/click handler (iOS Safari).
    synth.cancel();
    if (state === "idle") { idx = 0; part = 0; }
    setState("playing", state === "paused" ? "Resumed." : "Reading the post aloud.");
    speakNext();
  }
  // Pause = cancel and remember the chunk; synth.pause() is unreliable in Chrome/Android.
  function pause() { token++; synth.cancel(); setState("paused", "Paused."); }
  function stop(msg) {
    token++; synth.cancel(); idx = 0; part = 0;
    highlight(null); setProgress(); setState("idle", msg || "Stopped.");
  }
  function finish() { token++; highlight(null); idx = 0; part = 0; fill.style.width = "100%"; bar.setAttribute("aria-valuenow", "100"); setState("idle", "Finished."); }

  playBtn.addEventListener("click", () => (state === "playing" ? pause() : play()));
  stopBtn.addEventListener("click", () => stop());
  rateSel.addEventListener("change", () => {
    status.textContent = `Speed ${rateSel.value}×.`;
    if (state === "playing") { token++; synth.cancel(); speakNext(); } // restart current chunk at new rate
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state !== "idle") stop(); });
  window.addEventListener("pagehide", () => synth.cancel());
  setState("idle", "");
  setProgress();
})();

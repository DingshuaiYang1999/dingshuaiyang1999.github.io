// "Listen" player for blog posts: a small custom UI around a native <audio> element
// with a pre-generated narration file (works in every browser, incl. iPhone Safari/Chrome).
// Without JS the native audio controls are shown instead.
(function () {
  "use strict";
  document.querySelectorAll("[data-audio-player]").forEach((root) => {
    const audio = root.querySelector("audio");
    const ui = root.querySelector(".listen-ui");
    if (!audio || !ui) return;
    const play = ui.querySelector(".listen-play");
    const label = ui.querySelector(".listen-play-label");
    const seek = ui.querySelector(".listen-seek");
    const cur = ui.querySelector(".listen-cur");
    const dur = ui.querySelector(".listen-dur");
    const rate = ui.querySelector(".listen-rate");
    const status = ui.querySelector(".listen-status");

    audio.controls = false;
    ui.hidden = false;

    const fmt = (s) => {
      if (!isFinite(s) || s < 0) s = 0;
      s = Math.floor(s);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    let total = parseFloat(root.dataset.duration) || 0;
    let dragging = false;

    function render() {
      const t = audio.currentTime || 0;
      if (audio.duration && isFinite(audio.duration)) total = audio.duration;
      cur.textContent = fmt(t);
      dur.textContent = fmt(total);
      seek.max = String(Math.max(1, Math.round(total)));
      if (!dragging) seek.value = String(Math.round(t));
      seek.setAttribute("aria-valuetext", `${fmt(t)} of ${fmt(total)}`);
      seek.style.setProperty("--pct", total ? `${(t / total) * 100}%` : "0%");
    }
    function setPlaying(on) {
      root.dataset.state = on ? "playing" : audio.currentTime > 0 ? "paused" : "idle";
      play.setAttribute("aria-pressed", on ? "true" : "false");
      play.setAttribute("aria-label", on ? "Pause narration" : audio.currentTime > 0 ? "Resume narration" : "Play narration");
      label.textContent = on ? "Pause" : audio.currentTime > 0 ? "Resume" : "Listen";
    }

    play.addEventListener("click", () => {
      if (audio.paused) {
        audio.playbackRate = parseFloat(rate.value) || 1;
        const p = audio.play(); // called directly in the tap handler (iOS)
        if (p && p.catch) p.catch(() => { status.textContent = "Playback was blocked. Please tap Listen again."; });
      } else {
        audio.pause();
      }
    });
    audio.addEventListener("play", () => { setPlaying(true); status.textContent = "Playing."; });
    audio.addEventListener("pause", () => { setPlaying(false); status.textContent = "Paused."; });
    audio.addEventListener("ended", () => { audio.currentTime = 0; setPlaying(false); render(); status.textContent = "Finished."; });
    audio.addEventListener("waiting", () => { root.dataset.loading = "true"; });
    audio.addEventListener("playing", () => { delete root.dataset.loading; });
    audio.addEventListener("error", () => { delete root.dataset.loading; status.textContent = "The audio file could not be loaded."; });
    ["timeupdate", "loadedmetadata", "durationchange", "seeked"].forEach((e) => audio.addEventListener(e, render));

    seek.addEventListener("input", () => {
      dragging = true;
      const t = parseFloat(seek.value) || 0;
      cur.textContent = fmt(t);
      seek.style.setProperty("--pct", total ? `${(t / total) * 100}%` : "0%");
    });
    seek.addEventListener("change", () => {
      dragging = false;
      try { audio.currentTime = parseFloat(seek.value) || 0; } catch (e) { /* not seekable yet */ }
      render();
    });
    rate.addEventListener("change", () => {
      audio.playbackRate = parseFloat(rate.value) || 1;
      status.textContent = `Speed ${rate.value}×.`;
    });
    // Keyboard: Space/K toggle, ←/→ ±10 s when focus is inside the player.
    root.addEventListener("keydown", (e) => {
      if (e.target === rate) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (e.target === seek) return; // the range input handles arrows itself
        e.preventDefault();
        audio.currentTime = Math.max(0, Math.min(total || 0, audio.currentTime + (e.key === "ArrowRight" ? 10 : -10)));
      } else if ((e.key === "k" || e.key === "K") && e.target !== play) {
        e.preventDefault();
        play.click();
      }
    });
    setPlaying(false);
    render();
  });
})();

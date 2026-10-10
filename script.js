// Old multilingual links (?lang=xx) now all serve the English page; tidy the URL.
(function dropLegacyLangParam() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("lang")) return;
  params.delete("lang");
  const query = params.toString();
  history.replaceState(null, "", window.location.pathname + (query ? "?" + query : "") + window.location.hash);
})();

// Theme: OS preference by default, explicit choice persisted in localStorage.
// The inline <head> script applies the same logic before first paint (no flash).
const themeQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function getSavedTheme() {
  try {
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" ? saved : null;
  } catch (e) {
    return null;
  }
}

function getSystemTheme() {
  return themeQuery && themeQuery.matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    const dark = theme === "dark";
    btn.setAttribute("aria-pressed", String(dark));
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    btn.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
  });
}

document.querySelectorAll(".theme-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    // Manual override is optional: choosing the OS theme again returns to automatic mode.
    try {
      if (next === getSystemTheme()) localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch (e) {}
    applyTheme(next);
  });
});

// Follow OS changes live as long as the visitor has not made an explicit choice.
if (themeQuery) {
  const onSystemChange = () => { if (!getSavedTheme()) applyTheme(getSystemTheme()); };
  if (themeQuery.addEventListener) themeQuery.addEventListener("change", onSystemChange);
  else if (themeQuery.addListener) themeQuery.addListener(onSystemChange);
}

applyTheme(getSavedTheme() || getSystemTheme());

// Scroll-triggered fade-in reveal.
// Content must never stay hidden: only elements that start below the viewport are
// animated, they reveal as soon as any part enters (threshold 0), and everything is
// shown immediately without IntersectionObserver, with reduced motion, or on print.
(function setupReveal() {
  const targets = document.querySelectorAll(
    ".hero-copy, .profile-panel, .section .section-heading, .section .text-block, .timeline-item, .skill-row, .language-row, .now-section, .contact-section > div, .contact-right"
  );
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!("IntersectionObserver" in window) || reduced) return;

  const show = (el) => el.classList.add("is-visible");
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          show(entry.target);
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0, rootMargin: "0px 0px -24px 0px" }
  );
  targets.forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already on screen: leave as is
    el.classList.add("reveal");
    obs.observe(el);
  });
  // Jumping to an anchor (nav link / #projects) or printing reveals everything at once.
  const revealAll = () => targets.forEach(show);
  window.addEventListener("hashchange", revealAll);
  window.addEventListener("beforeprint", revealAll);
  if (window.location.hash) revealAll();
})();

// ---------- Navbar: scrolled state, mobile menu, active section ----------
(function setupNavbar() {
  const header = document.querySelector("[data-header]");
  if (!header) return;
  const toggle = header.querySelector(".nav-toggle");
  const nav = header.querySelector("#site-nav");

  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  function setOpen(open, returnFocus) {
    header.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (open) {
      const first = nav.querySelector("a");
      if (first) first.focus();
    } else if (returnFocus) {
      toggle.focus();
    }
  }

  if (toggle && nav) {
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true", false));
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false, false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && header.classList.contains("is-open")) setOpen(false, true);
    });
    document.addEventListener("click", (e) => {
      if (header.classList.contains("is-open") && !header.contains(e.target)) setOpen(false, false);
    });
    const desktop = window.matchMedia("(min-width: 861px)");
    const onBreakpoint = () => { if (desktop.matches) setOpen(false, false); };
    if (desktop.addEventListener) desktop.addEventListener("change", onBreakpoint);
  }

  // Sliding pill indicator: follows hover, rests on the active link.
  const list = header.querySelector(".nav-links");
  const indicator = document.createElement("span");
  indicator.className = "nav-indicator";
  indicator.setAttribute("aria-hidden", "true");
  if (list) list.prepend(indicator);
  const moveIndicator = (a) => {
    if (!a || !list) { indicator.style.opacity = "0"; return; }
    const lr = list.getBoundingClientRect(), r = a.getBoundingClientRect();
    indicator.style.width = r.width + "px";
    indicator.style.transform = `translate(${r.left - lr.left}px, -50%)`;
    indicator.style.opacity = "1";
  };
  const restIndicator = () => moveIndicator(header.querySelector(".nav-links a.is-active, .nav-links a[aria-current]"));
  if (list) {
    list.querySelectorAll("a").forEach((a) => {
      a.addEventListener("mouseenter", () => moveIndicator(a));
      a.addEventListener("focus", () => moveIndicator(a));
    });
    list.addEventListener("mouseleave", restIndicator);
    list.addEventListener("focusout", restIndicator);
    window.addEventListener("resize", restIndicator);
    header.querySelector(".header-inner").addEventListener("transitionend", restIndicator);
    restIndicator();
  }

  // Highlight the link of the section currently in view (homepage only).
  const links = [...header.querySelectorAll(".nav-links a[data-nav]")].filter((a) => a.hash);
  const sections = links
    .map((a) => document.getElementById(a.hash.slice(1)))
    .filter(Boolean);
  if (!sections.length || !("IntersectionObserver" in window)) return;
  const setActive = (id) => {
    links.forEach((a) => {
      const on = a.hash === "#" + id;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
    restIndicator();
  };
  const visible = new Map();
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => visible.set(en.target.id, en.isIntersecting));
      const current = sections.find((s) => visible.get(s.id));
      if (current) setActive(current.id);
      else if (window.scrollY < sections[0].offsetTop - 200) setActive("");
    },
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );
  sections.forEach((s) => obs.observe(s));
})();

// German certificate viewer: modal dialog with tabs; images load on first open.
(function () {
  const dlg = document.getElementById("cert-dialog");
  const opener = document.querySelector("[data-cert-open]");
  if (!dlg || !opener || typeof dlg.showModal !== "function") return;
  const tabs = Array.from(dlg.querySelectorAll('[role="tab"]'));
  const focusables = () => Array.from(dlg.querySelectorAll('button, [tabindex="0"]')).filter((el) => !el.closest("[hidden]") && el.offsetParent !== null);

  function select(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    dlg.querySelector(".cert-body").scrollTop = 0;
    if (focus) tab.focus();
  }

  opener.addEventListener("click", () => {
    dlg.querySelectorAll("img[data-src]").forEach((img) => { img.src = img.dataset.src; img.removeAttribute("data-src"); });
    dlg.showModal();
    document.documentElement.classList.add("cert-open");
    (tabs.find((t) => t.tabIndex === 0) || tabs[0]).focus();
  });
  dlg.addEventListener("close", () => { document.documentElement.classList.remove("cert-open"); opener.focus(); });
  dlg.querySelector("[data-cert-close]").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); // backdrop click

  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t, false));
    t.addEventListener("keydown", (e) => {
      const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (n === undefined) return;
      e.preventDefault();
      select(tabs[(n + tabs.length) % tabs.length], true);
    });
  });

  dlg.addEventListener("keydown", (e) => { // focus trap
    if (e.key !== "Tab") return;
    const f = focusables(); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Discourage saving: no context menu / drag on certificate images.
  ["contextmenu", "dragstart"].forEach((ev) => dlg.addEventListener(ev, (e) => { if (e.target.tagName === "IMG") e.preventDefault(); }));
})();

// CV / Transcript viewer: the same modal as above, filled with page images (PDF iframes fail on iPhone).
// Without JavaScript the buttons are plain links to the PDF.
(function () {
  const dlg = document.getElementById("doc-dialog");
  const openers = Array.from(document.querySelectorAll("[data-doc-open]"));
  if (!dlg || !openers.length || typeof dlg.showModal !== "function") return;
  const body = document.getElementById("doc-body");
  const panels = Array.from(dlg.querySelectorAll("[data-doc-panel]"));
  const tools = document.getElementById("doc-tools");
  const INFO = {
    cv: { title: "Curriculum Vitae", note: "One page. The PDF can be downloaded with the button below." },
    transcript: { title: "Transcript of Records", note: "View only. Personal details are redacted. Four pages." },
  };
  let lastOpener = null, scrollY = 0;

  function open(kind, opener) {
    lastOpener = opener; scrollY = window.scrollY;
    panels.forEach((p) => { p.hidden = p.dataset.docPanel !== kind; });
    panels.filter((p) => !p.hidden).forEach((p) => p.querySelectorAll("img[data-src]").forEach((img) => { img.src = img.dataset.src; img.removeAttribute("data-src"); }));
    document.getElementById("doc-title").textContent = INFO[kind].title;
    document.getElementById("doc-note").textContent = INFO[kind].note;
    tools.hidden = kind !== "cv";
    body.scrollTop = 0;
    dlg.showModal();
    document.documentElement.classList.add("cert-open");
    dlg.querySelector("[data-doc-close]").focus({ preventScroll: true });
  }

  openers.forEach((a) => a.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let "open in new tab" shortcuts through
    e.preventDefault();
    open(a.dataset.docOpen, a);
  }));
  dlg.addEventListener("close", () => {
    document.documentElement.classList.remove("cert-open");
    if (window.scrollY !== scrollY) window.scrollTo(0, scrollY); // same scroll position as before opening
    if (lastOpener) lastOpener.focus({ preventScroll: true });
  });
  dlg.querySelector("[data-doc-close]").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  dlg.addEventListener("keydown", (e) => { // focus trap: close button, download link and the scrollable page area
    if (e.key !== "Tab") return;
    const f = Array.from(dlg.querySelectorAll("button, a[href]")).filter((el) => el.offsetParent !== null);
    f.push(body);
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  ["contextmenu", "dragstart"].forEach((ev) => dlg.addEventListener(ev, (e) => { if (e.target.tagName === "IMG") e.preventDefault(); }));
})();

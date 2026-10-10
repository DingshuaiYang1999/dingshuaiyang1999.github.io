// Public view counts for blog posts via GoatCounter (cookieless, GDPR-friendly).
// SETUP: set your GoatCounter site code below (e.g. "dingshuai" for dingshuai.goatcounter.com)
// and enable "Allow adding visitor counts on your website" in GoatCounter's site settings.
// While this is the placeholder, nothing is loaded and no counts are shown.
const GOATCOUNTER_CODE = "REPLACE_ME";

(function () {
  "use strict";
  if (!GOATCOUNTER_CODE || GOATCOUNTER_CODE === "REPLACE_ME") return;
  const base = `https://${GOATCOUNTER_CODE}.goatcounter.com`;

  // Count this page view (count.js is cookieless).
  const s = document.createElement("script");
  s.async = true;
  s.src = "//gc.zgo.at/count.js";
  s.dataset.goatcounter = `${base}/count`;
  document.head.appendChild(s);

  // Show public counts wherever a post path is marked.
  document.querySelectorAll("[data-views-path]").forEach((el) => {
    const path = el.dataset.viewsPath;
    fetch(`${base}/counter/${encodeURIComponent(path)}.json`, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (!d || d.count === undefined) return;
        const n = String(d.count).trim();
        el.textContent = `${n} ${n === "1" ? "view" : "views"}`;
        el.hidden = false;
      })
      .catch(() => {}); // fail silently: no count shown
  });
})();

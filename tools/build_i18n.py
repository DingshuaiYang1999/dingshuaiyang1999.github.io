#!/usr/bin/env python3
"""Generate the static language pages (/de/, /zh/, /zh-tw/, /ja/) and sitemap.xml.

Single source of truth:
  * index.html  - the English page, used as the template
  * script.js   - the `translations` object for every language

Run from the repo root after editing either file:
    python3 tools/build_i18n.py
Requires Node.js (used only to read the translations object from script.js).
"""
import datetime, html, json, pathlib, re, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://dingshuaiyang1999.github.io"
LANGS = {  # key in script.js -> (folder, html lang, og:locale)
    "en": ("", "en", "en_US"),
    "de": ("de", "de", "de_DE"),
    "zh": ("zh", "zh-CN", "zh_CN"),
    "zhTw": ("zh-tw", "zh-TW", "zh_TW"),
    "ja": ("ja", "ja", "ja_JP"),
}
CV = {"de": "Dingshuai_Yang_Lebenslauf.pdf"}  # everything else gets the English CV


def load_translations():
    js = (ROOT / "script.js").read_text(encoding="utf-8")
    src = js[: js.index("const languageMeta")]
    out = subprocess.run(
        ["node", "-e", src + "\nprocess.stdout.write(JSON.stringify(translations));"],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def esc(text):
    return html.escape(text, quote=False)


def localize(page, lang, d):
    folder, hl, locale = LANGS[lang]
    url = f"{BASE}/{folder}/" if folder else f"{BASE}/"

    # text content of [data-i18n] elements (leaf elements only)
    def text_sub(m):
        key = m.group(3)
        return m.group(1) + (esc(d[key]) if key in d else m.group(4)) + m.group(5)
    page = re.sub(r'(<(\w+)\b[^>]*\sdata-i18n="(\w+)"[^>]*>)([^<]*)(</\2>)', text_sub, page)

    # aria-label of [data-i18n-aria-label] elements
    def aria_sub(m):
        tag, key = m.group(0), m.group(1)
        if key in d:
            tag = re.sub(r'(?<![-\w])aria-label="[^"]*"', f'aria-label="{html.escape(d[key])}"', tag)
        return tag
    page = re.sub(r'<[^>]*data-i18n-aria-label="(\w+)"[^>]*>', aria_sub, page)

    page = re.sub(r'<html lang="[^"]*" data-page-lang="\w+">', f'<html lang="{hl}" data-page-lang="{lang}">', page)
    page = re.sub(r"<title>.*?</title>", f"<title>{esc(d['documentTitle'])}</title>", page)
    page = re.sub(r'(<meta\s+name="description"\s+content=")[^"]*"', lambda m: m.group(1) + html.escape(d["metaDescription"]) + '"', page)
    page = re.sub(r'<link rel="canonical" href="[^"]*" />', f'<link rel="canonical" href="{url}" />', page)
    page = re.sub(r'<meta property="og:url" content="[^"]*" />', f'<meta property="og:url" content="{url}" />', page)
    page = re.sub(r'<meta property="og:locale" content="[^"]*" />', f'<meta property="og:locale" content="{locale}" />', page)

    # language switcher: mark current
    page = page.replace(' class="is-active" aria-current="page"', "")
    page = page.replace(f'data-lang="{lang}" hreflang', f'data-lang="{lang}" class="is-active" aria-current="page" hreflang')

    # CV per language
    if lang in CV:
        page = page.replace("assets/cv/Dingshuai_Yang_CV.pdf", f"assets/cv/{CV[lang]}")

    # relative asset/page paths one level deeper
    if folder:
        page = re.sub(
            r'\b(src|href|srcset)="(?!https?:|/|#|mailto:|data:)([^"]+)"',
            lambda m: f'{m.group(1)}="../{m.group(2)}"', page)
    return page


def write_sitemap(today=None):
    today = today or datetime.date.today().isoformat()
    urls = [(f"{BASE}/{f}/" if f else f"{BASE}/", "weekly", "1.0") for f, _, _ in LANGS.values()]
    urls += [(f"{BASE}/demos/{p.name}", "monthly", "0.6") for p in sorted((ROOT / "demos").glob("*.html"))]
    blog = ROOT / "blog"
    if (blog / "index.html").exists():
        urls.append((f"{BASE}/blog/", "weekly", "0.7"))
        urls += [(f"{BASE}/blog/{p.name}", "monthly", "0.5") for p in sorted(blog.glob("*.html")) if p.name != "index.html"]
    body = "".join(
        f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{today}</lastmod>\n    <changefreq>{c}</changefreq>\n    <priority>{p}</priority>\n  </url>\n"
        for u, c, p in urls)
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + "</urlset>\n",
        encoding="utf-8")


def main():
    t = load_translations()
    template = (ROOT / "index.html").read_text(encoding="utf-8")
    for lang, (folder, _, _) in LANGS.items():
        out = localize(template, lang, t[lang])
        target = ROOT / folder / "index.html" if folder else ROOT / "index.html"
        target.parent.mkdir(exist_ok=True)
        target.write_text(out, encoding="utf-8")
        print("wrote", target.relative_to(ROOT))
    write_sitemap()
    print("wrote sitemap.xml")


if __name__ == "__main__":
    main()

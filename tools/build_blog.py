#!/usr/bin/env python3
"""Build the static blog from Markdown files.

    pip install markdown
    python3 tools/build_blog.py

Reads   blog/posts/*.md   (front matter: title, date, tag, excerpt, optional draft)
Writes  blog/<slug>.html  for every post and  blog/index.html  (newest first),
then refreshes sitemap.xml. Generated .html files in blog/ are overwritten;
posts whose .md was deleted are removed.
"""
import datetime, html, pathlib, re, sys

import markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent
BLOG = ROOT / "blog"
POSTS = BLOG / "posts"
BASE = "https://dingshuaiyang1999.github.io"
TAGS = {"Life", "Study", "Work"}
sys.path.insert(0, str(ROOT / "tools"))


def parse(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.S)
    if not m:
        sys.exit(f"{path.name}: missing front matter (--- ... ---)")
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip().lower()] = v.split(" #")[0].strip()
    for key in ("title", "date"):
        if key not in meta:
            sys.exit(f"{path.name}: front matter needs '{key}'")
    datetime.date.fromisoformat(meta["date"])
    if meta.get("tag") and meta["tag"] not in TAGS:
        print(f"warning: {path.name}: tag '{meta['tag']}' is not one of {sorted(TAGS)}")
    meta["slug"] = path.stem
    meta["body"] = markdown.markdown(m.group(2), extensions=["fenced_code", "tables", "sane_lists"])
    meta["draft"] = meta.get("draft", "false").lower() == "true"
    return meta


def fmt_date(iso):
    return datetime.date.fromisoformat(iso).strftime("%b %d, %Y")


def page(title, description, canonical, main):
    e = html.escape
    return f"""<!doctype html>
<html lang="en" data-page-lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{e(title)}</title>
    <meta name="description" content="{e(description)}" />
    <link rel="icon" type="image/png" sizes="32x32" href="../assets/favicon-32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="../assets/apple-touch-icon.png" />
    <link rel="canonical" href="{canonical}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="{canonical}" />
    <meta property="og:title" content="{e(title)}" />
    <meta property="og:description" content="{e(description)}" />
    <meta property="og:image" content="{BASE}/assets/og-card.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#14201b" />
    <link rel="stylesheet" href="../styles.css" />
    <script>
      // Apply theme before first paint: saved choice, else OS preference.
      (function () {{
        var theme = "light";
        try {{
          var saved = localStorage.getItem("theme");
          if (saved === "light" || saved === "dark") theme = saved;
          else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
        }} catch (e) {{}}
        document.documentElement.setAttribute("data-theme", theme);
      }})();
    </script>
    <script src="../script.js" defer></script>
  </head>
  <body id="top" data-no-i18n>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <a class="brand" href="../" aria-label="Back to homepage">
        <span class="brand-mark">DY</span>
        <span>Dingshuai Yang</span>
      </a>
      <nav class="site-nav" aria-label="Primary navigation">
        <a href="../#about">About</a>
        <a href="../#projects">Projects</a>
        <a href="./" aria-current="page">Blog</a>
        <a href="../#contact">Contact</a>
      </nav>
      <div class="header-tools">
        <button class="theme-toggle" type="button" aria-pressed="false" aria-label="Switch to dark mode" title="Switch to dark mode">
          <svg class="theme-icon sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.2" y1="5.2" x2="6.9" y2="6.9"/><line x1="17.1" y1="17.1" x2="18.8" y2="18.8"/><line x1="5.2" y1="18.8" x2="6.9" y2="17.1"/><line x1="17.1" y1="6.9" x2="18.8" y2="5.2"/></g></svg>
          <svg class="theme-icon moon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 13.5a8.5 8.5 0 1 1-9.5-10.5 7 7 0 0 0 9.5 10.5z"/></svg>
        </button>
      </div>
    </header>
    <main id="main" class="blog-main" tabindex="-1">
{main}
    </main>
    <footer class="site-footer">
      <p>© {datetime.date.today().year} Dingshuai Yang.</p>
      <div class="footer-meta"><a href="../">Home</a><span class="footer-sep" aria-hidden="true">·</span><a href="#top">Back to top</a></div>
    </footer>
  </body>
</html>
"""


def meta_line(p):
    tag = f'<span class="post-tag">{html.escape(p["tag"])}</span>' if p.get("tag") else ""
    return f'<p class="post-meta">{tag}<time datetime="{p["date"]}">{fmt_date(p["date"])}</time></p>'


def main():
    posts = [p for p in (parse(f) for f in sorted(POSTS.glob("*.md"))) if not p["draft"]]
    posts.sort(key=lambda p: p["date"], reverse=True)

    for old in BLOG.glob("*.html"):
        old.unlink()

    for p in posts:
        main_html = f"""      <a class="post-back" href="./">← All posts</a>
      <article>
        {meta_line(p)}
        <h1>{html.escape(p["title"])}</h1>
        <div class="post-body">
{p["body"]}
        </div>
      </article>"""
        (BLOG / f'{p["slug"]}.html').write_text(
            page(f'{p["title"]} · Dingshuai Yang', p.get("excerpt", p["title"]), f'{BASE}/blog/{p["slug"]}.html', main_html),
            encoding="utf-8")
        print("wrote", f'blog/{p["slug"]}.html')

    items = "\n".join(
        f"""        <li class="post-item">
          {meta_line(p)}
          <h2><a href="{p["slug"]}.html">{html.escape(p["title"])}</a></h2>
          <p>{html.escape(p.get("excerpt", ""))}</p>
        </li>""" for p in posts) or '        <li class="post-item"><p>No posts yet.</p></li>'
    index_html = f"""      <div class="section-heading">
        <p class="section-label">Blog</p>
        <h1>Notes on life, study, and work.</h1>
      </div>
      <ul class="post-list">
{items}
      </ul>"""
    (BLOG / "index.html").write_text(
        page("Blog · Dingshuai Yang", "Blog posts by Dingshuai Yang about life, study, and work.", f"{BASE}/blog/", index_html),
        encoding="utf-8")
    print("wrote blog/index.html")

    from build_i18n import write_sitemap
    write_sitemap()
    print("wrote sitemap.xml")


if __name__ == "__main__":
    main()

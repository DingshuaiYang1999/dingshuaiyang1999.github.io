#!/usr/bin/env python3
"""Build the static blog from Markdown files.

    pip install markdown
    python3 tools/build_blog.py

Reads   blog/posts/*.md   (front matter: title, date, tag, excerpt, optional draft)
Writes  blog/<slug>.html  for every post and  blog/index.html  (newest first),
and the latest posts on the homepage.
Finally refreshes sitemap.xml. Generated .html files in blog/ are overwritten;
posts whose .md was deleted are removed.
"""
import datetime, html, pathlib, re, sys

import markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent
BLOG = ROOT / "blog"
POSTS = BLOG / "posts"
BASE = "https://dingshuaiyang1999.github.io"
TAGS = {"Life", "Study", "Work"}


def parse(path, required=("title", "date")):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.S)
    if not m:
        sys.exit(f"{path.name}: missing front matter (--- ... ---)")
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip().lower()] = v.split(" #")[0].strip()
    for key in required:
        if key not in meta:
            sys.exit(f"{path.name}: front matter needs '{key}'")
    datetime.date.fromisoformat(meta["date"])
    if meta.get("tag") and meta["tag"] not in TAGS:
        print(f"warning: {path.name}: tag '{meta['tag']}' is not one of {sorted(TAGS)}")
    meta["slug"] = path.stem
    meta["body"] = markdown.markdown(m.group(2), extensions=["fenced_code", "tables", "sane_lists", "md_in_html"])
    meta["draft"] = meta.get("draft", "false").lower() == "true"
    words = len(re.findall(r"\w+", re.sub(r"<[^>]+>", " ", m.group(2))))
    meta["minutes"] = max(1, round(words / 200))
    return meta


def fmt_date(iso):
    return datetime.date.fromisoformat(iso).strftime("%b %d, %Y")


def page(title, description, canonical, main, current="blog", extra_head="", og_image=None):
    e = html.escape
    out = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>{e(title)}</title>
    <meta name="description" content="{e(description)}" />
    <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="../assets/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="../assets/favicon-16.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="../assets/apple-touch-icon.png" />
    <link rel="canonical" href="{canonical}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="{canonical}" />
    <meta property="og:title" content="{e(title)}" />
    <meta property="og:description" content="{e(description)}" />
    <meta property="og:image" content="{og_image or BASE + '/assets/og-card.jpg'}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#111418" media="(prefers-color-scheme: dark)" />
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
  <body id="top">
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header" data-header>
      <div class="header-inner">
        <a class="brand" href="../" aria-label="Dingshuai Yang — home">
          <img class="brand-logo brand-logo-light" src="../assets/logo/logo-light.svg" alt="" width="28" height="28" />
          <img class="brand-logo brand-logo-dark" src="../assets/logo/logo-dark.svg" alt="" width="28" height="28" />
          <span class="brand-name">Dingshuai Yang</span>
        </a>
        <nav class="site-nav" id="site-nav" aria-label="Primary">
          <ul class="nav-links">
            <li><a href="../#about" data-nav="about">About</a></li>
            <li><a href="../#education" data-nav="education">Education</a></li>
            <li><a href="../#projects" data-nav="projects">Projects</a></li>
            <li><a href="../blog/" data-nav="blog">Blog</a></li>
            <li><a href="../contact/" data-nav="contact">Contact</a></li>
          </ul>
        </nav>
        <div class="header-tools">
          <button class="theme-toggle" type="button" aria-pressed="false" aria-label="Switch to dark mode" title="Switch to dark mode">
          <svg class="theme-icon sun" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
            <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <line x1="12" y1="2.5" x2="12" y2="5"/>
              <line x1="12" y1="19" x2="12" y2="21.5"/>
              <line x1="2.5" y1="12" x2="5" y2="12"/>
              <line x1="19" y1="12" x2="21.5" y2="12"/>
              <line x1="5.2" y1="5.2" x2="6.9" y2="6.9"/>
              <line x1="17.1" y1="17.1" x2="18.8" y2="18.8"/>
              <line x1="5.2" y1="18.8" x2="6.9" y2="17.1"/>
              <line x1="17.1" y1="6.9" x2="18.8" y2="5.2"/>
            </g>
          </svg>
          <svg class="theme-icon moon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M21 13.5a8.5 8.5 0 1 1-9.5-10.5 7 7 0 0 0 9.5 10.5z"/>
          </svg>
        </button>
          <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">
            <span class="nav-toggle-bar" aria-hidden="true"></span>
            <span class="nav-toggle-bar" aria-hidden="true"></span>
            <span class="nav-toggle-bar" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </header>
    <main id="main" class="blog-main" tabindex="-1">
{main}
    </main>
    <footer class="site-footer">
      <p>© {datetime.date.today().year} Dingshuai Yang · <a href="../">Home</a></p>
      <p><a href="#top">Back to top</a></p>
    </footer>
  </body>
</html>
"""
    return out.replace(f'data-nav="{current}">', f'data-nav="{current}" aria-current="page">', 1).replace("</head>", extra_head + "</head>", 1)


def meta_line(p):
    tag = f'<span class="post-tag">{html.escape(p["tag"])}</span>' if p.get("tag") else ""
    return (f'<p class="post-meta">{tag}<time datetime="{p["date"]}">{fmt_date(p["date"])}</time>'
            f'<span class="post-read">{p["minutes"]} min read</span></p>')


def picture(p, kind, prefix, cls, w, h, eager=False):
    """<picture> for a post cover ('cover' 1600x900) or list thumbnail ('thumb' 480x270)."""
    if not p.get("cover"):
        return ""
    base = f'{prefix}assets/blog/{p["cover"]}-{kind}'
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    alt = html.escape(p.get("cover_alt", "")) if kind == "cover" else ""
    return (f'<picture class="{cls}"><source srcset="{base}.webp" type="image/webp" />'
            f'<img src="{base}.jpg" alt="{alt}" width="{w}" height="{h}" {load} decoding="async" /></picture>')


def write_home_snippet(posts, limit=3):
    """Latest posts on the homepage, between the BLOG:START / BLOG:END markers."""
    home = ROOT / "index.html"
    page_html = home.read_text(encoding="utf-8")
    items = "\n".join(
        f"""          <li class="post-item{' has-thumb' if p.get('cover') else ''}">
            {picture(p, "thumb", "", "post-thumb", 480, 270)}
            <div class="post-text">
            {meta_line(p)}
            <h3><a href="blog/{p['slug']}.html">{html.escape(p['title'])}</a></h3>
            <p>{html.escape(p.get('excerpt', ''))}</p>
            </div>
          </li>""" for p in posts[:limit])
    block = f'<ul class="post-list">\n{items}\n        </ul>' if posts else '<p class="muted">No posts yet.</p>'
    new = re.sub(r"(<!-- BLOG:START[^>]*-->).*?(<!-- BLOG:END -->)",
                 lambda m: f"{m.group(1)}\n        {block}\n        {m.group(2)}", page_html, flags=re.S)
    home.write_text(new, encoding="utf-8")
    print("updated index.html blog list")


def write_sitemap(posts):
    """sitemap.xml = homepage, demos, blog index and published posts."""
    today = datetime.date.today().isoformat()
    urls = [(f"{BASE}/", "weekly", "1.0")]
    urls += [(f"{BASE}/demos/{p.name}", "monthly", "0.6") for p in sorted((ROOT / "demos").glob("*.html"))]
    urls.append((f"{BASE}/contact/", "yearly", "0.5"))
    urls.append((f"{BASE}/blog/", "weekly", "0.7"))
    urls += [(f"{BASE}/blog/{p['slug']}.html", "monthly", "0.5") for p in posts]
    body = "".join(
        f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{today}</lastmod>\n    <changefreq>{c}</changefreq>\n    <priority>{pr}</priority>\n  </url>\n"
        for u, c, pr in urls)
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + "</urlset>\n",
        encoding="utf-8")


def main():
    posts = [p for p in (parse(f) for f in sorted(POSTS.glob("*.md"))) if not p["draft"]]
    posts.sort(key=lambda p: p["date"], reverse=True)

    for old in BLOG.glob("*.html"):
        old.unlink()

    for p in posts:
        main_html = f"""      <a class="post-back" href="./">← All posts</a>
      <article class="post">
        <header class="post-header">
          {meta_line(p)}
          {f'<p class="post-kicker">{html.escape(p["title"])}</p>' if p.get("subtitle") else ""}
          <h1>{html.escape(p.get("subtitle") or p["title"])}</h1>
          {f'<p class="post-dek">{html.escape(p["dek"])}</p>' if p.get("dek") else ""}
          {f'<p class="post-byline">By {html.escape(p["author"])}</p>' if p.get("author") else ""}
        </header>
        {picture(p, "cover", "../", "post-cover", 1600, 900, eager=True)}
        <div class="post-body">
{p["body"]}
        </div>
      </article>"""
        (BLOG / f'{p["slug"]}.html').write_text(
            page(f'{p["title"]} · Dingshuai Yang', p.get("excerpt", p["title"]), f'{BASE}/blog/{p["slug"]}.html', main_html,
                 og_image=f'{BASE}/assets/blog/{p["cover"]}-cover.jpg' if p.get("cover") else None),
            encoding="utf-8")
        print("wrote", f'blog/{p["slug"]}.html')

    items = "\n".join(
        f"""        <li class="post-item{' has-thumb' if p.get('cover') else ''}">
          {picture(p, "thumb", "../", "post-thumb", 480, 270)}
          <div class="post-text">
          {meta_line(p)}
          <h2><a href="{p["slug"]}.html">{html.escape(p["title"])}</a></h2>
          <p>{html.escape(p.get("excerpt", ""))}</p>
          </div>
        </li>""" for p in posts) or '        <li class="post-item"><p>No posts yet.</p></li>'
    index_html = f"""      <p class="section-label">Blog</p>
      <h1>Notes on life, study, and work.</h1>
      <ul class="post-list">
{items}
      </ul>"""
    (BLOG / "index.html").write_text(
        page("Blog · Dingshuai Yang", "Blog posts by Dingshuai Yang about life, study, and work.", f"{BASE}/blog/", index_html),
        encoding="utf-8")
    print("wrote blog/index.html")

    write_home_snippet(posts)
    write_sitemap(posts)
    print("wrote sitemap.xml")


if __name__ == "__main__":
    main()

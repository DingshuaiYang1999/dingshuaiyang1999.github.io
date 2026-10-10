#!/usr/bin/env python3
"""Build the static blog from Markdown files.

    pip install markdown
    python3 tools/build_blog.py

Reads   blog/posts/*.md   (front matter: title, date, tag, excerpt, optional draft)
Writes  blog/<slug>.html  for every post and  blog/index.html  (newest first),
and the latest posts on the homepage.

Also builds the public Q&A page:
Reads   qa/entries/*.md   (front matter: question, topic, date, optional asked_by)
Writes  qa/index.html  (newest first, topic filter + search via qa.js).

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
    meta["body"] = markdown.markdown(m.group(2), extensions=["fenced_code", "tables", "sane_lists"])
    meta["draft"] = meta.get("draft", "false").lower() == "true"
    return meta


def fmt_date(iso):
    return datetime.date.fromisoformat(iso).strftime("%b %d, %Y")


def page(title, description, canonical, main, current="blog", extra_head=""):
    e = html.escape
    out = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>{e(title)}</title>
    <meta name="description" content="{e(description)}" />
    <link rel="icon" type="image/svg+xml" href="../assets/logo/dy-light.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="../assets/favicon-32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="../assets/apple-touch-icon.png" />
    <link rel="canonical" href="{canonical}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="{canonical}" />
    <meta property="og:title" content="{e(title)}" />
    <meta property="og:description" content="{e(description)}" />
    <meta property="og:image" content="{BASE}/assets/og-card.jpg" />
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
          <img class="brand-logo brand-logo-light" src="../assets/logo/dy-light.svg" alt="" width="28" height="28" />
          <img class="brand-logo brand-logo-dark" src="../assets/logo/dy-dark.svg" alt="" width="28" height="28" />
          <span class="brand-name">Dingshuai Yang</span>
        </a>
        <nav class="site-nav" id="site-nav" aria-label="Primary">
          <ul class="nav-links">
            <li><a href="../#about" data-nav="about">About</a></li>
            <li><a href="../#education" data-nav="education">Education</a></li>
            <li><a href="../#projects" data-nav="projects">Projects</a></li>
            <li><a href="../blog/" data-nav="blog">Blog</a></li>
            <li><a href="../qa/" data-nav="qa">Q&amp;A</a></li>
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
    return f'<p class="post-meta">{tag}<time datetime="{p["date"]}">{fmt_date(p["date"])}</time></p>'


QA = ROOT / "qa"
QA_ENTRIES = QA / "entries"


def build_qa():
    entries = [parse(f, required=("question", "topic", "date")) for f in sorted(QA_ENTRIES.glob("*.md"))]
    entries = [q for q in entries if not q["draft"]]
    entries.sort(key=lambda q: q["date"], reverse=True)
    topics = sorted({q["topic"] for q in entries})
    e = html.escape
    chips = "\n".join(
        f'          <button type="button" class="chip" data-topic="{e(t)}" aria-pressed="false">{e(t)}</button>' for t in topics)
    items = "\n".join(
        f"""        <li class="qa-item" id="{e(q['slug'])}" data-topic="{e(q['topic'])}">
          <details>
            <summary>
              <span class="qa-q">{e(q['question'])}</span>
              <span class="qa-meta"><span class="post-tag">{e(q['topic'])}</span> <time datetime="{q['date']}">{fmt_date(q['date'])}</time>{(' · asked by ' + e(q['asked_by'])) if q.get('asked_by') else ''}</span>
            </summary>
            <div class="qa-a post-body">
{q['body']}
              <p class="qa-link"><a href="#{e(q['slug'])}">Link to this question</a></p>
            </div>
          </details>
        </li>""" for q in entries)
    main_html = f"""      <p class="section-label">Q&amp;A</p>
      <h1>Questions &amp; answers</h1>
      <p class="section-intro">Selected questions people have sent me, answered publicly. Names are only shown with permission; otherwise questions are anonymised. <a href="../contact/">Ask a question</a>.</p>
      <div class="qa-tools">
        <label class="visually-hidden" for="qa-search">Search questions</label>
        <input id="qa-search" type="search" placeholder="Search questions and answers…" autocomplete="off" />
        <div class="chips" role="group" aria-label="Filter by topic">
          <button type="button" class="chip" data-topic="" aria-pressed="true">All</button>
{chips}
        </div>
      </div>
      <p class="qa-count muted" id="qa-count" role="status" aria-live="polite"></p>
      <ol class="qa-list" id="qa-list">
{items or '        <li class="muted">No questions answered yet.</li>'}
      </ol>
      <p class="qa-empty muted" id="qa-empty" hidden>No questions match your search.</p>"""
    QA.mkdir(exist_ok=True)
    (QA / "index.html").write_text(
        page("Q&A · Dingshuai Yang", "Selected questions to Dingshuai Yang about robotics, control engineering and studying mechatronics, with answers.",
             f"{BASE}/qa/", main_html, current="qa", extra_head='    <script src="../qa.js" defer></script>\n  '),
        encoding="utf-8")
    print(f"wrote qa/index.html ({len(entries)} entries)")


def write_home_snippet(posts, limit=3):
    """Latest posts on the homepage, between the BLOG:START / BLOG:END markers."""
    home = ROOT / "index.html"
    page_html = home.read_text(encoding="utf-8")
    items = "\n".join(
        f"""          <li class="post-item">
            {meta_line(p)}
            <h3><a href="blog/{p['slug']}.html">{html.escape(p['title'])}</a></h3>
            <p>{html.escape(p.get('excerpt', ''))}</p>
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
    urls.append((f"{BASE}/qa/", "weekly", "0.6"))
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
    build_qa()
    write_sitemap(posts)
    print("wrote sitemap.xml")


if __name__ == "__main__":
    main()

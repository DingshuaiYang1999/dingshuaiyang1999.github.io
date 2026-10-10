# dingshuaiyang1999.github.io

Personal website of Dingshuai Yang — plain HTML/CSS/JS, deployed to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`.

## Languages (static per-language URLs)

- `index.html` is the English page **and** the template for all languages.
- All translations live in one place: the `translations` object in `script.js`.
- `/de/`, `/zh/`, `/zh-tw/`, `/ja/` are **generated** — do not edit them by hand.

After changing `index.html` or `script.js`:

```bash
python3 tools/build_i18n.py   # needs Node.js; regenerates language pages + sitemap.xml
```

## Blog

Posts are Markdown files in `blog/posts/` with a small front-matter block:

```markdown
---
title: My post title
date: 2026-11-01
tag: Study          # Life, Study or Work
excerpt: One or two sentences for the blog index.
draft: false        # optional
---

Post body in Markdown…
```

Build:

```bash
pip install markdown
python3 tools/build_blog.py   # writes blog/<slug>.html, blog/index.html, sitemap.xml
```

`blog/posts/2026-10-10-welcome.md` is only an example/template — delete it and rebuild
once the first real post exists. Images for posts can go in `assets/blog/`.

## CV

`assets/cv/Dingshuai_Yang_CV.pdf` (English) and `assets/cv/Dingshuai_Yang_Lebenslauf.pdf`
(German) are web versions without signature. The German page links the Lebenslauf; all
other languages link the English CV.

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000/
```

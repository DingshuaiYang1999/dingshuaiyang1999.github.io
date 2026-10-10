# dingshuaiyang1999.github.io

Personal website of Dingshuai Yang — plain HTML/CSS/JS, deployed to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`.

## Blog

Posts are Markdown files in `blog/posts/` with a small front-matter block:

```markdown
---
title: My post title
date: 2026-11-01
tag: Study          # Life, Study or Work
excerpt: One or two sentences for the blog index.
draft: false        # optional
# optional: subtitle, dek, author, cover, cover_alt
# cover: <name> -> assets/blog/<name>-cover.{jpg,webp} (1600x900, post hero + og:image)
#                  and assets/blog/<name>-thumb.{jpg,webp} (480x270, list thumbnail)
---

Post body in Markdown…
```

Build:

```bash
pip install markdown
python3 tools/build_blog.py   # writes blog/<slug>.html, blog/index.html and sitemap.xml
```

Reading time (about 200 words per minute) is computed automatically. To style closing lines,
wrap them in `<div class="post-closing" markdown="1"> … </div>`. See
`blog/posts/2024-05-11-beginning-my-german-life.md` for a full example. Images for posts go in `assets/blog/`.

## Contact form

`/contact/` posts to [Web3Forms](https://web3forms.com) (no backend needed). Set the access
key in one place: `WEB3FORMS_ACCESS_KEY` at the top of `contact.js`. While it is
`"REPLACE_ME"` the form validates normally but shows a "not configured yet" notice instead
of sending.

## CV

`assets/cv/Dingshuai_Yang_CV.pdf` is the public web version of the CV (no signature, no
phone number). The site is English-only; old `/de/`, `/zh/`, `/zh-tw/`, `/ja/` and `?lang=`
links land on the English homepage.

## Project thumbnails

Cards use `assets/thumbs/*.webp|jpg` (960×540): cropped, brightened versions of the
originals in `assets/` and `assets/demos/` so thin lines stay visible at card size.

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000/
```

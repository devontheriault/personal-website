# Personal Website

My personal landing page: who I am, what I've built, and a link to my resume.

Plain HTML and CSS, with no build step, framework or JavaScript.

```
index.html                  the page
styles.css                  all styles (light and dark follow the OS setting)
assets/
  Devon_Theriault_Resume.pdf  linked from the nav, hero and contact section
  projects/*.webp             project screenshots
  fonts/*.woff2               self-hosted Instrument Serif, Inter, JetBrains Mono (SIL OFL)
  favicon.svg
```

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Updating

- **Resume:** replace `assets/Devon_Theriault_Resume.pdf` and keep the same filename.
- **Project screenshots:** these are 1440×900 captures resized to 1200px WebP:
  ```sh
  chromium --headless=new --hide-scrollbars --window-size=1440,900 --timeout=10000 \
    --screenshot=shot.png https://orchestrates.dev
  magick shot.png -resize 1200x -quality 82 assets/projects/orchestrates.dev.webp
  ```
- **Adding a project:** copy one `<article class="project">` block in `index.html`. The
  screenshot alternates sides on its own.

## Deploy

Any static host works, e.g. Cloudflare Pages, Netlify, GitHub Pages, or
your own server. Serve the repo root as is.

## v2 (`/v2/`)

An alternative version: Inter only, with five charts built from real data that grow as you scroll.

- `v2/data.js` holds the generated data: Orchestrate's merge history, the agreements from
  variablegeometry.ca, a land dot grid for the map (Natural Earth 110m), a fallback snapshot of
  theriault.dev's visitor data and this year's books from `~/Projects/Books/js/books.js`. In the
  browser, the map and visitor stats are fetched live from theriault.dev's `/globe` and `/stats`
  endpoints, which allow cross-origin requests.
- `v2/main.js` contains the charts. It has no dependencies: plain SVG, driven by scroll position. On desktop,
  each project section pins while its chart grows. With reduced motion, every chart renders fully.

## Reading Room (`/reading-room/`)

A copy of the Reading Room's Journal from the Books project (`~/Projects/Books`), at
`/reading-room/journey/`. `/reading-room/` forwards there. Only the Journal is published here; the
bookshelf page isn't, so visitors move between this site and the Journal only. The Books project is
still the source of truth. After adding books there, run:

```sh
tools/sync-reading-room.sh
```

The script:
- copies the Journal and the book data and fonts it shares with the bookshelf
- repoints the Journal's links to the bookshelf (the corner link, the no-WebGL redirect and the
  fallback messages) to this site, in the copy only
- refreshes the bookshelf chart and the reading figures in About (`BOOKS` in `v2/data.js`)

If the Journal changes so that a link can't be repointed, the script stops with an error.
Once v2 becomes the main page, set `site_home=""` in the script so those links point at the root.
The `.gitignore` keeps `reading-room/journey/vendor/`, because the Journal loads Three.js from there.

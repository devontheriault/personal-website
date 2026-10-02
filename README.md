# Personal Website

My personal site: who I am, what I've built, and a link to my resume. Each project comes with a
chart built from its real data that grows as you scroll.

Plain HTML, CSS and JavaScript, with no build step, framework or dependencies.

```
index.html                  the page
styles.css                  all styles (light and dark follow the OS setting)
main.js                     the charts: plain SVG, driven by scroll position
background.js               the decorative backdrop (dot grid and line series)
data.js                     generated data for the charts
assets/
  Devon_Theriault_Resume.pdf  linked from the nav, hero and contact section
  about/*.webp                About photos (full/ holds the lightbox versions)
  fonts/inter-var.woff2       self-hosted Inter (SIL OFL)
  favicon.svg
reading-room/               the Reading Room's Journal (see below)
tools/                      scripts that sync the Journal and refresh data.js
```

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Updating

- **Resume:** replace `assets/Devon_Theriault_Resume.pdf` and keep the same filename.

## Charts

- `data.js` holds the generated data: Orchestrate's merge history, the agreements from
  variablegeometry.ca, a land dot grid for the map (Natural Earth 110m), a fallback snapshot of
  theriault.dev's visitor data and this year's books from `~/Projects/Books/js/books.js`. In the
  browser, the map and visitor stats are fetched live from theriault.dev's `/globe` and `/stats`
  endpoints, which allow cross-origin requests.
- `main.js` contains the charts. On desktop, each project section pins while its chart grows.
  With reduced motion, every chart renders fully.

## Deploy

The site lives at [theriault.dev](https://theriault.dev), served by
[Who Touched My Server](https://github.com/devontheriault/theriault.dev), my C server, which also
watches it. The server serves this repo from its `SITE_ROOT` directory (default `site/` beside the
server) and keeps its own dashboard at `/monitor/`. To deploy, copy the repo there, leaving out
`.git` (the server refuses dotfiles anyway):

```sh
rsync -a --delete --exclude .git ./ <server>:<theriault.dev checkout>/site/
```

Files are revalidated on every request, so changes show up without a restart.

Every page loads `/monitor/js/track.js`, which reports the visit. When you run the site locally
with `python3 -m http.server`, that script doesn't exist and the request fails harmlessly.

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
  fallback messages) to this site's home page, in the copy only
- adds the visit tracker (`/monitor/js/track.js`) to the Journal, also in the copy only
- refreshes the bookshelf chart (`BOOKS` in `data.js`)

If the Journal changes so that a link can't be repointed, the script stops with an error.
The `.gitignore` keeps `reading-room/journey/vendor/`, because the Journal loads Three.js from there.

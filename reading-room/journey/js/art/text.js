/*
  Canvases and type, shared by everything that draws: the pages, the
  Sketches and the cover.
*/

export const FONTS = {
  display: '"Cormorant Garamond", Georgia, serif',
  body: '"Source Serif 4", Georgia, serif',
  mono: '"DM Mono", ui-monospace, monospace',
  hand: '"Homemade Apple", cursive',
};

// every face the drawing uses, for a worker to load for itself (the page
// has them from css/fonts.css)
export const TYPEFACES = [
  ["Cormorant Garamond", "normal", "500", "../../../assets/fonts/cormorant-garamond-500.woff2"],
  ["Cormorant Garamond", "italic", "400", "../../../assets/fonts/cormorant-garamond-400-italic.woff2"],
  ["Source Serif 4", "normal", "400", "../../../assets/fonts/source-serif-4-400.woff2"],
  ["Source Serif 4", "italic", "400", "../../../assets/fonts/source-serif-4-400-italic.woff2"],
  ["DM Mono", "normal", "400", "../../../assets/fonts/dm-mono-400.woff2"],
  ["Homemade Apple", "normal", "400", "../../assets/fonts/homemade-apple-400.woff2"],
].map(([family, style, weight, url]) => ({ family, style, weight, url: new URL(url, import.meta.url).href }));

/*
  Start loading every face, on the page or in a worker. Resolves, per
  family, once its faces can be drawn with (or have failed to load, when
  the drawing falls back as a page would).
*/
export function loadTypefaces() {
  const loading = TYPEFACES.map((f) => {
    let loaded;
    if (typeof document !== "undefined") loaded = document.fonts.load(`${f.style} ${f.weight} 20px "${f.family}"`);
    else {
      const face = new FontFace(f.family, `url(${f.url})`, { style: f.style, weight: f.weight });
      self.fonts.add(face);
      loaded = face.load();
    }
    return { family: f.family, loaded: loaded.catch(() => {}) };
  });
  const families = {};
  for (const { family, loaded } of loading) families[family] = Promise.all([families[family], loaded]);
  return families;
}

/*
  A blank canvas, offscreen wherever the browser has them (always, in a
  worker). Nothing is ever read back off one (see paper.js), so most are
  drawn on the GPU. A `soft` one is drawn in software instead, on the
  thread that draws it: the pages, which are drawn while the Journal is
  moving, when the GPU process (one thread, shared by the whole browser)
  has frames to put up and no time to spare for a page's thousands of
  pen strokes.
*/
export function makeCanvas(width, height, { soft = false } = {}) {
  let c;
  if (typeof OffscreenCanvas === "function") c = new OffscreenCanvas(width, height);
  else {
    c = document.createElement("canvas");
    c.width = width;
    c.height = height;
  }
  if (soft) c.getContext("2d", { willReadFrequently: true });
  return c;
}

// letter-spaced text, set by hand (canvas letterSpacing isn't everywhere)
export function spaced(ctx, text, x, y, tracking, align = "left") {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + tracking;
  });
  ctx.textAlign = prev;
  return total;
}

// lines that fit `width`, with null between paragraphs
export function wrap(ctx, text, width) {
  const out = [];
  for (const para of String(text).split(/\n\s*\n/)) {
    const words = para.trim().split(/\s+/);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > width && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
    out.push(null); // paragraph break
  }
  out.pop();
  return out;
}

export function fitText(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

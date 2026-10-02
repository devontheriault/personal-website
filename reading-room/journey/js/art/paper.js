/*
  The paper every page is drawn on, and the cloth the Journal is bound in.
  Both are generated once per resolution and reused: the page renderer
  paints over a copy of the paper, the cover art paints foil over the cloth.
*/

import { makeCanvas } from "./text.js";
import { seededRandom } from "../util.js";

export const PAPER = "#efe6d3";
export const CLOTH = "#243129";
export const FOIL = "#c9a35f";

/*
  A sheet of flat `color` with a grain of per-pixel noise, laid down as
  pixels. It is the first thing drawn on a sheet, so nothing ever has to
  be read back off the canvas (which would make the canvas draw in
  software, and make reading it the costliest step in all the art). The
  grain has a generator of its own, so everything drawn over it lands
  where it always has.
*/
function grainedSheet(ctx, w, h, color, seed, strength) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const c = parseInt(color.slice(1), 16);
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  // mulberry32, inlined: this loop touches every pixel of every sheet
  // (a Uint8ClampedArray clamps and rounds by itself)
  let a = seed >>> 0;
  for (let i = 0, n = d.length; i < n; i += 4) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const v = (((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5) * strength;
    d[i] = r + v;
    d[i + 1] = g + v;
    d[i + 2] = b + v * 0.9;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// a gradient from (x0, y0) to (x1, y1) across or down the sheet, filled
// only as far as it has any colour (past its clear end it would draw nothing)
function fillStrip(ctx, x0, y0, x1, y1, w, h) {
  if (x0 !== x1) ctx.fillRect(Math.min(x0, x1) - 2, 0, Math.abs(x1 - x0) + 4, h);
  else ctx.fillRect(0, Math.min(y0, y1) - 2, w, Math.abs(y1 - y0) + 4);
}

/*
  A recto page (gutter on the left). The same sheet mirrored serves the
  versos. Laid out in page units after `scale`, so the texture is the same
  sheet at any resolution.
*/
export function makePaper(width, height, { soft = false } = {}) {
  const canvas = makeCanvas(width, height, { soft });
  const ctx = canvas.getContext("2d");
  const rand = seededRandom(1789);
  const s = width / 1000;

  grainedSheet(ctx, width, height, PAPER, 1790, 7);

  ctx.save();
  ctx.scale(s, s);
  const H = 1420;

  // cloudy formation: paper is never one flat colour
  for (let i = 0; i < 70; i++) {
    const x = rand() * 1000;
    const y = rand() * H;
    const r = 60 + rand() * 260;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = rand() > 0.5;
    g.addColorStop(0, warm ? "rgba(196, 160, 104, 0.028)" : "rgba(255, 252, 240, 0.05)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // fibres
  ctx.lineCap = "round";
  for (let i = 0; i < 900; i++) {
    const x = rand() * 1000;
    const y = rand() * H;
    const a = rand() * Math.PI;
    const l = 4 + rand() * 14;
    ctx.strokeStyle = rand() > 0.5 ? "rgba(120, 96, 60, 0.07)" : "rgba(255, 255, 250, 0.12)";
    ctx.lineWidth = 0.6 + rand() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rand() - 0.5) * 4, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }

  // foxing: a few tiny age spots, mostly near the edges
  for (let i = 0; i < 9; i++) {
    const edge = rand() > 0.35;
    const x = edge ? (rand() > 0.5 ? 960 + rand() * 40 : rand() * 1000) : rand() * 1000;
    const y = edge ? (rand() > 0.5 ? rand() * 60 : H - rand() * 60) : rand() * H;
    const r = 0.8 + rand() * 2.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    g.addColorStop(0, "rgba(150, 100, 50, 0.1)");
    g.addColorStop(1, "rgba(150, 100, 50, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }

  // edges toned by light and handling: strongest at the fore-edge, where
  // thumbs turn the pages, and a little into the gutter
  const edge = (x0, y0, x1, y1, a) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(150, 112, 62, ${a})`);
    g.addColorStop(1, "rgba(150, 112, 62, 0)");
    ctx.fillStyle = g;
    fillStrip(ctx, x0, y0, x1, y1, 1000, H);
  };
  edge(1000, 0, 930, 0, 0.16);
  edge(0, 0, 0, 70, 0.1);
  edge(0, H, 0, H - 70, 0.12);
  edge(0, 0, 50, 0, 0.1);
  ctx.restore();
  return canvas;
}

/*
  Book cloth: a fine plain weave (warp and weft threads a shade apart),
  mottled where the dye took unevenly, lighter where hands have worn it.
  Returns the colour canvas and a matching height map for the weave.
*/
export function makeCloth(width, height, seed = 7, color = CLOTH) {
  const rand = seededRandom(seed);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  grainedSheet(ctx, width, height, color, seed * 7919 + 13, 10);

  for (let i = 0; i < 40; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = (0.08 + rand() * 0.3) * width;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rand() > 0.5 ? "rgba(255, 245, 220, 0.035)" : "rgba(0, 0, 0, 0.06)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const bump = makeCanvas(width, height);
  const b = bump.getContext("2d");
  b.fillStyle = "#808080";
  b.fillRect(0, 0, width, height);

  // weave: alternating light threads each way
  const pitch = Math.max(2, Math.round(width / 420));
  for (let x = 0; x < width; x += pitch) {
    const a = 0.03 + rand() * 0.05;
    ctx.fillStyle = `rgba(255, 250, 235, ${a})`;
    ctx.fillRect(x, 0, 1, height);
    b.fillStyle = `rgba(255, 255, 255, ${0.25 + rand() * 0.2})`;
    b.fillRect(x, 0, 1, height);
  }
  for (let y = 0; y < height; y += pitch) {
    const a = 0.03 + rand() * 0.05;
    ctx.fillStyle = `rgba(0, 0, 0, ${a})`;
    ctx.fillRect(0, y, width, 1);
    b.fillStyle = `rgba(0, 0, 0, ${0.2 + rand() * 0.2})`;
    b.fillRect(0, y, width, 1);
  }

  // wear along every edge
  const wear = Math.round(width * 0.012);
  const worn = (x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(255, 240, 210, 0.13)");
    g.addColorStop(1, "rgba(255, 240, 210, 0)");
    ctx.fillStyle = g;
    fillStrip(ctx, x0, y0, x1, y1, width, height);
  };
  worn(0, 0, wear, 0);
  worn(width, 0, width - wear, 0);
  worn(0, 0, 0, wear);
  worn(0, height, 0, height - wear);
  return { canvas, bump };
}

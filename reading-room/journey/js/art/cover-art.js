/*
  The binding: cloth boards with the title stamped in gold foil, a stamped
  spine, a plain back with a small blind stamp, and the page edges.

  Foil needs more than colour to read as foil. Each stamped face gets
  three maps drawn from one mask: colour, a roughness/metalness map (foil
  is smooth and metallic where cloth is rough and dull), and a height map
  in which the stamping sits pressed into the weave.
*/

import { CLOTH, FOIL, makeCloth } from "./paper.js";
import { FONTS, makeCanvas, spaced } from "./text.js";
import { seededRandom } from "../util.js";

/*
  Turn a stamping mask into the three maps. `blind` stamps press into the
  cloth without foil.
*/
function stamp(w, h, seed, drawMask, { blind = false } = {}) {
  const { canvas: color, bump } = makeCloth(w, h, seed);
  const mask = makeCanvas(w, h);
  const m = mask.getContext("2d");
  m.fillStyle = "#fff";
  m.strokeStyle = "#fff";
  drawMask(m, w, h);

  // foil never takes perfectly: knock small flecks out of the mask
  const rand = seededRandom(seed * 7 + 1);
  m.globalCompositeOperation = "destination-out";
  for (let i = 0; i < (w * h) / 900; i++) {
    m.globalAlpha = 0.25 + rand() * 0.6;
    const r = 0.4 + rand() * 1.4;
    m.fillRect(rand() * w, rand() * h, r, r);
  }
  m.globalCompositeOperation = "source-over";
  m.globalAlpha = 1;

  const cctx = color.getContext("2d");
  if (!blind) {
    const foil = makeCanvas(w, h);
    const f = foil.getContext("2d");
    const g = f.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#d9b978");
    g.addColorStop(0.5, FOIL);
    g.addColorStop(1, "#a88445");
    f.fillStyle = g;
    f.fillRect(0, 0, w, h);
    f.globalCompositeOperation = "destination-in";
    f.drawImage(mask, 0, 0);
    cctx.drawImage(foil, 0, 0);
  } else {
    // a blind stamp darkens the cloth slightly where it is pressed
    const shade = makeCanvas(w, h);
    const s = shade.getContext("2d");
    s.fillStyle = "rgba(0, 0, 0, 0.28)";
    s.fillRect(0, 0, w, h);
    s.globalCompositeOperation = "destination-in";
    s.drawImage(mask, 0, 0);
    cctx.drawImage(shade, 0, 0);
  }

  // roughness in green, metalness in blue (the channels three.js reads)
  const orm = makeCanvas(w, h);
  const o = orm.getContext("2d");
  o.fillStyle = "rgb(255, 235, 0)";
  o.fillRect(0, 0, w, h);
  if (!blind) {
    const metal = makeCanvas(w, h);
    const mm = metal.getContext("2d");
    mm.fillStyle = "rgb(255, 80, 255)";
    mm.fillRect(0, 0, w, h);
    mm.globalCompositeOperation = "destination-in";
    mm.drawImage(mask, 0, 0);
    o.drawImage(metal, 0, 0);
  }

  // pressed in: the stamping sits below the weave
  const b = bump.getContext("2d");
  const press = makeCanvas(w, h);
  const p = press.getContext("2d");
  p.fillStyle = "#2a2a2a";
  p.fillRect(0, 0, w, h);
  p.globalCompositeOperation = "destination-in";
  p.drawImage(mask, 0, 0);
  b.drawImage(press, 0, 0);

  return { color, orm, bump };
}

export function frontCover(w, h, { year, owner }) {
  return stamp(w, h, 11, (m) => {
    const u = w / 1000;
    m.save();
    m.scale(u, u);
    const H = h / u;

    // a double rule, inset
    m.lineWidth = 4;
    m.strokeRect(62, 62, 1000 - 124, H - 124);
    m.lineWidth = 1.6;
    m.strokeRect(78, 78, 1000 - 156, H - 156);

    m.textAlign = "center";
    m.textBaseline = "alphabetic";
    m.font = `italic 400 150px ${FONTS.display}`;
    m.fillText("My Reading", 500, H * 0.38);
    m.fillText("Journey", 500, H * 0.38 + 150);

    const oy = H * 0.38 + 250;
    m.beginPath();
    m.moveTo(500, oy - 10);
    m.lineTo(510, oy);
    m.lineTo(500, oy + 10);
    m.lineTo(490, oy);
    m.closePath();
    m.fill();
    m.fillRect(390, oy - 1, 84, 2);
    m.fillRect(526, oy - 1, 84, 2);

    m.font = `400 40px ${FONTS.mono}`;
    spaced(m, String(year), 500, oy + 110, 16, "center");

    if (owner) {
      m.font = `500 34px ${FONTS.display}`;
      spaced(m, owner.toUpperCase(), 500, H - 170, 9, "center");
    }
    m.restore();
  });
}

export function backCover(w, h) {
  return stamp(
    w,
    h,
    23,
    (m) => {
      const u = w / 1000;
      m.save();
      m.scale(u, u);
      const H = h / u;
      m.lineWidth = 3;
      m.strokeRect(62, 62, 1000 - 124, H - 124);
      // a small blind-stamped ornament, symmetric so it reads either way up
      const cy = H / 2;
      m.beginPath();
      m.moveTo(500, cy - 22);
      m.lineTo(522, cy);
      m.lineTo(500, cy + 22);
      m.lineTo(478, cy);
      m.closePath();
      m.lineWidth = 3;
      m.stroke();
      m.fillRect(400, cy - 1.5, 64, 3);
      m.fillRect(536, cy - 1.5, 64, 3);
      m.restore();
    },
    { blind: true }
  );
}

/*
  The spine is drawn across its width (u runs from the back board's hinge
  to the front's) and down its length (v = 1 at the head), so the title
  is set rotated to read head to tail.
*/
export function spine(w, h, { year }) {
  return stamp(w, h, 31, (m) => {
    m.save();
    m.translate(w / 2, h * 0.36);
    m.rotate(Math.PI / 2);
    m.textAlign = "center";
    m.textBaseline = "middle";
    const size = w * 0.3;
    m.font = `italic 400 ${size}px ${FONTS.display}`;
    m.fillText("My Reading Journey", 0, 0);
    m.restore();

    m.save();
    m.translate(w / 2, h * 0.8);
    m.rotate(Math.PI / 2);
    m.textAlign = "center";
    m.textBaseline = "middle";
    m.font = `400 ${w * 0.2}px ${FONTS.mono}`;
    spaced(m, String(year), 0, 0, w * 0.06, "center");
    m.restore();

    // bands at head and tail
    m.fillRect(w * 0.12, h * 0.05, w * 0.76, Math.max(2, h * 0.0016));
    m.fillRect(w * 0.12, h * 0.95, w * 0.76, Math.max(2, h * 0.0016));
  });
}

// plain cloth for the board edges and turn-ins
export function plainCloth(w, h) {
  return makeCloth(w, h, 41, CLOTH);
}

/*
  The insides of the two boards: cloth turned over their edges, and the
  pastedowns (the endpapers glued over it) — inside the front board the
  title page, inside the back the last page, each laid against its hinge.
*/
export function boardInsides(titlePage, lastPage, boardW, boardH, pageW, pageH) {
  const scale = titlePage.width / pageW;
  const w = Math.round(boardW * scale);
  const h = Math.round(boardH * scale);
  // only a narrow turn-in shows round the pastedown, so the cloth is
  // woven no finer than the cover's own
  const cw = Math.min(w, 1024);
  const { canvas: cloth } = makeCloth(cw, Math.round((cw * h) / w), 53);

  const inside = (page, hingeLeft) => {
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.drawImage(cloth, 0, 0, w, h);
    const x = hingeLeft ? 0 : w - page.width;
    const y = Math.round((h - page.height) / 2);
    ctx.drawImage(page, x, y);
    // the pastedown's edge throws the faintest shadow on the turn-in
    ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
    ctx.lineWidth = Math.max(1, scale * 0.002);
    ctx.strokeRect(x, y, page.width, page.height);
    return c;
  };
  return { front: inside(titlePage, false), back: inside(lastPage, true) };
}

// the page block seen edge-on: hundreds of leaves, each a hair different
export function pageEdges() {
  const c = makeCanvas(64, 512);
  const ctx = c.getContext("2d");
  const rand = seededRandom(97);
  ctx.fillStyle = "#e6dcc6";
  ctx.fillRect(0, 0, 64, 512);
  for (let y = 0; y < 512; y += 2) {
    const v = rand();
    ctx.fillStyle = v > 0.5 ? `rgba(255, 250, 236, ${0.3 * v})` : `rgba(120, 96, 62, ${0.35 * (1 - v)})`;
    ctx.fillRect(0, y, 64, 1 + (rand() > 0.7 ? 1 : 0));
  }
  return c;
}

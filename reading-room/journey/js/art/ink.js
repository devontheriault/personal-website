/*
  Pen and brush. The hand-drawn marks in the Journal (Sketch lines,
  hatching, watercolour washes, stars, tallies, rules) are built from
  these few primitives so they share one hand.

  A pen stroke is drawn as a filled ribbon rather than a stroked path, so
  its width can swell and taper along its length the way a nib does.
*/

import { valueNoise } from "../util.js";

export const INK = "#2a201b";

// resample a polyline at a roughly even spacing
function resample(points, step) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / step));
    for (let j = 1; j <= n; j++) out.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n]);
  }
  return out;
}

/*
  A pen line through `points`.
    width     nib width in page units
    wobble    how far the hand drifts off the true line
    overshoot how far past each end the stroke runs (sketchers overshoot)
*/
export function penStroke(ctx, points, rand, opts = {}) {
  const {
    width = 2.2,
    wobble = 1.1,
    overshoot = 0,
    color = INK,
    alpha = 0.9,
    taper = 0.35,
  } = opts;
  if (points.length < 2) return;

  let pts = points.map((p) => [...p]);
  if (overshoot) {
    const extend = (a, b, d) => {
      const len = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      return [a[0] + ((a[0] - b[0]) / len) * d, a[1] + ((a[1] - b[1]) / len) * d];
    };
    pts[0] = extend(pts[0], pts[1], overshoot * (0.3 + rand()));
    const n = pts.length;
    pts[n - 1] = extend(pts[n - 1], pts[n - 2], overshoot * (0.3 + rand()));
  }
  pts = resample(pts, 5);

  const drift = valueNoise(Math.floor(rand() * 1e9));
  const pressure = valueNoise(Math.floor(rand() * 1e9));
  const phase = rand() * 100;
  const n = pts.length;
  const left = [];
  const right = [];

  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i];
    const [ax, ay] = pts[Math.max(0, i - 1)];
    const [bx, by] = pts[Math.min(n - 1, i + 1)];
    let tx = bx - ax;
    let ty = by - ay;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nx = -ty;
    const ny = tx;

    const u = i / (n - 1);
    const off = (drift(phase + i * 0.09) - 0.5) * 2 * wobble;
    const ends = Math.min(1, Math.min(u, 1 - u) / Math.max(taper, 1e-3) + 0.25);
    const w = (width * (0.7 + 0.6 * pressure(phase + i * 0.05)) * Math.min(1, ends)) / 2;

    const cx = px + nx * off;
    const cy = py + ny * off;
    left.push([cx + nx * w, cy + ny * w]);
    right.push([cx - nx * w, cy - ny * w]);
  }

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const [x, y] of left) ctx.lineTo(x, y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// a closed outline drawn as separate strokes, one per edge, each a little
// past its corners — how a quick sketch actually gets drawn
export function penPolygon(ctx, poly, rand, opts = {}) {
  for (let i = 0; i < poly.length; i++) {
    penStroke(ctx, [poly[i], poly[(i + 1) % poly.length]], rand, { overshoot: 5, ...opts });
  }
}

function tracePolygon(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
}

// parallel pen lines clipped to a polygon, for shading
export function hatch(ctx, poly, rand, opts = {}) {
  const { angle = -0.9, spacing = 9, width = 1.1, alpha = 0.55, jitter = 0.35 } = opts;
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const reach = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 10;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  ctx.save();
  tracePolygon(ctx, poly);
  ctx.clip();
  for (let d = -reach; d <= reach; d += spacing * (0.8 + rand() * 0.4)) {
    const ox = cx - dy * d;
    const oy = cy + dx * d;
    const a = reach * (1 - jitter * rand());
    const b = reach * (1 - jitter * rand());
    penStroke(ctx, [[ox - dx * a, oy - dy * a], [ox + dx * b, oy + dy * b]], rand, {
      width,
      wobble: 0.6,
      alpha,
      taper: 0.2,
    });
  }
  ctx.restore();
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// a polygon with its edges broken up, as a wash bleeds past a pencil line
function bleed(poly, rand, amount) {
  const pts = resample([...poly, poly[0]], 14);
  const noise = valueNoise(Math.floor(rand() * 1e9));
  const ph = rand() * 50;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return pts.map(([x, y], i) => {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const push = (noise(ph + i * 0.35) - 0.45) * amount;
    return [x + (dx / len) * push, y + (dy / len) * push];
  });
}

/*
  Watercolour: a few translucent layers, each a slightly different shape,
  pooling darker at their edges where the pigment dries. Then a sprinkle
  of granulation, clipped to the shape.
*/
export function wash(ctx, poly, color, rand, opts = {}) {
  const { alpha = 0.2, layers = 3, spread = 7, granulation = 0.5, loose = 0 } = opts;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  ctx.save();
  for (let l = 0; l < layers; l++) {
    // a loose wash misses the pencil lines: the first layer is shifted a
    // little off them, later layers pool smaller, toward one corner
    let shape = poly;
    if (loose) {
      const corner = poly[Math.floor(rand() * poly.length)];
      const k = l === 0 ? 1 : 0.7 + rand() * 0.25;
      const ax = l === 0 ? cx : corner[0];
      const ay = l === 0 ? cy : corner[1];
      const dx = (rand() - 0.5) * loose;
      const dy = (rand() - 0.5) * loose;
      shape = poly.map(([x, y]) => [ax + (x - ax) * k + dx, ay + (y - ay) * k + dy]);
    }
    // later layers are fainter and bleed further, so they read as pooled
    // pigment rather than as a second, smaller shape
    const later = loose && l > 0;
    shape = bleed(shape, rand, later ? spread * 2.4 : spread);
    ctx.fillStyle = rgba(color, alpha * (later ? 0.55 : 1) * (0.8 + rand() * 0.4));
    tracePolygon(ctx, shape);
    ctx.fill();
    // the tide line
    ctx.strokeStyle = rgba(color, alpha * 0.9);
    ctx.lineWidth = 1.6 + rand() * 1.2;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  if (granulation > 0) {
    tracePolygon(ctx, poly);
    ctx.clip();
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0;
    const h = Math.max(...ys) - y0;
    const count = Math.floor((w * h) / 60) * granulation;
    ctx.fillStyle = rgba(color, alpha * 0.9);
    for (let i = 0; i < count; i++) {
      const r = 0.5 + rand() * 1.3;
      ctx.fillRect(x0 + rand() * w, y0 + rand() * h, r, r);
    }
  }
  ctx.restore();
}

// a five-pointed star drawn in one go, the way stars get doodled
export function inkStar(ctx, cx, cy, r, filled, rand) {
  const pts = [];
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = (i % 2 ? r * 0.44 : r) * (0.94 + rand() * 0.12);
    pts.push([cx + Math.cos(a) * rr + (rand() - 0.5) * 1.2, cy + Math.sin(a) * rr + (rand() - 0.5) * 1.2]);
  }
  if (filled) {
    ctx.save();
    ctx.fillStyle = rgba(INK, 0.86);
    tracePolygon(ctx, pts.slice(0, 10));
    ctx.fill();
    ctx.restore();
  }
  penStroke(ctx, pts, rand, { width: 1.8, wobble: 0.35, alpha: filled ? 0.95 : 0.7, taper: 0.1 });
}

// a ruled line by hand: long, nearly straight, lighter at the ends
export function penRule(ctx, x0, x1, y, rand, opts = {}) {
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y + (rand() - 0.5) * 1.2]);
  penStroke(ctx, pts, rand, { width: 1.5, wobble: 0.8, taper: 0.3, alpha: 0.7, ...opts });
}

// tally marks, in gates of five
export function tally(ctx, x, y, count, rand, height = 30) {
  let cx = x;
  for (let i = 0; i < count; i++) {
    const inGate = i % 5;
    if (inGate === 4) {
      const gx0 = cx - 4 * 11 - 5;
      penStroke(ctx, [[gx0, y + height * 0.72], [cx - 1, y + height * 0.2]], rand, { width: 1.9, wobble: 0.5 });
      cx += 16;
      continue;
    }
    const lean = (rand() - 0.5) * 3;
    penStroke(ctx, [[cx + lean, y + (rand() - 0.5) * 3], [cx - lean, y + height + (rand() - 0.5) * 3]], rand, {
      width: 2,
      wobble: 0.4,
    });
    cx += 11;
  }
  return cx;
}

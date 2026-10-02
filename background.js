// Ambient backdrop: a faint dot grid and two line series that reshape as the page scrolls,
// with a crosshair that tracks how far down the page you are. Decorative only.
const canvas = document.createElement('canvas');
canvas.className = 'backdrop';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);
const ctx = canvas.getContext('2d');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const darkScheme = matchMedia('(prefers-color-scheme: dark)');

const SPACING = 28; // dot grid pitch, px
let W = 0, H = 0, colors = {};
let current = scrollY, target = scrollY, running = false;
const plots = document.querySelectorAll('.viz__plot');

// 0 when no chart is on screen, 1 once most of one is visible: the backdrop steps back so it never reads as data.
function quietness() {
  let most = 0;
  for (const p of plots) {
    const r = p.getBoundingClientRect();
    const visible = Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0));
    if (r.height) most = Math.max(most, visible / Math.min(r.height, H));
  }
  return Math.min(1, most * 1.5);
}

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  colors = { bg: v('--bg'), ink: v('--ink'), dots: v('--axis'), accent: v('--s1'), dark: darkScheme.matches };
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Smooth pseudo-random series: a few sines whose phases are driven by scroll.
function series(x, t, seed, base, amp) {
  const u = x / W;
  const y =
    0.55 * Math.sin(u * 5.1 + t * 1.15 + seed) +
    0.3 * Math.sin(u * 11.3 - t * 0.7 + seed * 2.3) +
    0.15 * Math.sin(u * 23.7 + t * 1.9 + seed * 0.7);
  return base + amp * y;
}

function draw(scroll) {
  ctx.clearRect(0, 0, W, H);
  const docH = document.documentElement.scrollHeight - H;
  const progress = docH > 0 ? Math.min(1, Math.max(0, scroll / docH)) : 0;
  const t = scroll / 650;
  const amp = H * 0.11;
  const baseA = H * (0.66 + 0.06 * Math.sin(t * 0.35));
  const baseB = H * (0.34 + 0.05 * Math.cos(t * 0.3));
  const step = 8;
  const q = quietness();
  const fade = 1 - 0.9 * q; // lines, wash and crosshair
  const dotFade = 1 - 0.5 * q;

  // sample both lines once per column
  const pts = [];
  for (let x = -step; x <= W + step; x += step) {
    pts.push([x, series(x, t, 1.7, baseA, amp), series(x, t * 0.8, 4.2, baseB, amp * 0.8)]);
  }
  const lineAAt = (x) => {
    const i = Math.min(pts.length - 2, Math.max(0, Math.floor((x + step) / step)));
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  };

  // dot grid, drifting slower than the page; dots near the accent line light up a little
  const offset = -((scroll * 0.3) % SPACING);
  ctx.fillStyle = colors.dots;
  for (let x = SPACING / 2; x < W; x += SPACING) {
    const ly = lineAAt(x);
    for (let y = offset; y < H + SPACING; y += SPACING) {
      const near = Math.max(0, 1 - Math.abs(y - ly) / 90);
      ctx.globalAlpha = ((colors.dark ? 0.32 : 0.45) + near * 0.4 * fade) * dotFade;
      const r = 0.8 + near * 0.7 * fade;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  // soft wash under the accent line
  const grad = ctx.createLinearGradient(0, baseA - amp, 0, H);
  grad.addColorStop(0, colors.accent);
  grad.addColorStop(1, 'transparent');
  ctx.globalAlpha = (colors.dark ? 0.07 : 0.05) * fade;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], H);
  for (const [x, ya] of pts) ctx.lineTo(x, ya);
  ctx.lineTo(pts.at(-1)[0], H);
  ctx.closePath();
  ctx.fill();

  // the two lines
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = (colors.dark ? 0.12 : 0.1) * fade;
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  pts.forEach(([x, , yb], i) => (i ? ctx.lineTo(x, yb) : ctx.moveTo(x, yb)));
  ctx.stroke();

  ctx.globalAlpha = (colors.dark ? 0.4 : 0.3) * fade;
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pts.forEach(([x, ya], i) => (i ? ctx.lineTo(x, ya) : ctx.moveTo(x, ya)));
  ctx.stroke();

  // crosshair at the reader's position in the page
  const cx = W * (0.06 + 0.88 * progress);
  const cy = lineAAt(cx);
  ctx.globalAlpha = (colors.dark ? 0.16 : 0.12) * fade;
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(cx) + 0.5, 0);
  ctx.lineTo(Math.round(cx) + 0.5, H);
  ctx.stroke();
  ctx.globalAlpha = 0.6 * fade;
  ctx.fillStyle = colors.bg;
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = (colors.dark ? 0.7 : 0.55) * fade;
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Ease toward the scroll position so the shapes glide rather than jump.
function tick() {
  current += (target - current) * 0.12;
  if (Math.abs(target - current) < 0.5) current = target;
  draw(current);
  running = current !== target;
  if (running) requestAnimationFrame(tick);
}

function onScroll() {
  target = scrollY;
  if (reduceMotion.matches) return;
  if (!running) { running = true; requestAnimationFrame(tick); }
}

function redraw() {
  resize();
  readColors();
  current = target = scrollY;
  draw(reduceMotion.matches ? 0 : current);
}

addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', redraw);
darkScheme.addEventListener('change', redraw);
reduceMotion.addEventListener('change', redraw);
document.fonts?.ready.then(redraw); // page height settles once fonts load
redraw();

import { LAND, LAND_STEP, MERGES, ORCH_COMMITS, AGREEMENTS, VISITOR_CITIES, VISITOR_STATS, BOOKS } from './data.js';

// ---------- helpers ----------
const NS = 'http://www.w3.org/2000/svg';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const num = new Intl.NumberFormat('en-US');
const TZ = 'America/Halifax';
const fmtDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
const fmtDayTime = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ });
const fmtIsoDay = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ });
const fmtMonthYear = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const fmtDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function svgEl(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function label(parent, x, y, text, cls = 'ax-text', anchor = 'start') {
  const t = svgEl('text', { x, y, class: cls, 'text-anchor': anchor }, parent);
  t.textContent = text;
  return t;
}
// Left/right inset that lines chart content up with the page's .wrap column.
function wrapInset(width) {
  const vw = document.documentElement.clientWidth;
  return Math.max(0, (width - Math.min(width, 76 * 16)) / 2) + clamp(0.04 * vw, 20, 40);
}
function duration(seconds) {
  const m = seconds / 60;
  if (m < 60) return `${Math.max(1, Math.round(m))} min`;
  const h = m / 60;
  if (h < 48) return `${h < 10 ? h.toFixed(1) : Math.round(h)} hours`;
  return `${(h / 24).toFixed(1)} days`;
}
function monthsBetween(a, b) {
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  const y = Math.floor(months / 12), mo = months % 12;
  return [y && `${y} yr${y > 1 ? 's' : ''}`, mo && `${mo} mo${mo > 1 ? 's' : ''}`].filter(Boolean).join(' ') || '< 1 mo';
}

// ---------- tooltip ----------
const tip = document.querySelector('.tip');
function showTip(at, lead, lines) {
  tip.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = lead;
  tip.append(strong);
  for (const line of lines) {
    const row = document.createElement('div');
    if (line.key) {
      const k = document.createElement('span');
      k.className = 'key';
      k.style.background = line.key;
      row.append(k);
    }
    row.append(document.createTextNode(line.text ?? line));
    tip.append(row);
  }
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = at.x + 14, y = at.y + 14;
  if (x + r.width > innerWidth - 8) x = at.x - r.width - 14;
  if (y + r.height > innerHeight - 8) y = at.y - r.height - 14;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
const hideTip = () => { tip.hidden = true; };
// Tooltip anchor for keyboard focus: just above the element.
const anchorOf = (node) => { const b = node.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top - 10 }; };

// ---------- chart shell ----------
// impl: { build(svg, w, h), update(p), hover(x, y, client) , step(dir) }
const charts = [];
function mountChart(plot, impl, progress) {
  const svg = svgEl('svg', { 'aria-hidden': 'true', focusable: 'false' }, plot);
  const state = { p: reduceMotion ? 1 : 0, size: null };
  const rebuild = () => {
    if (!state.size) return;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${state.size.w} ${state.size.h}`);
    impl.build(svg, state.size.w, state.size.h);
    impl.update(state.p);
  };
  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width), h = Math.round(entry.contentRect.height);
    if (!w || !h || (state.size && state.size.w === w && state.size.h === h)) return;
    state.size = { w, h };
    rebuild();
  }).observe(plot);

  const onPointer = (e) => {
    const r = plot.getBoundingClientRect();
    impl.hover(e.clientX - r.left, e.clientY - r.top, { x: e.clientX, y: e.clientY });
  };
  plot.addEventListener('pointermove', onPointer);
  plot.addEventListener('pointerdown', onPointer);
  plot.addEventListener('pointerleave', () => { impl.hover(null); hideTip(); });
  plot.addEventListener('blur', () => { impl.hover(null); hideTip(); });
  plot.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { impl.step(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { impl.step(-1); e.preventDefault(); }
    else if (e.key === 'Escape') { impl.hover(null); hideTip(); }
  });

  const chart = {
    progress,
    rebuild,
    set(p) {
      if (Math.abs(p - state.p) < 0.0005) return;
      state.p = p;
      if (state.size) impl.update(p);
    },
  };
  charts.push(chart);
  return chart;
}

// ---------- scroll progress ----------
const NAV_H = 64;
function storyProgress(story) {
  const pin = story.querySelector('.story__pin');
  const plot = story.querySelector('.viz__plot');
  return () => {
    const vh = innerHeight;
    if (getComputedStyle(pin).position === 'sticky') {
      // Start as the section rises into view and finish a little past halfway through the pinned
      // stretch, so the finished chart and its total hold on screen before moving on.
      const r = story.getBoundingClientRect();
      const pinned = r.height - (vh - NAV_H);
      const start = vh * 0.7;
      return clamp((start - r.top) / (start - NAV_H + pinned * 0.575));
    }
    return plotProgress(plot)();
  };
}
function plotProgress(plot) {
  return () => {
    // Grow as the chart scrolls up the screen and finish a little after it's fully in view,
    // while the number above it is still visible.
    const r = plot.getBoundingClientRect();
    const vh = innerHeight;
    const start = vh * 0.9425, end = Math.max(NAV_H, vh * 0.8175 - r.height * 0.95);
    return clamp((start - r.top) / (start - end));
  };
}

const readout = (k) => document.querySelector(`[data-readout="${k}"]`);

// =====================================================================
// 01 Orchestrate: every agent-branch merge as an arc off main
// =====================================================================
function orchestrateChart() {
  const N = MERGES.length;
  const mergeTimes = MERGES.map((m) => m[1]);
  const forkIndex = (ts) => { // merges already on main when this branch was cut
    let lo = 0, hi = N;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (mergeTimes[mid] <= ts) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const countEl = readout('orch-count'), labelEl = readout('orch-label');
  // commits on main, as GitHub counts them, once each merge has landed; the full total at the end
  const commitsBy = [0, ...MERGES.slice(0, -1).map((m) => m[5]), ORCH_COMMITS];
  let arcs = [], drawn = [], marks = [], arcGroup, head, mainLine, geo, hot = -1, shown = 0;

  return {
    build(svg, W, H) {
      // y-axis sits in its own band on the left; the arcs start to the right of it
      const axisX = 52, x0 = axisX + 6, x1 = W - 16, base = H - 30, top = 30;
      const step = (x1 - x0) / N;
      const maxLog = 4; // 10k lines
      const height = (lines) => 4 + (Math.log10(Math.max(1, lines)) / maxLog) * (base - top - 4);
      geo = { x0, x1, step, base };

      svgEl('line', { x1: axisX, x2: axisX, y1: top, y2: base, class: 'axis-line' }, svg);
      label(svg, 16, top - 14, 'Lines added', 'ax-text ax-text--strong');
      for (const [v, t] of [[1, '1'], [10, '10'], [100, '100'], [1000, '1k'], [10000, '10k']]) {
        const y = base - height(v);
        if (v > 1) svgEl('line', { x1: x0, x2: x1, y1: y, y2: y, class: 'gridline' }, svg);
        svgEl('line', { x1: axisX - 4, x2: axisX, y1: y, y2: y, class: 'axis-line' }, svg);
        label(svg, axisX - 8, y + 4, t, 'ax-text', 'end');
      }

      // day ticks, with a label wherever the day's span has room
      const days = [];
      MERGES.forEach((m, i) => {
        const d = fmtIsoDay.format(new Date(m[1] * 1000));
        if (!days.length || days.at(-1).d !== d) days.push({ d, a: i, b: i, t: m[1] });
        else days.at(-1).b = i;
      });
      const peak = days.reduce((a, b) => (b.b - b.a > a.b - a.a ? b : a));
      for (const day of days) {
        const xa = x0 + day.a * step, xb = x0 + (day.b + 1) * step, span = xb - xa;
        if (day.a > 0) svgEl('line', { x1: xa, x2: xa, y1: base + 2, y2: base + 8, class: 'gridline' }, svg);
        const name = fmtDay.format(new Date(day.t * 1000));
        if (day === peak && span > 150) {
          label(svg, (xa + xb) / 2, base + 21, `${name} · ${day.b - day.a + 1} merges`, 'ax-text ax-text--strong', 'middle');
        } else if (span > 46) {
          label(svg, (xa + xb) / 2, base + 21, name, 'ax-text', 'middle');
        }
      }

      arcGroup = svgEl('g', { class: 'arcs' }, svg);
      marks = [];
      arcs = MERGES.map(([fork, merge, lines, , commits], i) => {
        const xe = x0 + (i + 0.5) * step;
        const xs = Math.min(x0 + forkIndex(fork) * step, xe - 3);
        const c = base - height(lines) * (4 / 3);
        const arc = svgEl('path', {
          d: `M${xs.toFixed(1)},${base} C${xs.toFixed(1)},${c.toFixed(1)} ${xe.toFixed(1)},${c.toFixed(1)} ${xe.toFixed(1)},${base}`,
          class: 'arc', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1,
        }, arcGroup);
        // each commit sits on the arc where its time falls between fork and merge
        for (const [t, added] of commits) {
          const f = clamp((t - fork) / Math.max(1, merge - fork));
          let lo = 0, hi = 1; // the curve's x runs 3u² - 2u³ of the way across
          for (let k = 0; k < 20; k++) { const u = (lo + hi) / 2; if (3 * u * u - 2 * u * u * u < f) lo = u; else hi = u; }
          const u = (lo + hi) / 2;
          const r = 1.5 + Math.log10(Math.max(1, added)) * 0.75;
          marks.push({ i, u, el: svgEl('circle', {
            cx: (xs + (xe - xs) * (3 * u * u - 2 * u * u * u)).toFixed(1),
            cy: (base + (c - base) * 3 * u * (1 - u)).toFixed(1), r: r.toFixed(1), class: 'commit',
          }, arcGroup) });
        }
        return arc;
      });
      drawn = arcs.map(() => -1);

      mainLine = svgEl('line', { x1: x0, x2: x0, y1: base, y2: base, class: 'baseline' }, svg);
      head = svgEl('circle', { cx: x0, cy: base, r: 4.5, class: 'hub' }, svg);
      hot = -1;
    },
    update(p) {
      const g = p * N;
      arcs.forEach((arc, i) => {
        const q = Math.round(clamp(g - i) * 100) / 100;
        if (q !== drawn[i]) { arc.setAttribute('stroke-dashoffset', 1 - q); drawn[i] = q; }
      });
      for (const m of marks) m.el.classList.toggle('is-on', drawn[m.i] >= m.u);
      const x = geo.x0 + clamp(g / N) * (geo.x1 - geo.x0);
      mainLine.setAttribute('x2', x);
      head.setAttribute('cx', x);
      head.style.opacity = p > 0 ? 1 : 0;
      shown = Math.min(N, Math.floor(g + 0.001));
      countEl.textContent = num.format(commitsBy[shown]);
      labelEl.textContent = shown
        ? `commits on main, through ${fmtDay.format(new Date(MERGES[shown - 1][1] * 1000))}`
        : 'commits on main';
      if (hot >= shown) this.hover(null);
    },
    hover(x, y, client) {
      if (x == null) { this.highlight(-1); return; }
      const i = clamp(Math.floor((x - geo.x0) / geo.step), 0, N - 1);
      if (i >= shown) { this.highlight(-1); hideTip(); return; }
      this.highlight(i, client);
    },
    step(dir) {
      if (!shown) return;
      this.highlight(hot < 0 ? (dir > 0 ? 0 : shown - 1) : clamp(hot + dir, 0, shown - 1));
    },
    highlight(i, client) {
      if (hot >= 0) arcs[hot]?.classList.remove('is-hot');
      for (const m of marks) m.el.classList.toggle('is-hot', m.i === i);
      hot = i;
      arcGroup.classList.toggle('has-hot', i >= 0);
      if (i < 0) return;
      arcs[i].classList.add('is-hot');
      const [fork, merge, lines, id, commits] = MERGES[i];
      showTip(client ?? anchorOf(arcs[i]), `+${num.format(lines)} lines`, [
        `agent-${id}`,
        `Merged ${fmtDayTime.format(new Date(merge * 1000))}`,
        `Branch open ${duration(merge - fork)} · ${commits.length} commit${commits.length === 1 ? '' : 's'}`,
      ]);
    },
  };
}

// =====================================================================
// 02 Tracking Canada's Agreements: one dot per agreement, by month
// =====================================================================
const TYPES = ['Security', 'Economic', 'Strategic Partnership', 'Technology', 'Resources'];
const typeColor = (t) => `var(--s${TYPES.indexOf(t) + 1})`;

function agreementsChart() {
  const N = AGREEMENTS.length;
  const first = new Date(AGREEMENTS[0][0] + 'T00:00:00Z');
  const last = new Date(AGREEMENTS.at(-1)[0] + 'T00:00:00Z');
  const months = [];
  for (let d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)); d <= last; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(new Date(d));
  const monthKey = (iso) => iso.slice(0, 7);
  const keyOf = (d) => d.toISOString().slice(0, 7);

  // stack each month bottom-up by type, then date; remember chronological rank for reveal order
  const byMonth = new Map(months.map((m) => [keyOf(m), []]));
  AGREEMENTS.forEach((a, rank) => byMonth.get(monthKey(a[0])).push({ a, rank }));
  for (const list of byMonth.values()) list.sort((p, q) => TYPES.indexOf(p.a[1]) - TYPES.indexOf(q.a[1]) || p.rank - q.rank);
  const maxStack = Math.max(...[...byMonth.values()].map((l) => l.length));

  // legend: identity is never colour-alone, so every swatch has its name and total
  const legend = document.querySelector('[data-legend="vg"]');
  for (const t of TYPES) {
    const item = document.createElement('span');
    const sw = document.createElement('i');
    sw.style.background = typeColor(t);
    const b = document.createElement('b');
    b.textContent = AGREEMENTS.filter((a) => a[1] === t).length;
    item.append(sw, document.createTextNode(t + ' '), b);
    legend.append(item);
  }

  const countEl = readout('vg-count'), labelEl = readout('vg-label');
  let dots = [], on = [], hot = null, shown = 0;

  return {
    build(svg, W, H) {
      const inset = wrapInset(W);
      const left = inset, right = W - inset, base = H - 36;
      const band = (right - left) / months.length;
      const pitch = Math.min((base - 6) / maxStack, band * 0.85, 20);
      const r = clamp(pitch / 2 - 1.5, 2.5, 8);

      svgEl('line', { x1: left, x2: right, y1: base + 0.5, y2: base + 0.5, class: 'gridline' }, svg);
      const every = Math.ceil(34 / band);
      months.forEach((m, i) => {
        const cx = left + (i + 0.5) * band;
        const isJan = m.getUTCMonth() === 0;
        if (i % every === 0 || isJan) label(svg, cx, base + 16, fmtMonth.format(m), 'ax-text', 'middle');
        if (i === 0 || isJan) label(svg, cx, base + 30, String(m.getUTCFullYear()), 'ax-text ax-text--strong', 'middle');
      });

      dots = new Array(N);
      months.forEach((m, i) => {
        const cx = left + (i + 0.5) * band;
        byMonth.get(keyOf(m)).forEach(({ a, rank }, j) => {
          const c = svgEl('circle', { cx, cy: base - (j + 0.5) * pitch, r, class: 'dot' }, svg);
          c.style.fill = typeColor(a[1]);
          c.style.transitionDelay = `${(j % 6) * 18}ms`;
          dots[rank] = c;
        });
      });
      on = dots.map(() => false);
      hot = null;
    },
    update(p) {
      shown = Math.min(N, Math.floor(p * N + 0.001));
      dots.forEach((d, k) => {
        const v = k < shown;
        if (v !== on[k]) { d.classList.toggle('is-on', v); on[k] = v; }
      });
      countEl.textContent = num.format(shown);
      labelEl.textContent = shown
        ? `agreements, ${fmtMonthYear.format(first)} to ${fmtMonthYear.format(new Date(AGREEMENTS[shown - 1][0] + 'T00:00:00Z'))}`
        : 'agreements tracked';
      if (hot != null && hot >= shown) this.hover(null);
    },
    hover(x, y, client) {
      if (x == null) { this.highlight(null); return; }
      let best = null, bestD = 22 * 22;
      for (let k = 0; k < shown; k++) {
        const dx = +dots[k].getAttribute('cx') - x, dy = +dots[k].getAttribute('cy') - y, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best == null) { this.highlight(null); hideTip(); return; }
      this.highlight(best, client);
    },
    step(dir) {
      if (!shown) return;
      this.highlight(hot == null ? (dir > 0 ? 0 : shown - 1) : clamp(hot + dir, 0, shown - 1));
    },
    highlight(k, client) {
      if (hot != null) dots[hot]?.classList.remove('is-hot');
      hot = k;
      if (k == null) return;
      dots[k].classList.add('is-hot');
      const [date, type, name, countries] = AGREEMENTS[k];
      showTip(client ?? anchorOf(dots[k]), name, [
        { key: typeColor(type), text: type },
        fmtDate.format(new Date(date + 'T00:00:00Z')),
        countries,
      ]);
    },
  };
}

// =====================================================================
// 03 Who Touched My Server: visitor cities, routed back to Halifax
// =====================================================================
const HALIFAX = [-63.57, 44.65];
// Equal Earth projection (Šavrič, Patterson & Jenny, 2018)
function equalEarth(lon, lat) {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const lam = (lon * Math.PI) / 180, phi = (lat * Math.PI) / 180;
  const l = Math.asin(M * Math.sin(phi)), l2 = l * l, l6 = l2 * l2 * l2;
  return [
    (lam * Math.cos(l)) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2))),
    l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2)),
  ];
}

function visitorsChart() {
  let cities = [], routes = [], bubbles = [], labels = [], drawn = [], on = [], hot = null, shown = 0, N = 0;

  const setData = (rows) => {
    cities = rows
      .map(([city, country, count, lat, lng]) => ({ city, country, count, lat, lng }))
      .sort((a, b) => b.count - a.count);
    N = cities.length;
  };
  setData(VISITOR_CITIES);

  return {
    setData,
    build(svg, W, H) {
      const pad = 6;
      const xMax = equalEarth(180, 0)[0], yTop = equalEarth(0, 80)[1], yBot = equalEarth(0, -56)[1];
      const k = Math.min((W - 2 * pad) / (2 * xMax), (H - 2 * pad) / (yTop - yBot));
      const oy = pad + (H - 2 * pad - k * (yTop - yBot)) / 2 + k * yTop;
      const project = (lon, lat) => { const [x, y] = equalEarth(lon, lat); return [W / 2 + k * x, oy - k * y]; };

      // land as a dot grid: one path, round caps on zero-length segments
      const spacing = project(LAND_STEP, 0)[0] - project(0, 0)[0];
      let d = '';
      for (const [lat, idxs] of LAND) {
        for (const i of idxs) {
          const [x, y] = project(-180 + (i + 0.5) * LAND_STEP, lat);
          d += `M${x.toFixed(1)} ${y.toFixed(1)}h0`;
        }
      }
      svgEl('path', { d, class: 'land', 'stroke-width': Math.max(1.4, spacing * 0.48).toFixed(2) }, svg);

      const hub = project(...HALIFAX);
      const routeGroup = svgEl('g', {}, svg);
      const cityGroup = svgEl('g', {}, svg);
      const labelGroup = svgEl('g', {}, svg);
      const max = cities[0]?.count || 1;
      const rMax = clamp(W / 55, 7, 22);

      routes = []; bubbles = []; labels = [];
      cities.forEach((c, i) => {
        const [x, y] = project(c.lng, c.lat);
        const dx = hub[0] - x, dy = hub[1] - y, dist = Math.hypot(dx, dy);
        if (dist > 4) {
          // bow each route upward, more for longer hops
          let nx = -dy / dist, ny = dx / dist;
          if (ny > 0) { nx = -nx; ny = -ny; }
          const cx = (x + hub[0]) / 2 + nx * dist * 0.28, cy = (y + hub[1]) / 2 + ny * dist * 0.28;
          routes[i] = svgEl('path', {
            d: `M${x.toFixed(1)},${y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${hub[0].toFixed(1)},${hub[1].toFixed(1)}`,
            class: 'route', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1,
          }, routeGroup);
        }
        c.x = x; c.y = y; c.r = Math.max(2.5, Math.sqrt(c.count / max) * rMax);
      });
      // biggest first, so small circles sit on top
      cities.forEach((c, i) => { bubbles[i] = svgEl('circle', { cx: c.x, cy: c.y, r: c.r, class: 'city' }, cityGroup); });

      svgEl('circle', { cx: hub[0], cy: hub[1], r: 5, class: 'hub-pulse' }, svg);
      svgEl('circle', { cx: hub[0], cy: hub[1], r: 5, class: 'hub' }, svg);
      const home = cities.find((c) => c.city === 'Halifax');
      const hubLabel = label(svg, hub[0], hub[1] + (home ? home.r : 5) + 14, 'Halifax', 'ax-text ax-text--strong', 'middle');

      // selective direct labels: the busiest cities other than home, skipping any that would collide
      const boxes = [hubLabel.getBBox()];
      const overlaps = (a, b) => a.x < b.x + b.width + 4 && b.x < a.x + a.width + 4 && a.y < b.y + b.height && b.y < a.y + a.height;
      for (const c of cities.filter((c) => c.city !== 'Halifax').slice(0, 5)) {
        const t = label(labelGroup, c.x, c.y - c.r - 6, c.city, 'ax-text ax-text--strong', 'middle');
        const box = t.getBBox();
        if (boxes.some((b) => overlaps(b, box))) { t.remove(); continue; }
        boxes.push(box);
        t.style.transition = 'opacity .3s';
        labels.push({ t, i: cities.indexOf(c) });
        if (labels.length === 3) break;
      }

      drawn = cities.map(() => -1);
      on = cities.map(() => false);
      hot = null;
    },
    update(p) {
      const g = p * (N + 1);
      shown = 0;
      cities.forEach((c, i) => {
        const q = Math.round(clamp((g - i) * 1.5) * 100) / 100;
        if (routes[i] && q !== drawn[i]) { routes[i].setAttribute('stroke-dashoffset', 1 - q); drawn[i] = q; }
        const v = q > 0.05;
        if (v !== on[i]) { bubbles[i].classList.toggle('is-on', v); on[i] = v; }
        if (v) shown = i + 1;
      });
      for (const { t, i } of labels) t.style.opacity = on[i] ? 1 : 0;
      if (hot != null && !on[hot]) this.hover(null);
    },
    hover(x, y, client) {
      if (x == null) { this.highlight(null); return; }
      let best = null, bestD = Infinity;
      cities.forEach((c, i) => {
        if (!on[i]) return;
        const d = Math.hypot(c.x - x, c.y - y) - c.r;
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best == null || bestD > 14) { this.highlight(null); hideTip(); return; }
      this.highlight(best, client);
    },
    step(dir) {
      if (!shown) return;
      this.highlight(hot == null ? (dir > 0 ? 0 : shown - 1) : clamp(hot + dir, 0, shown - 1));
    },
    highlight(i, client) {
      if (hot != null) bubbles[hot]?.classList.remove('is-hot');
      hot = i;
      if (i == null) return;
      bubbles[i].classList.add('is-hot');
      const c = cities[i];
      showTip(client ?? anchorOf(bubbles[i]), `${num.format(c.count)} visits`, [`${c.city}, ${c.country}`]);
    },
  };
}

// =====================================================================
// About: career timeline that fills in as you scroll
// =====================================================================
const NOW = new Date(Date.UTC(2026, 9, 1));
const ym = (s) => new Date(s + '-01T00:00:00Z');
const CAREER = [
  { org: 'Nova Scotia Community College', segs: [{ role: 'Data Analytics', start: ym('2016-09'), end: ym('2019-04') }] },
  { org: 'Kinduct Technologies', segs: [
    { role: 'Junior Tableau Developer', start: ym('2019-10'), end: ym('2020-01') },
    { role: 'Tableau Developer', start: ym('2020-01'), end: ym('2022-07') },
  ] },
  { org: 'Irving Shipbuilding', segs: [{ role: 'Supply Chain Performance Analyst', start: ym('2022-07'), end: ym('2023-02') }] },
  { org: 'Dentalcorp', segs: [
    { role: 'Data Analyst', start: ym('2023-02'), end: ym('2025-12') },
    { role: 'Senior Data Analyst', start: ym('2025-12'), end: NOW, now: true },
  ] },
];

function careerChart() {
  const t0 = ym('2016-01'), t1 = ym('2027-01');
  const segs = CAREER.flatMap((row, r) => row.segs.map((s) => ({ ...s, org: row.org, row: r })));
  let X, clipRect, cursor, cursorText, rowLabels = [], bars = [], geo, hot = null;

  return {
    build(svg, W, H) {
      const inset = wrapInset(W);
      const left = inset, right = W - inset, axisY = H - 22, top = 22;
      const rowH = (axisY - top) / CAREER.length;
      X = (d) => left + ((d - t0) / (t1 - t0)) * (right - left);
      geo = { left, right, rowH, axisY, top };

      const yearStep = right - left < 560 ? 2 : 1;
      for (let y = 2016; y <= 2027; y++) {
        const x = X(ym(`${y}-01`));
        svgEl('line', { x1: x, x2: x, y1: top, y2: axisY, class: 'gridline' }, svg);
        if ((y - 2016) % yearStep === 0 && y < 2027) label(svg, x + 4, axisY + 16, String(y), 'ax-text');
      }

      const clipId = 'career-clip';
      const clip = svgEl('clipPath', { id: clipId }, svgEl('defs', {}, svg));
      clipRect = svgEl('rect', { x: 0, y: 0, width: 0, height: H }, clip);
      const barGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);

      rowLabels = [];
      bars = segs.map((s) => {
        const y = top + s.row * rowH + rowH - 22;
        const x = X(s.start) + 1, w = Math.max(2, X(s.end) - X(s.start) - 2); // 2px surface gap between segments
        return svgEl('rect', { x, y, width: w, height: 12, rx: 3, class: s.now ? 'bar bar--now' : 'bar' }, barGroup);
      });
      CAREER.forEach((row, r) => {
        const y = top + r * rowH + rowH - 30;
        const xs = X(row.segs[0].start);
        const text = `${row.org} · ${row.segs.map((s) => s.role).join(' → ')}`;
        const t = label(svg, xs, y, text, 'ax-text ax-text--strong');
        // narrow screens: fall back to the organization (roles stay in the tooltip and table)
        if (t.getComputedTextLength() > right - left) t.textContent = row.org;
        if (xs + t.getComputedTextLength() > right) { t.setAttribute('x', right); t.setAttribute('text-anchor', 'end'); }
        t.style.transition = 'opacity .35s';
        rowLabels.push({ t, start: row.segs[0].start });
      });

      cursor = svgEl('line', { x1: left, x2: left, y1: top - 4, y2: axisY, class: 'cursor' }, svg);
      cursorText = label(svg, left, top - 9, '', 'ax-text ax-text--strong', 'middle');
      hot = null;
    },
    update(p) {
      const t = new Date(+t0 + p * (NOW - t0));
      const x = X(t);
      clipRect.setAttribute('width', x);
      cursor.setAttribute('x1', x);
      cursor.setAttribute('x2', x);
      cursor.style.opacity = p > 0 && p < 1 ? 1 : 0;
      cursorText.setAttribute('x', x);
      cursorText.textContent = p >= 1 ? '' : String(t.getUTCFullYear());
      cursorText.style.opacity = p > 0 && p < 1 ? 1 : 0;
      for (const l of rowLabels) l.t.style.opacity = t >= l.start ? 1 : 0.25;
    },
    hover(x, y, client) {
      if (x == null) { this.highlight(null); return; }
      const i = segs.findIndex((s) => {
        const ly = geo.top + s.row * geo.rowH + geo.rowH - 30;
        return y >= ly - 12 && y <= ly + 30 && x >= X(s.start) - 4 && x <= X(s.end) + 4 && x <= +clipRect.getAttribute('width');
      });
      if (i < 0) { this.highlight(null); hideTip(); return; }
      this.highlight(i, client);
    },
    step(dir) { this.highlight(hot == null ? (dir > 0 ? 0 : segs.length - 1) : clamp(hot + dir, 0, segs.length - 1)); },
    highlight(i, client) {
      if (hot != null) bars[hot]?.classList.remove('is-hot');
      hot = i;
      if (i == null) return;
      bars[i].classList.add('is-hot');
      const s = segs[i];
      showTip(client ?? anchorOf(bars[i]), s.role, [
        s.org,
        `${fmtMonthYear.format(s.start)} – ${s.now ? 'now' : fmtMonthYear.format(s.end)} · ${monthsBetween(s.start, s.end)}`,
      ]);
    },
  };
}

// =====================================================================
// 04 Reading Room: this year's books as a shelf of spines
// =====================================================================
const fmtMonthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const isoDate = (s) => new Date(s + 'T00:00:00Z');

function booksChart() {
  const N = BOOKS.length;
  const total = BOOKS.reduce((sum, b) => sum + b[3], 0);
  const countEl = readout('books-count'), labelEl = readout('books-label');
  let spines = [], on = [], hot = null, shown = 0;

  return {
    build(svg, W, H) {
      const inset = wrapInset(W);
      const left = inset, right = W - inset, base = H - 34, top = 34;
      const X = (pages) => left + (pages / total) * (right - left);
      const height = (rating) => (base - top) * (0.4 + 0.12 * rating); // 5 stars fills the height

      // the shelf is the x-axis: cumulative pages read
      const tickStep = right - left < 520 ? 5000 : 2000;
      for (let v = 0; v <= total; v += tickStep) {
        const x = X(v);
        svgEl('line', { x1: x, x2: x, y1: base + 2, y2: base + 7, class: 'axis-line' }, svg);
        const last = v + tickStep > total;
        const t = label(svg, x, base + 20, last ? `${num.format(v)} pages` : num.format(v), 'ax-text', v === 0 ? 'start' : 'middle');
        if (last && x + t.getComputedTextLength() / 2 > right) t.setAttribute('text-anchor', 'end');
      }

      // month markers along the top, where each month's reading begins
      let acc = 0, lastX = -Infinity;
      const monthStart = new Map();
      for (const b of BOOKS) {
        const m = b[0].slice(0, 7);
        if (!monthStart.has(m)) monthStart.set(m, acc);
        acc += b[3];
      }
      for (const [m, pages] of monthStart) {
        const x = X(pages);
        svgEl('line', { x1: x, x2: x, y1: top - 14, y2: top - 8, class: 'axis-line' }, svg);
        if (x - lastX > 30) {
          label(svg, x + 3, top - 18, fmtMonth.format(isoDate(m + '-01')), 'ax-text');
          lastX = x;
        }
      }

      acc = 0;
      spines = BOOKS.map(([date, title, , pages, rating, , fav, cover, ink], i) => {
        const x = X(acc) + 1, w = Math.max(1, X(acc + pages) - X(acc) - 2), h = height(rating);
        acc += pages;
        const g = svgEl('g', { class: 'spine' }, svg);
        g.style.setProperty('--c', cover);
        g.style.transitionDelay = `${(i % 4) * 30}ms`;
        svgEl('rect', { x, y: base - h, width: w, height: h, rx: Math.min(2, w / 3) }, g);
        if (fav) svgEl('circle', { cx: x + w / 2, cy: base - h - 7, r: 2.5, class: 'fav' }, g);
        // title on the spine only when it fits; otherwise it lives in the tooltip
        if (w >= 13) {
          const t = svgEl('text', { class: 'spine-text', transform: `translate(${(x + w / 2 + 3.5).toFixed(1)},${base - 8}) rotate(-90)` }, g);
          t.textContent = title;
          t.style.fill = ink;
          if (t.getComputedTextLength() > h - 16) t.remove();
        }
        return { g, x, w, h };
      });
      svgEl('line', { x1: left, x2: right, y1: base + 1, y2: base + 1, class: 'baseline' }, svg);
      on = spines.map(() => false);
      hot = null;
      this.base = base;
    },
    update(p) {
      shown = Math.min(N, Math.floor(p * N + 0.001));
      spines.forEach((s, i) => {
        const v = i < shown;
        if (v !== on[i]) { s.g.classList.toggle('is-on', v); on[i] = v; }
      });
      countEl.textContent = num.format(shown);
      const pages = BOOKS.slice(0, shown).reduce((sum, b) => sum + b[3], 0);
      labelEl.textContent = shown
        ? `books read in 2026, ${num.format(pages)} pages through ${fmtMonthDay.format(isoDate(BOOKS[shown - 1][0]))}`
        : 'books read in 2026';
      if (hot != null && hot >= shown) this.hover(null);
    },
    hover(x, y, client) {
      if (x == null) { this.highlight(null); return; }
      // nearest spine by x, so thin books are still easy to hit
      let best = null, bestD = 12;
      spines.forEach((s, i) => {
        if (i >= shown || y < this.base - s.h - 16 || y > this.base + 4) return;
        const d = x < s.x ? s.x - x : x > s.x + s.w ? x - s.x - s.w : 0;
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best == null) { this.highlight(null); hideTip(); return; }
      this.highlight(best, client);
    },
    step(dir) {
      if (!shown) return;
      this.highlight(hot == null ? (dir > 0 ? 0 : shown - 1) : clamp(hot + dir, 0, shown - 1));
    },
    highlight(i, client) {
      if (hot != null) spines[hot]?.g.classList.remove('is-hot');
      hot = i;
      if (i == null) return;
      spines[i].g.classList.add('is-hot');
      const [date, title, author, pages, rating, genre, fav, , , note] = BOOKS[i];
      showTip(client ?? anchorOf(spines[i].g), title, [
        author,
        `Finished ${fmtMonthDay.format(isoDate(date))} · ${num.format(pages)} pages`,
        `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} · ${genre}${fav ? ' · a favourite' : ''}`,
        ...(note ? [`“${note}”`] : []),
      ]);
    },
  };
}

// ---------- wire it up ----------
const orchStory = document.querySelector('[data-story="orch"]');
const vgStory = document.querySelector('[data-story="vg"]');
const tdStory = document.querySelector('[data-story="td"]');
const booksStory = document.querySelector('[data-story="books"]');
const careerPlot = document.querySelector('[data-chart="career"]');

mountChart(orchStory.querySelector('.viz__plot'), orchestrateChart(), storyProgress(orchStory));
mountChart(vgStory.querySelector('.viz__plot'), agreementsChart(), storyProgress(vgStory));
const visitors = visitorsChart();
const visitorsMounted = mountChart(tdStory.querySelector('.viz__plot'), visitors, storyProgress(tdStory));
mountChart(booksStory.querySelector('.viz__plot'), booksChart(), storyProgress(booksStory));
mountChart(careerPlot, careerChart(), plotProgress(careerPlot));

let ticking = false;
const frame = () => {
  ticking = false;
  for (const c of charts) c.set(reduceMotion ? 1 : c.progress());
};
const schedule = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', schedule);
frame();

// ---------- photo preview ----------
{
  const photos = [...document.querySelectorAll('.photo')];
  const box = document.querySelector('.lightbox');
  const img = box.querySelector('.lightbox__img');
  const caption = box.querySelector('.lightbox__caption');
  let at = 0;

  const show = (i) => {
    at = (i + photos.length) % photos.length;
    const thumb = photos[at].querySelector('img');
    img.src = photos[at].dataset.full;
    img.alt = thumb.alt;
    caption.textContent = photos[at].closest('figure').querySelector('figcaption').textContent;
  };

  photos.forEach((p, i) => p.addEventListener('click', () => { show(i); box.showModal(); }));
  box.querySelector('.lightbox__close').addEventListener('click', () => box.close());
  for (const b of box.querySelectorAll('.lightbox__nav')) b.addEventListener('click', () => show(at + Number(b.dataset.step)));
  // a tap anywhere outside the photo and its controls closes it
  box.addEventListener('click', (e) => { if (e.target === box || e.target.classList.contains('lightbox__figure')) box.close(); });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(at + 1);
    else if (e.key === 'ArrowLeft') show(at - 1);
  });
  // swipe between photos on touch screens
  let startX = null;
  img.addEventListener('pointerdown', (e) => { startX = e.clientX; });
  img.addEventListener('pointerup', (e) => {
    if (startX == null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) show(at + (dx < 0 ? 1 : -1));
  });
}

// ---------- the Orchestrate chart's description, kept in step with the merge data ----------
{
  const days = new Set(MERGES.map((m) => fmtIsoDay.format(new Date(m[1] * 1000))));
  const busiest = [...days].map((d) => [d, MERGES.filter((m) => fmtIsoDay.format(new Date(m[1] * 1000)) === d)])
    .reduce((a, b) => (b[1].length > a[1].length ? b : a));
  const day = (unix) => fmtDay.format(new Date(unix * 1000));
  const commits = MERGES.reduce((n, m) => n + m[4].length, 0);
  orchStory.querySelector('.viz__plot').setAttribute('aria-label',
    `Arc chart of ${MERGES.length} agent-branch merges into Orchestrate's main branch between ${day(MERGES[0][1])} and ${day(MERGES.at(-1)[1])}, with ${num.format(commits)} branch commits marked as dots along the arcs. Arc height shows lines added, on a log scale. Most merges happened on ${day(busiest[1][0][1])}.`);
}

// ---------- reading figures in the copy, kept in step with the book data ----------
{
  const pages = BOOKS.reduce((sum, b) => sum + b[3], 0);
  for (const el of document.querySelectorAll('[data-books="count"]')) el.textContent = num.format(BOOKS.length);
  for (const el of document.querySelectorAll('[data-books="pages"]')) el.textContent = num.format(pages);
  booksStory.querySelector('.viz__plot').setAttribute('aria-label',
    `Bookshelf chart of the ${BOOKS.length} books I have read in 2026, ${num.format(pages)} pages in all. Spine width shows pages and spine height shows my rating out of five.`);
}

// ---------- live data from theriault.dev ----------
function setStats(stats) {
  for (const el of document.querySelectorAll('[data-stat]')) {
    const v = stats[el.dataset.stat];
    if (typeof v === 'number') el.textContent = num.format(v);
  }
}
setStats(VISITOR_STATS);
(async () => {
  const source = document.querySelector('[data-td-source]');
  try {
    const get = async (path) => {
      const res = await fetch(`https://theriault.dev${path}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(res.status);
      return res.json();
    };
    const [globe, stats] = await Promise.all([get('/globe'), get('/stats')]);
    const rows = globe.cities
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.count > 0)
      .map((c) => [String(c.city), String(c.country), c.count, c.lat, c.lng]);
    if (!rows.length) throw new Error('empty');
    visitors.setData(rows);
    visitorsMounted.rebuild();
    setStats(stats);
    source.textContent = 'Source: theriault.dev, fetched live just now.';
  } catch {
    // keep the bundled snapshot; the caption already says so
  }
})();


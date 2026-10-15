import { MERGES, ORCH_COMMITS, AGREEMENTS, BOOKS } from './data.js';

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
// The tip is pinned to the viewport, so a page scroll strands it away from its chart:
// drop it (and the chart's highlight) as soon as the page moves.
let hovered = null;
const clearHover = () => { hovered?.hover(null); hovered = null; hideTip(); };
addEventListener('scroll', () => { if (hovered || !tip.hidden) clearHover(); }, { passive: true });
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
    hovered = impl;
    impl.hover(e.clientX - r.left, e.clientY - r.top, { x: e.clientX, y: e.clientY });
  };
  plot.addEventListener('pointermove', onPointer);
  plot.addEventListener('pointerdown', onPointer);
  // only take the tip down if it's this chart's (tapping chart B blurs chart A)
  const release = () => { impl.hover(null); if (hovered === impl) clearHover(); };
  plot.addEventListener('pointerleave', release);
  // a touch that turns into a page scroll is cancelled rather than lifted
  plot.addEventListener('pointercancel', release);
  plot.addEventListener('blur', release);
  plot.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { hovered = impl; impl.step(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { hovered = impl; impl.step(-1); e.preventDefault(); }
    else if (e.key === 'Escape') release();
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
// 01 Foresite: one pageview, from what the browser sends to what's stored
// =====================================================================
// What the browser sends (left) and what Foresite keeps (right). Each kept field lists
// the sent fields, and the daily salt, it's made from.
const FS_SENT = [
  { key: 'ip', label: 'IP address', value: '203.0.113.42', personal: true,
    tip: ['Looks up the country and goes into the visitor hash.', 'Then dropped: never stored.'] },
  { key: 'ua', label: 'User-Agent', value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', personal: true,
    tip: ['Gives the browser, OS and device and goes into the visitor hash.', 'Then dropped: never stored.'] },
  { key: 'page', label: 'Page', value: 'https://northwind.example/pricing',
    tip: ['Kept as the path, with any email addresses or other personal data scrubbed out.'] },
  { key: 'ref', label: 'Referrer', value: 'https://news.ycombinator.com/', tip: ['Kept as the source the visit came from.'] },
  { key: 'time', label: 'Time', value: '2:14 PM', tip: ['Kept as the time the event arrived.'] },
];
const FS_SALT = { key: 'salt', label: 'Daily salt', tip: ['A random secret for the site\'s day, mixed into every visitor hash.', 'Deleted when the day ends, so the hash can\'t be recomputed.'] };
const FS_KEPT = [
  { label: 'Visitor hash', value: '7c3e9a41f0b25d18', from: ['ip', 'ua', 'salt'],
    tip: ['One-way, for one site and one day.', 'Tells unique visitors apart without a cookie.'] },
  { label: 'Country', value: 'Nova Scotia, Canada', from: ['ip'], tip: ['Country and region only.'] },
  { label: 'Browser', value: 'Safari · iOS · Mobile', from: ['ua'], tip: ['Browser, OS and device type only.'] },
  { label: 'Page', value: '/pricing', from: ['page'], tip: ['The path, scrubbed of personal data.'] },
  { label: 'Source', value: 'Hacker News', from: ['ref'], tip: ['The referring site, by name.'] },
  { label: 'Time', value: '2:14 PM', from: ['time'], tip: ['When the event arrived.'] },
];

function foresiteChart() {
  // every hoverable thing, in reading order: sent fields, the salt, kept fields
  let items = [], links = [], linkGroup, saltLink, hot = null;

  // trim a value with an ellipsis until it fits
  const fit = (t, max) => {
    const full = t.textContent;
    for (let n = full.length; n > 4 && t.getComputedTextLength() > max; n--) t.textContent = full.slice(0, n - 1) + '…';
  };
  const chip = (parent, x, y, w, h, d, cls) => {
    const g = svgEl('g', { class: `fs-item ${cls}` }, parent);
    svgEl('rect', { x, y: y - h / 2, width: w, height: h, rx: 6, class: 'fs-chip' }, g);
    label(g, x + 10, y - 3, d.label, 'ax-text fs-label');
    fit(label(g, x + 10, y + 12, d.value, 'fs-value'), w - 20);
    return g;
  };

  return {
    build(svg, W, H) {
      const inset = wrapInset(W), x0 = inset, x1 = W - inset;
      const colW = clamp((x1 - x0) * 0.34, 130, 300);
      const top = 50, span = H - top - 4;
      const chipH = clamp(span / FS_KEPT.length - 10, 30, 40);
      const lx = x0 + colW, rx = x1 - colW, xm = (lx + rx) / 2;

      label(svg, x0, 14, 'Browser sends', 'ax-text ax-text--strong');
      label(svg, rx, 14, 'Foresite stores', 'ax-text ax-text--strong');

      linkGroup = svgEl('g', { class: 'fs-links' }, svg);
      const chips = svgEl('g', {}, svg);
      const ends = {};
      items = [];
      FS_SENT.forEach((d, i) => {
        const y = top + (i + 0.5) * (span / FS_SENT.length);
        const g = chip(chips, x0, y, colW, chipH, d, d.personal ? 'fs-item--personal' : '');
        if (d.personal) label(g, lx - 10, y - 3, 'dropped', 'fs-drop', 'end');
        ends[d.key] = [lx, y];
        items.push({ d, g, box: [x0, y - chipH / 2, colW, chipH] });
      });

      // the salt sits under the headings, feeding the visitor hash from above
      const sy = 34, saltG = svgEl('g', { class: 'fs-item fs-salt-g' }, chips);
      svgEl('circle', { cx: xm, cy: sy, r: 5, class: 'fs-salt' }, saltG);
      const saltText = label(saltG, xm - 10, sy + 4, FS_SALT.label, 'ax-text fs-label', 'end');
      ends.salt = [xm, sy];
      items.push({ d: FS_SALT, g: saltG, salt: true, saltText, box: [xm - 140, sy - 10, 150, 20] });

      links = [];
      FS_KEPT.forEach((d, j) => {
        const y = top + (j + 0.5) * (span / FS_KEPT.length);
        const item = { d, g: chip(chips, rx, y, colW, chipH, d, 'fs-item--kept'), box: [rx, y - chipH / 2, colW, chipH], links: [] };
        for (const f of d.from) {
          const [sx, sy2] = ends[f];
          const path = f === 'salt'
            ? `M${sx},${sy2 + 5} C${sx},${y} ${(sx + rx) / 2},${y} ${rx},${y}`
            : `M${sx},${sy2} C${xm},${sy2} ${xm},${y} ${rx},${y}`;
          const el = svgEl('path', {
            d: path, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1,
            class: `fs-link${f === 'salt' ? ' fs-link--salt' : FS_SENT.find((s) => s.key === f).personal ? ' fs-link--personal' : ''}`,
          }, linkGroup);
          const link = { el, j, from: f, drawn: -1 };
          if (f === 'salt') saltLink = link;
          links.push(link);
          item.links.push(link);
        }
        items.push(item);
      });
      for (const it of items) it.links ??= links.filter((l) => l.from === it.d.key);
      hot = null;
    },
    update(p) {
      // fields arrive, links draw kept field by kept field, then the personal fields are
      // dropped and, last, the day's salt is deleted
      items.forEach((it, i) => {
        if (it.d.from) return;
        const at = it.salt ? 0.22 : 0.02 + i * 0.04;
        it.on = p > at;
        it.g.classList.toggle('is-on', it.on);
      });
      for (const l of links) {
        const q = Math.round(clamp((p - 0.25 - l.j * 0.07) / 0.12) * 100) / 100;
        if (q !== l.drawn) { l.el.setAttribute('stroke-dashoffset', 1 - q); l.drawn = q; }
      }
      for (const it of items) {
        if (!it.d.from) continue;
        it.on = it.links.every((l) => l.drawn >= 0.9);
        it.g.classList.toggle('is-on', it.on);
      }
      const dropped = p > 0.8, gone = p > 0.92;
      for (const it of items) if (it.d.personal) it.g.classList.toggle('is-dropped', dropped);
      const salt = items.find((it) => it.salt);
      salt.g.classList.toggle('is-gone', gone);
      salt.saltText.textContent = gone ? 'Salt deleted at day\'s end' : FS_SALT.label;
      saltLink.el.classList.toggle('is-gone', gone);
      if (hot != null && !items[hot].on) this.hover(null);
    },
    hover(x, y, client) {
      if (x == null) { this.highlight(null); return; }
      const i = items.findIndex((it) => {
        const [bx, by, bw, bh] = it.box;
        return it.on && x >= bx - 6 && x <= bx + bw + 6 && y >= by - 6 && y <= by + bh + 6;
      });
      if (i < 0) { this.highlight(null); hideTip(); return; }
      this.highlight(i, client);
    },
    step(dir) {
      const shown = items.map((it, i) => (it.on ? i : -1)).filter((i) => i >= 0);
      if (!shown.length) return;
      const at = shown.indexOf(hot);
      this.highlight(shown[at < 0 ? (dir > 0 ? 0 : shown.length - 1) : clamp(at + dir, 0, shown.length - 1)]);
    },
    highlight(i, client) {
      if (hot != null) items[hot].g.classList.remove('is-hot');
      for (const l of links) l.el.classList.remove('is-hot');
      hot = i;
      linkGroup.classList.toggle('has-hot', i != null);
      if (i == null) return;
      const it = items[i];
      it.g.classList.add('is-hot');
      for (const l of it.links) l.el.classList.add('is-hot');
      showTip(client ?? anchorOf(it.g), it.d.label, it.d.tip);
    },
  };
}

// =====================================================================
// 02 Orchestrate: every agent-branch merge as an arc off main
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
      // small, even beads sized to each merge's slot, so they stay quiet when the slots are narrow
      const r = clamp(step * 0.28, 0.9, 2).toFixed(1);
      arcs = MERGES.map(([fork, merge, lines, , commits], i) => {
        const xe = x0 + (i + 0.5) * step;
        const xs = Math.min(x0 + forkIndex(fork) * step, xe - 3);
        const c = base - height(lines) * (4 / 3);
        const arc = svgEl('path', {
          d: `M${xs.toFixed(1)},${base} C${xs.toFixed(1)},${c.toFixed(1)} ${xe.toFixed(1)},${c.toFixed(1)} ${xe.toFixed(1)},${base}`,
          class: 'arc', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1,
        }, arcGroup);
        // each commit sits on the arc where its time falls between fork and merge
        for (const [t] of commits) {
          const f = clamp((t - fork) / Math.max(1, merge - fork));
          let lo = 0, hi = 1; // the curve's x runs 3u² - 2u³ of the way across
          for (let k = 0; k < 20; k++) { const u = (lo + hi) / 2; if (3 * u * u - 2 * u * u * u < f) lo = u; else hi = u; }
          const u = (lo + hi) / 2;
          marks.push({ i, u, el: svgEl('circle', {
            cx: (xs + (xe - xs) * (3 * u * u - 2 * u * u * u)).toFixed(1),
            cy: (base + (c - base) * 3 * u * (1 - u)).toFixed(1), r, class: 'commit',
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
// 03 Tracking Canada's Agreements: one dot per agreement, by month
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
const fsStory = document.querySelector('[data-story="fs"]');
const orchStory = document.querySelector('[data-story="orch"]');
const vgStory = document.querySelector('[data-story="vg"]');
const booksStory = document.querySelector('[data-story="books"]');
const careerPlot = document.querySelector('[data-chart="career"]');

mountChart(fsStory.querySelector('.viz__plot'), foresiteChart(), storyProgress(fsStory));
mountChart(orchStory.querySelector('.viz__plot'), orchestrateChart(), storyProgress(orchStory));
mountChart(vgStory.querySelector('.viz__plot'), agreementsChart(), storyProgress(vgStory));
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

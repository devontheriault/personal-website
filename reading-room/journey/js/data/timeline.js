/*
  Scroll position → the Journal's state.

  The page scrolls through a sequence of stops: closed, each Spread in
  turn (on phones, each page of each Spread), and closed again, unless
  the year is still being read: then it stops open, on "to be continued".
  Between two stops the Journal is part-way through a movement (opening,
  a Leaf turning, the camera panning across a Spread, closing), and how far is
  simply how far between the two stops the page has scrolled. Scroll back
  and the movement runs backwards. Snap points sit on the stops, so touch
  and keys never leave the Journal mid-turn; a wheel can, and holds it
  wherever it stops (main.js).
*/

import { clamp, easeInOut } from "../util.js";

// how much scrolling each movement takes, in viewport heights
const LENGTH = { open: 1.5, turn: 1, pan: 0.75, close: 1.5 };

export function buildStops(journal, mode) {
  const stops = [{ kind: "closed" }];
  for (let k = 0; k <= journal.lastSpread; k++) {
    if (mode === "page") {
      stops.push({ kind: "spread", spread: k, focus: -1 });
      stops.push({ kind: "spread", spread: k, focus: 1 });
    } else {
      stops.push({ kind: "spread", spread: k, focus: 0 });
    }
  }
  if (!journal.stats.inProgress) stops.push({ kind: "end" });
  return stops;
}

function movement(a, b) {
  if (a.kind === "closed" || b.kind === "closed") return "open";
  if (a.kind === "end" || b.kind === "end") return "close";
  return a.spread === b.spread ? "pan" : "turn";
}

export class Timeline {
  constructor(journal, mode, viewportHeight) {
    this.journal = journal;
    this.mode = mode;
    this.stops = buildStops(journal, mode);
    this.offsets = [0];
    for (let i = 1; i < this.stops.length; i++) {
      const kind = movement(this.stops[i - 1], this.stops[i]);
      this.offsets.push(this.offsets[i - 1] + Math.round(LENGTH[kind] * viewportHeight));
    }
    this.height = this.offsets[this.offsets.length - 1] + viewportHeight;
  }

  // the stop nearest a scroll position
  nearest(y) {
    let best = 0;
    this.offsets.forEach((o, i) => {
      if (Math.abs(o - y) < Math.abs(this.offsets[best] - y)) best = i;
    });
    return best;
  }

  indexOf(spread, focus = this.mode === "page" ? -1 : 0) {
    return this.stops.findIndex((s) => s.kind === "spread" && s.spread === spread && s.focus === focus);
  }

  // the state exactly at a stop
  stateOf(i) {
    const s = this.stops[i];
    const last = this.journal.lastSpread;
    if (s.kind === "closed") return { open: 0, close: 0, P: 0, focus: this.mode === "page" ? -1 : 0 };
    if (s.kind === "end") return { open: 1, close: 1, P: last, focus: 0 };
    return { open: 1, close: 0, P: s.spread, focus: s.focus };
  }

  /*
    The state at scroll position `y`. With `reduced` motion the Journal
    holds one stop or the next (never between) and reports how far to fade
    it, so each movement becomes a short cross-fade instead.
  */
  stateAt(y, { reduced = false } = {}) {
    const { offsets, stops } = this;
    const lastIndex = stops.length - 1;
    if (y <= 0) return { ...this.stateOf(0), fade: 1, segment: [0, 0, 0] };
    if (y >= offsets[lastIndex]) return { ...this.stateOf(lastIndex), fade: 1, segment: [lastIndex, lastIndex, 0] };

    let i = 0;
    while (offsets[i + 1] <= y) i++;
    const t = clamp((y - offsets[i]) / (offsets[i + 1] - offsets[i]));

    if (reduced) {
      const state = this.stateOf(t < 0.5 ? i : i + 1);
      return { ...state, fade: Math.abs(2 * t - 1), segment: [i, i + 1, t] };
    }

    const a = this.stateOf(i);
    const b = this.stateOf(i + 1);
    const kind = movement(stops[i], stops[i + 1]);
    const state = { ...a, fade: 1, segment: [i, i + 1, t] };
    if (kind === "open") {
      state.open = t;
      state.focus = b.focus;
    } else if (kind === "close") {
      state.close = t;
      state.focus = a.focus + (b.focus - a.focus) * easeInOut(t);
    } else if (kind === "turn") {
      state.P = a.P + t;
      state.focus = a.focus + (b.focus - a.focus) * easeInOut(t);
    } else {
      state.focus = a.focus + (b.focus - a.focus) * easeInOut(t);
    }
    return state;
  }
}

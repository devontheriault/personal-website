/*
  What state the Journal is in, and moving it on.

  Usually the state is wherever the scroll has got to along the timeline.
  A movement (data/movements.js) takes over while it runs, and hands back
  by leaving the scroll on the stop it arrived at. Everything that moves
  the Journal (keys, taps, the wheel, the Contents, the ribbon, closing)
  comes through here.
*/

import { riffle, shutting } from "../data/movements.js";
import { Timeline } from "../data/timeline.js";
import { clamp } from "../util.js";

/*
  After a touch, the Journal is drawn easing after the scroll rather than
  pinned to it: this is how long it takes to catch up (ms, the time
  constant of the ease). A finger, and the browser's snap once it lifts,
  move the scroll in uneven steps, read by frames that come unevenly on a
  phone. Drawn a moment behind, the Journal moves as one continuous
  motion and settles softly onto its stop. Wheels are eased already
  (Scroller.nudge), so they're followed exactly.
*/
const FOLLOW = 90;

export class Director {
  constructor({ journal, scene, scroller, request, reduced }) {
    this.journal = journal;
    this.scene = scene;
    this.scroller = scroller;
    this.request = request;
    this.reduced = reduced;
    this.movement = null;
    this.smooth = false; // following a touch
    this.shown = null; // the scroll position the Journal is drawn at
    this.followed = 0; // when it was last worked out, while catching up
  }

  // the timeline for a stage `height` tall
  layout(mode, height) {
    this.mode = mode;
    this.height = height;
    this.timeline = new Timeline(this.journal, mode, height);
    this.scroller.layout(this.timeline);
  }

  // a movement is running, and the scroll isn't in charge
  get moving() {
    return !!this.movement;
  }

  state(now) {
    const m = this.movement;
    if (!m) return this.timeline.stateAt(this.follow(now), { reduced: this.reduced() });
    const s = m.state(now);
    if (now >= m.end) this.arrive(m);
    return s;
  }

  // where along the timeline the Journal is drawn, as of `now`
  follow(now) {
    const y = this.scroller.y;
    // (a scroll starting from rest counts as a frame on from it; after that
    // the time is real, so a slow frame catches up rather than falling behind)
    const dt = this.followed ? Math.max(0, now - this.followed) : 16;
    if (this.shown === null || !this.smooth || this.reduced()) this.shown = y;
    else this.shown += (y - this.shown) * (1 - Math.exp(-dt / FOLLOW));
    if (Math.abs(y - this.shown) < 0.25) this.shown = y;
    this.followed = this.shown === y ? 0 : now;
    return this.shown;
  }

  // the drawn Journal is still catching up with the scroll
  get following() {
    return this.shown !== null && this.shown !== this.scroller.y;
  }

  // the state the Journal is drawn in, while the scroll is in charge
  here() {
    return this.timeline.stateAt(this.shown ?? this.scroller.y);
  }

  // ------------------------------------------------------------ stops

  current() {
    return this.scroller.nearest();
  }

  entryStop(id) {
    const e = this.journal.entryById.get(id);
    return e ? this.timeline.indexOf(e.spread) : -1;
  }

  contentsStop() {
    return this.timeline.indexOf(this.journal.contentsSpread);
  }

  // ------------------------------------------------------------ moving

  // scroll to a stop, letting the scroll drive the movement
  go(i, duration) {
    this.scroller.cancel();
    const target = this.scroller.offset(i);
    if (this.reduced() || duration === 0) {
      this.shown = target;
      return this.scroller.jumpTo(target);
    }
    this.movement = null;
    const distance = Math.abs(target - this.scroller.y) / this.height;
    this.scroller.glide(target, duration ?? clamp(distance, 0.6, 1.6) * 750);
  }

  // turn straight to a stop far away: the Leaves between riffle past
  jump(i) {
    const from = this.here();
    const to = this.timeline.stateOf(i);
    if (this.reduced()) return this.go(i, 0);
    if (from.open < 1 || from.close > 0 || Math.abs(to.P - from.P) <= 1) return this.go(i);

    // the pages it lands on are asked for first, to be there when it does
    const k = to.P;
    this.scene.want([2 * k, 2 * k + 1, 2 * k - 1], 0);
    this.run(riffle(from, to, performance.now()), i);
  }

  /*
    Close the Journal from wherever it lies open, and call `closed` once
    it has. Part-way open (a wheel can leave it there), it simply runs the
    opening back.
  */
  shut(closed) {
    const from = this.here();
    if (this.movement || from.close > 0 || this.scroller.y === 0) return;
    if (from.open < 1) return this.go(0);
    if (this.reduced()) {
      this.go(0, 0);
      closed?.();
      return;
    }
    // the first Leaf, which it riffles back to
    this.scene.want([1, 2], 0);
    this.run(shutting(from, this.timeline.stateOf(0), performance.now()), 0, closed);
  }

  // take over from the scroll until `movement` ends, then land on stop `i`
  run(movement, i, arrived) {
    this.scroller.cancel();
    this.scroller.snap(false);
    this.movement = { ...movement, landing: i, arrived };
    this.request();
  }

  // a movement has finished: leave the scroll where it ended
  arrive(m) {
    this.movement = null;
    this.shown = this.scroller.offset(m.landing);
    this.scroller.to(this.shown);
    m.arrived?.();
    requestAnimationFrame(() => {
      this.scroller.snap(true);
      this.request();
    });
  }

  // something in the Journal was clicked or tapped (scene.pick)
  activate(hit, clientX) {
    if (!hit) return;
    const i = this.current();
    const stop = this.timeline.stops[i];
    if (hit.type === "entry") return this.jump(this.entryStop(hit.id));
    if (hit.type === "ribbon") return this.jump(this.contentsStop());
    if (hit.type === "journal") {
      if (stop.kind === "closed") return this.go(i + 1);
      if (stop.kind === "end") return this.go(i - 1);
    }
    if (hit.type === "page") {
      // a page turns forward from the right, back from the left
      const forward = this.mode === "page" ? clientX > innerWidth * 0.35 : hit.page % 2 === 1;
      this.go(i + (forward ? 1 : -1));
    }
  }

  // ------------------------------------------------------------ at rest

  // the scroll has come to rest: on a stop, the address bar names the Entry
  landed() {
    if (this.movement) return;
    const i = this.current();
    if (Math.abs(this.scroller.offset(i) - this.scroller.y) > 2) return;
    const stop = this.timeline.stops[i];
    const entry = stop.kind === "spread" ? this.journal.entries.find((e) => e.spread === stop.spread) : null;
    const hash = entry ? `#${entry.id}` : "";
    if (location.hash !== hash) history.replaceState(null, "", hash || location.pathname + location.search);
  }

  listen() {
    let settleTimer = 0;
    addEventListener(
      "scroll",
      () => {
        this.request();
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => this.landed(), 180);
      },
      { passive: true }
    );

    /*
      Wheels and trackpads drive the Journal directly. Each notch carries
      the movement under way a little further, and the Journal stays
      wherever the wheel leaves it: a Leaf can be held half-turned, or
      turned back. Snapping has to be off for that (left on, it pulls a
      small scroll straight back to the stop before any listener can step
      in), so the wheel is taken over rather than left to scroll natively.
      Left a hair short of a stop, the Journal settles onto it.
    */
    let wheelTimer = 0;
    const settle = () => {
      if (this.scroller.easing || this.movement) return;
      const i = this.current();
      const off = Math.abs(this.scroller.offset(i) - this.scroller.y);
      if (off > 0.5 && off < this.height * 0.05) this.go(i, 300);
    };
    addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey) return; // pinch-zoom
        e.preventDefault();
        this.smooth = false;
        if (this.movement) return;
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
        this.scroller.nudge(e.deltaY * unit);
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(settle, 220);
      },
      { passive: false }
    );

    // touch and keys page by snapping, so they bring it back; a touch is
    // followed smoothly (FOLLOW)
    addEventListener(
      "touchstart",
      () => {
        this.smooth = true;
        this.scroller.snap(true);
      },
      { passive: true }
    );
  }
}

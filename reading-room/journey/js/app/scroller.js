/*
  The page's scroll position is the Journal's timeline (data/timeline.js).
  The scroll element is empty and as tall as the timeline, with a snap
  point at every stop, so touch and keys always come to rest on one.

  This moves the scroll: instantly, gliding to a stop, or easing after a
  wheel. Snapping is off while it does, or the browser would pull the
  scroll straight back to the stop it left.
*/

import { clamp, easeInOut, lerp } from "../util.js";

export class Scroller {
  constructor(spacer, root, reduced) {
    this.spacer = spacer;
    this.root = root;
    this.reduced = reduced;
    this.gliding = 0;
    this.easing = 0; // the wheel's easing (nudge)
    this.easedY = 0; // where it is, unrounded
    this.easedTarget = 0;
    this.easedLast = 0;
    this.easeStep = this.easeStep.bind(this);
  }

  layout(timeline) {
    this.timeline = timeline;
    this.spacer.style.height = `${timeline.height}px`;
    this.spacer.replaceChildren(
      ...timeline.offsets.map((top) => {
        const stop = document.createElement("div");
        stop.className = "stop";
        stop.style.top = `${top}px`;
        return stop;
      })
    );
  }

  get y() {
    return scrollY;
  }

  snap(on) {
    this.root.classList.toggle("no-snap", !on);
  }

  // the scroll position of stop `i` (clamped to the stops there are)
  offset(i) {
    const { offsets } = this.timeline;
    return offsets[clamp(i, 0, offsets.length - 1)];
  }

  nearest() {
    return this.timeline.nearest(scrollY);
  }

  cancel() {
    cancelAnimationFrame(this.gliding);
    cancelAnimationFrame(this.easing);
    this.easing = 0;
  }

  to(y) {
    scrollTo({ top: y, behavior: "instant" });
  }

  // straight there; snapping comes back once it has landed
  jumpTo(y) {
    this.snap(false);
    this.to(y);
    requestAnimationFrame(() => this.snap(true));
  }

  glide(target, duration) {
    const from = scrollY;
    const start = performance.now();
    this.snap(false);
    const step = (now) => {
      const u = clamp((now - start) / duration);
      this.to(lerp(from, target, easeInOut(u)));
      this.gliding = requestAnimationFrame(u < 1 ? step : () => this.snap(true));
    };
    this.gliding = requestAnimationFrame(step);
  }

  /*
    A wheel moved `dy`: carry the eased scroll that much further. Snapping
    stays off until something else (a touch, a key, a glide) turns it back
    on, so the Journal rests wherever the wheel leaves it.
  */
  nudge(dy) {
    if (!this.easing) {
      this.cancel();
      this.easedY = this.easedTarget = scrollY;
      this.snap(false);
    }
    this.easedTarget = clamp(this.easedTarget + dy, 0, this.offset(Infinity));
    if (!this.easing) {
      this.easedLast = performance.now();
      this.easing = requestAnimationFrame(this.easeStep);
    }
  }

  easeStep(now) {
    const dt = Math.min(now - this.easedLast, 64);
    this.easedLast = now;
    const target = this.easedTarget;
    this.easedY = this.reduced() ? target : this.easedY + (target - this.easedY) * (1 - Math.exp(-dt / 70));
    const done = Math.abs(target - this.easedY) < 0.5;
    if (done) this.easedY = target;
    this.to(this.easedY);
    this.easing = done ? 0 : requestAnimationFrame(this.easeStep);
  }
}

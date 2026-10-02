/*
  Movements the Journal makes by itself rather than following the scroll:
  turning straight to a far Spread, with the Leaves between riffling past,
  and closing from wherever it lies open. Each is a function of the clock
  to a state (data/timeline.js), with the time it ends.
*/

import { clamp, easeInOut, lerp } from "../util.js";

const CLOSING = 1100; // ms for the cover to swing shut

export const riffleDuration = (leaves) => Math.min(1250, 600 + leaves * 36);

// Leaves turning from state `from` to `to`, `u` of the way there
function turning(from, to, u) {
  const distance = Math.abs(to.P - from.P);
  const e = easeInOut(u);
  return {
    open: 1,
    close: 0,
    fade: 1,
    P: lerp(from.P, to.P, e),
    // the Leaves fan out mid-riffle, up to six in the air at once
    width: 1 + Math.min(Math.max(distance - 1, 0), 5) * Math.sin(Math.PI * u),
    focus: lerp(from.focus, to.focus, e),
    riffle: distance > 1 ? { from: Math.round(from.P), to: Math.round(to.P) } : null,
  };
}

// straight from one open Spread to another
export function riffle(from, to, start) {
  const duration = riffleDuration(Math.abs(to.P - from.P));
  return {
    end: start + duration,
    state: (now) => turning(from, to, clamp((now - start) / duration)),
  };
}

/*
  From lying open anywhere back to `closed` (the timeline's first stop):
  the Leaves riffle back to the front, then the cover swings shut. The
  same states the opening passes through, in reverse.
*/
export function shutting(from, closed, start) {
  const front = { P: 0, focus: closed.focus };
  const turn = from.P > 0.01 ? riffleDuration(from.P) : 0;
  return {
    end: start + turn + CLOSING,
    state(now) {
      const elapsed = now - start;
      if (elapsed < turn) return turning(from, front, clamp(elapsed / turn));
      const u = clamp((elapsed - turn) / CLOSING);
      return { ...closed, open: 1 - easeInOut(u), fade: 1 };
    },
  };
}

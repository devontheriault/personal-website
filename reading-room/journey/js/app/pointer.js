/*
  The pointer: the closed Journal leaning toward it, hovering over a
  Contents line, clicking or tapping the Journal, and dragging the closed
  Journal to turn it over in the hands (turning.js).
*/

import { Turning } from "./turning.js";
import { clamp } from "../util.js";

const finePointer = matchMedia("(hover: hover) and (pointer: fine)");

// a pointer event → normalised device coordinates
const ndc = (e) => [(e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1];

export class Pointer {
  constructor({ scene, director, request, root }) {
    this.scene = scene;
    this.director = director;
    this.request = request;
    this.root = root;
    this.tilt = { x: 0, y: 0 }; // eased toward `aim`
    this.aim = { x: 0, y: 0 };
    this.hovering = null; // the Entry whose Contents line is under the pointer
    this.turning = new Turning();
    this.drag = null; // a pointer that may be turning the closed Journal
    this.down = null; // where the last press began, to tell a click from a drag
  }

  /*
    Once a frame. The closed Journal can be turned in the hands only while
    it lies closed (`turnable`); once it's no longer `floating` any turn
    is let go. True while something here is still moving.
  */
  update(now, { turnable, floating, reduced }) {
    const { tilt, aim } = this;
    tilt.x += (aim.x - tilt.x) * 0.07;
    tilt.y += (aim.y - tilt.y) * 0.07;
    const settling = Math.abs(aim.x - tilt.x) + Math.abs(aim.y - tilt.y) > 0.002;

    this.root.classList.toggle("can-turn", turnable);
    if (!turnable) this.endDrag();
    if (!floating) this.turning.reset();
    this.turning.step(now, reduced);
    return settling || this.turning.moving;
  }

  get canTurn() {
    return this.root.classList.contains("can-turn");
  }

  setHover(hit) {
    const id = hit?.type === "entry" ? hit.id : null;
    const clickable = hit && (hit.type === "entry" || hit.type === "ribbon" || hit.type === "journal");
    document.body.style.cursor = clickable ? "pointer" : this.canTurn ? "grab" : "";
    if (id !== this.hovering) {
      this.hovering = id;
      this.scene.setHighlight(id);
      this.request();
    }
  }

  /*
    Dragging anywhere while the Journal is closed turns it over in the
    hands. On a touchscreen a drag up or down the screen is still the
    scroll that opens it; only one that sets off sideways turns it (the
    page allows vertical panning alone while closed, see .can-turn).
  */
  dragMove(e) {
    const drag = this.drag;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.turning) {
      if (Math.hypot(dx, dy) < (drag.touch ? 10 : 4)) return;
      if (drag.touch && Math.abs(dy) > Math.abs(dx)) {
        this.drag = null;
        return;
      }
      drag.turning = true;
      this.turning.hold();
      this.root.classList.add("is-turning");
      if (!drag.touch) this.root.setPointerCapture?.(e.pointerId);
      this.setHover(null);
    }
    const perPixel = Math.PI / clamp(Math.min(innerWidth, innerHeight), 360, 900);
    this.turning.turn(this.scene.camera, dx, dy, e.timeStamp - drag.t, perPixel);
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.t = e.timeStamp;
    this.request();
  }

  endDrag(e) {
    const drag = this.drag;
    if (!drag || (e?.pointerId !== undefined && e.pointerId !== drag.id)) return;
    if (drag.turning) {
      this.turning.release(performance.now(), e ? e.timeStamp - drag.t : Infinity);
      this.root.classList.remove("is-turning");
    }
    this.drag = null;
    this.request();
  }

  listen() {
    addEventListener("pointermove", (e) => {
      if (this.drag && e.pointerId === this.drag.id) this.dragMove(e);
      if (this.drag?.turning || e.pointerType !== "mouse") return;
      this.aim = { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 };
      if (finePointer.matches && !this.director.moving) this.setHover(this.scene.pick(...ndc(e)));
      this.request();
    });

    addEventListener("pointerleave", () => {
      this.aim = { x: 0, y: 0 };
      this.request();
    });

    addEventListener("pointerdown", (e) => {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), scroll: scrollY };
      if (this.drag || e.button > 0 || !this.canTurn || e.target.closest("a, button")) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, touch: e.pointerType === "touch", turning: false };
    });

    addEventListener("pointercancel", (e) => this.endDrag(e));
    addEventListener("blur", () => this.endDrag());

    // a click or tap: pressed and let go quickly, without moving (or scrolling) far
    addEventListener("pointerup", (e) => {
      this.endDrag(e);
      const down = this.down;
      if (!down || e.button > 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) + Math.abs(scrollY - down.scroll);
      const quick = performance.now() - down.t < 600;
      this.down = null;
      if (moved > 8 || !quick || this.director.moving) return;
      if (e.target.closest("a, button")) return;
      this.director.activate(this.scene.pick(...ndc(e)), e.clientX);
    });
  }
}

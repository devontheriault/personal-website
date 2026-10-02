/*
  My Reading Journey: putting it together.

    data/     book data → the Journal, and scroll → the Journal's state
    art/      drawing the pages and the binding onto canvases
    scene/    the Journal in 3D, drawn from a state
    app/      the page around it: scrolling, pointing, keys, the text copy

  Each frame the director says what state the Journal is in (following
  the scroll, or a movement of its own), the pointer adds the lean and
  turn of the hands, and the scene draws it. Frames are drawn only while
  something is moving.
*/

import { Chrome } from "./app/chrome.js";
import { Director } from "./app/director.js";
import { buildMirror } from "./app/mirror.js";
import { Pointer } from "./app/pointer.js";
import { Scroller } from "./app/scroller.js";
import { binding, journal, layoutMode, studio, textureHeight } from "./early.js";
import { JournalScene } from "./scene/journal-scene.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

/*
  The closed Journal's drift moves it a quarter of a pixel a frame at
  most, so while nothing else is moving it's drawn about thirty times a
  second rather than at the screen's full rate (sixty, or a hundred and
  twenty): the same to the eye, for half the work or less.
*/
const DRIFT_FRAME = 26; // ms; the frame after it lands about 33ms on

function fallback() {
  document.body.classList.add("no-webgl");
  $("fallback").hidden = false;
  setTimeout(() => location.assign("../../v2/"), 6000);
}

async function boot() {
  history.scrollRestoration = "manual";

  const root = document.documentElement;
  const reduced = () => reducedMotion.matches;

  let raf = 0;
  let held = false;
  let started = false; // no frames until the shaders are ready
  let driftTimer = 0;
  const request = () => {
    if (!raf && !held && started) raf = requestAnimationFrame(frame);
  };
  const drift = () => {
    clearTimeout(driftTimer);
    driftTimer = setTimeout(request, DRIFT_FRAME);
  };

  // a worker can't start while this thread is busy, and this thread is
  // about to be, setting up WebGL: let the studio's get going first
  await Promise.race([studio.started, new Promise((r) => setTimeout(r, 100))]);

  // the studio (early.js) is already drawing, on its own thread; the
  // renderer starts up and compiles its shaders on this one meanwhile
  const scene = new JournalScene($("stage"), journal, studio, { binding, arrived: request });
  const chrome = new Chrome({ stage: $("stage"), hint: $("hint"), edition: $("edition"), shut: $("shut"), caption: $("focus-caption") });
  /*
    The Journal is drawn to the stage's own size, the large viewport
    (100lvh), not the window's. On a phone the window grows and shrinks as
    the toolbar slides away and back mid-swipe; the stage doesn't, so the
    picture, the timeline and the snap points all hold still under the
    thumb. (Laid out again for the window, the timeline would jump the
    scroll to a stop partway through the swipe.)
  */
  const stage = $("stage");
  let size = { width: 0, height: 0, dpr: 0 };
  const resize = () => {
    const next = { width: stage.clientWidth, height: stage.clientHeight, dpr: devicePixelRatio || 1 };
    if (next.width === size.width && next.height === size.height && next.dpr === size.dpr) return false;
    size = next;
    scene.resize(size.width, size.height, size.dpr);
    scene.keepClear(chrome.margins(size.height));
    return true;
  };
  resize();

  const scroller = new Scroller($("scroll"), root, reduced);
  const director = new Director({ journal, scene, scroller, request, reduced });
  const pointer = new Pointer({ scene, director, request, root });
  const mirror = buildMirror($("journal-text"), journal);
  let lastState = null;
  let shown = false;

  function frame(now) {
    // (called directly, it takes the place of any frame already asked for,
    // or there would be two loops)
    cancelAnimationFrame(raf);
    raf = 0;
    if (held) return;
    const isReduced = reduced();
    const base = director.state(now);

    // it floats while closed, and can be turned in the hands once still
    const floating = base.close > 0.75 || (base.close === 0 && base.open < 0.25);
    const turnable = !director.moving && (base.close > 0 ? base.close > 0.98 : base.open < 0.02);
    const busy = pointer.update(now, { turnable, floating, reduced: isReduced });

    const state = {
      ...base,
      mode: director.mode,
      time: isReduced ? 0 : now,
      pointer: isReduced ? null : pointer.tilt,
      turn: pointer.turning.q,
    };
    scene.update(state);
    scene.anticipate(state);
    lastState = state;
    // a picture it needs is still being drawn: this frame waits for it
    // (the scene asks for another as it arrives)
    if (scene.complete) {
      scene.render();
      if (!shown) {
        shown = true;
        requestAnimationFrame(() => document.body.classList.add("is-ready"));
      }
    }
    chrome.update(base);

    if (director.moving || director.following || busy) request();
    else if (floating && !isReduced && !document.hidden) drift();
  }

  // ------------------------------------------------------------ input

  director.listen();
  pointer.listen();

  // closing hands focus on to the way back, which takes the same corner
  function shut() {
    const returnFocus = document.activeElement === chrome.shut;
    director.shut(() => returnFocus && chrome.edition.focus());
  }
  chrome.shut.addEventListener("click", shut);

  addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape") return shut();
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      director.go(director.current() + (e.key === "ArrowRight" ? 1 : -1));
    }
  });

  // the text copy: its Contents links and ribbon are the keyboard's way in
  mirror.addEventListener("click", (e) => {
    const link = e.target.closest("[data-entry], [data-ribbon]");
    if (!link) return;
    e.preventDefault();
    if (link.dataset.entry) {
      history.replaceState(null, "", `#${link.dataset.entry}`);
      director.jump(director.entryStop(link.dataset.entry));
    } else director.jump(director.contentsStop());
  });
  mirror.addEventListener("focusin", (e) => {
    const t = e.target.closest("[data-caption]");
    if (!t) return;
    chrome.showCaption(t.dataset.caption);
    scene.setHighlight(t.dataset.entry || null);
    request();
  });
  mirror.addEventListener("focusout", () => {
    chrome.hideCaption();
    scene.setHighlight(pointer.hovering);
    request();
  });

  addEventListener("hashchange", () => {
    const i = director.entryStop(location.hash.slice(1));
    if (i >= 0) director.jump(i);
  });

  // ------------------------------------------------------------ resizing

  let resizeTimer = 0;
  addEventListener("resize", () => {
    // (a phone's toolbar coming or going leaves the stage as it was)
    if (!resize()) return;
    request();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const { timeline } = director;
      const stop = timeline.stops[director.current()];
      const mode = layoutMode();
      const changed = mode !== director.mode;
      if (changed) {
        // a phone turned on its side, or a window resized past the line:
        // the pages are redrawn for the new way of reading them
        studio.resize(textureHeight(mode), mode === "page");
        scene.refreshPages();
      }
      director.layout(mode, size.height);
      // back to the same place in the new timeline
      let i = 0;
      if (stop.kind === "end") i = director.timeline.stops.length - 1;
      else if (stop.kind === "spread") {
        const focus = changed ? (mode === "page" ? -1 : 0) : stop.focus;
        i = Math.max(0, director.timeline.indexOf(stop.spread, focus));
      }
      director.go(i, 0);
      request();
    }, 160);
  });

  reducedMotion.addEventListener("change", request);
  document.addEventListener("visibilitychange", request);

  // ------------------------------------------------------------ start

  director.layout(layoutMode(), size.height);
  const deepLink = director.entryStop(location.hash.slice(1));
  scroller.to(deepLink >= 0 ? scroller.offset(deepLink) : 0);
  // lay the Journal out once, so the pages it opens on are asked for
  // while the shaders compile
  const first = director.state(performance.now());
  scene.update({ ...first, mode: director.mode, time: 0, pointer: null });
  scene.anticipate(first);
  await scene.warm();
  started = true;
  frame(performance.now());

  // for poking at from the console
  window.journey = {
    journal,
    scene,
    director,
    get timeline() {
      return director.timeline;
    },
    go: (i, duration) => director.go(i, duration),
    jump: (i) => director.jump(i),
    shut,
    get state() {
      return lastState;
    },
    // stop drawing frames of its own (for tests that draw states themselves)
    hold(on = true) {
      held = on;
      if (on) cancelAnimationFrame(raf), (raf = 0);
      else request();
    },
  };
}

// the renderer fails to start without WebGL 2; so does anything else amiss
boot().catch((err) => {
  console.error(err);
  fallback();
});

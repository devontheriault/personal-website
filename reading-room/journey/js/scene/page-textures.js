/*
  The drawn pages, as textures, kept only while they're wanted.

  Pages are drawn by the studio (art/studio.js), off the main thread, and
  arrive a few milliseconds after they're asked for. So they're asked for
  early: `want`ed as the Journal comes within a Spread or two of them, or
  before a movement that will land on them. A Leaf that needs a page that
  hasn't arrived counts it as `missing`, and the scene holds the frame
  until it has: a page is never seen blank, or half-written.

  At most BUDGET are kept; the ones used least recently are let go first.
  A Contents page is drawn afresh when the Entry highlighted on it
  changes, and every page is drawn afresh when the screen changes size;
  either way the old drawing stays up until the new one arrives.
*/

import { pictureTexture, show } from "./textures.js";

// ten pages (the Spreads either side of this one), and the riffle's two
const BUDGET = 12;

export class PageTextures {
  constructor(studio, renderer, { anisotropy, arrived }) {
    this.studio = studio;
    this.renderer = renderer;
    this.anisotropy = anisotropy;
    this.arrived = arrived; // called whenever a drawing arrives
    this.count = studio.journal.pages.length;
    this.highlight = null;
    // index or "recto"/"verso" (the riffle's blur of type) → {
    //   texture, hits,
    //   drawn   what the texture shows: the highlight it was drawn with,
    //           or undefined for nothing yet
    //   job     the drawing asked for and not yet arrived, and `asked`, its highlight
    //   old     a texture still showing an older drawing, until then
    // }, least recently used first
    this.pages = new Map();
    // bumped whenever a texture a Leaf may be showing is replaced
    this.version = 0;
    // what the last layout needed that has no drawing yet (see begin())
    this.missing = 0;
  }

  setHighlight(id) {
    if (id === this.highlight) return;
    this.highlight = id;
    this.version++;
  }

  // the Entry to highlight on page `index`, if it's a Contents page that lists it
  highlightOn(index) {
    if (typeof index !== "number") return null;
    const page = this.studio.journal.pages[index];
    return page.kind === "contents" && page.items.some((it) => it.entry && it.entry.id === this.highlight) ? this.highlight : null;
  }

  blank(key) {
    // versos lie on the back of a Leaf, which runs the other way
    const verso = typeof key === "number" ? key % 2 === 0 : key === "verso";
    return { texture: pictureTexture({ anisotropy: this.anisotropy, mirror: verso }), hits: [], drawn: undefined, job: null, asked: undefined, old: null };
  }

  // the page's entry, now the most recently used, asking for its drawing
  // if it has none or the wrong one
  entry(key, priority) {
    const highlight = this.highlightOn(key);
    let e = this.pages.get(key);
    if (e) this.pages.delete(key);
    else e = this.blank(key);
    this.pages.set(key, e);
    if (e.drawn === highlight) return e;
    if (e.job && e.asked === highlight) {
      // wanted sooner than when it was asked for
      if (priority < e.job.priority) this.studio.hurry(e.job, priority);
    } else this.ask(key, e, highlight, priority);
    return e;
  }

  ask(key, e, highlight, priority) {
    if (e.job) this.studio.cancel(e.job.id);
    const job =
      typeof key === "number"
        ? this.studio.request("page", { index: key, highlight }, priority)
        : this.studio.request("generic", { recto: key === "recto" }, priority);
    e.job = job;
    e.asked = highlight;
    job.done.then((r) => {
      if (e.job === job) e.job = null;
      if (!r) return;
      // an out-of-date drawing is still better than none; one nobody wants is let go
      const showing = e.drawn !== undefined || e.old;
      if (this.pages.get(key) !== e || (e.asked !== highlight && showing)) return r.image.close();
      show(e.texture, r.image);
      // upload it now, between frames, rather than in the next one
      this.renderer.initTexture(e.texture);
      e.old?.dispose();
      e.old = null;
      e.drawn = highlight;
      if (r.hits) e.hits = r.hits;
      this.version++;
      this.arrived();
    });
  }

  // a new layout is starting: count what it needs that isn't here
  begin() {
    this.missing = 0;
  }

  // what a Leaf showing this entry's page should show now
  current(e) {
    if (e.drawn !== undefined) return e.texture;
    if (e.old) return e.old;
    this.missing++;
    return e.texture;
  }

  // the texture for page `index`, for a Leaf that shows it now
  get(index) {
    if (index < 0 || index >= this.count) return null;
    return this.current(this.entry(index, 0));
  }

  // a page for the Leaves riffling past in a jump: a blur of type
  generic(recto) {
    return this.current(this.entry(recto ? "recto" : "verso", 0));
  }

  // a drawing asked for hasn't arrived yet
  get drawing() {
    for (const e of this.pages.values()) if (e.job) return true;
    return false;
  }

  // what a drawn Contents line turns to, where it was last drawn
  hits(index) {
    return this.pages.get(index)?.hits ?? [];
  }

  // ask for these pages ahead of time, the first most urgently
  want(indices, priority = 1) {
    indices.forEach((i, n) => {
      if (i >= 0 && i < this.count) this.entry(i, priority + n * 0.01);
    });
  }

  // and the riffle's blur of type, before the first riffle
  wantGeneric(priority = 3) {
    this.entry("recto", priority);
    this.entry("verso", priority);
  }

  // let go of pages beyond the budget, except those in `keep`
  evict(keep) {
    for (const [key, e] of this.pages) {
      if (this.pages.size <= BUDGET) break;
      if (keep.has(key)) continue;
      if (e.job) this.studio.cancel(e.job.id);
      e.texture.dispose();
      e.old?.dispose();
      this.pages.delete(key);
    }
  }

  // the page art changed (a new size, a new print): every page is drawn
  // again when next wanted, and shows its old drawing until then
  refresh() {
    for (const [key, e] of this.pages) {
      if (e.job) this.studio.cancel(e.job.id);
      const fresh = this.blank(key);
      fresh.hits = e.hits;
      if (e.drawn !== undefined) {
        fresh.old = e.texture;
        e.old?.dispose();
      } else {
        fresh.old = e.old;
        e.texture.dispose();
      }
      this.pages.set(key, fresh);
    }
    this.version++;
  }
}

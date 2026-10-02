/*
  The workshop: everything the Journal needs drawn, as jobs. It runs on a
  worker thread (studio-worker.js) wherever the browser allows, so a page
  that takes 30ms to draw never holds up a frame, or on the page itself
  (studio.js) where it doesn't. The drawing is the same either way.

  Every picture goes back as an ImageBitmap, stored upside down: WebGL
  flips a canvas as it uploads it, but never a bitmap.
*/

import * as cover from "./cover-art.js";
import { PageArt } from "./pages.js";
import { loadTypefaces, makeCanvas } from "./text.js";

const bitmap = (canvas) => createImageBitmap(canvas, { imageOrientation: "flipY" });

async function bitmaps(maps) {
  const out = {};
  await Promise.all(Object.entries(maps).map(async ([k, c]) => (out[k] = await bitmap(c))));
  return out;
}

export class Workshop {
  constructor({ journal, titleStyle, largePrint, height }) {
    this.journal = journal;
    this.art = new PageArt(journal, { titleStyle, largePrint });
    this.art.setResolution(height);
    // the binding is set in two faces; the pages use them all
    const faces = loadTypefaces();
    this.bindingFaces = Promise.all([faces["Cormorant Garamond"], faces["DM Mono"]]);
    this.allFaces = Promise.all(Object.values(faces));
  }

  // the cloth, foil and page edges: all the closed Journal shows
  async covers({ boardW, boardH }) {
    await this.bindingFaces;
    const { year, owner } = this.journal;
    const cw = 1024;
    const ch = Math.round((cw * boardH) / boardW);
    const plain = cover.plainCloth(512, 512);
    const [front, back, spine, cloth, edges] = await Promise.all([
      bitmaps(cover.frontCover(cw, ch, { year, owner })),
      bitmaps(cover.backCover(cw, ch)),
      bitmaps(cover.spine(192, 192 * 12, { year })),
      bitmaps({ color: plain.canvas, bump: plain.bump }),
      bitmap(cover.pageEdges()),
    ]);
    return { front, back, spine, cloth, edges };
  }

  // the pastedowns: the title page inside the front board, the last inside the back
  async insides({ boardW, boardH, pageW, pageH }) {
    await this.allFaces;
    const title = this.art.render(0).canvas;
    const last = this.art.render(this.journal.pages.length - 1).canvas;
    return bitmaps(cover.boardInsides(title, last, boardW, boardH, pageW, pageH));
  }

  async page({ index, highlight = null }) {
    await this.allFaces;
    // one canvas, redrawn for every page (the bitmap is a copy)
    this.scratch ??= makeCanvas(1, 1, { soft: true });
    const { canvas, hits } = this.art.render(index, { highlight, canvas: this.scratch });
    return { image: await bitmap(canvas), hits };
  }

  async generic({ recto }) {
    await this.allFaces;
    return { image: await bitmap(this.art.generic(recto)) };
  }

  // pages drawn from now on are for a new screen
  async resize({ height, largePrint }) {
    this.art.largePrint = largePrint;
    this.art.setResolution(height);
    return {};
  }
}

// every ImageBitmap in a result, to hand over rather than copy
export function transferables(result, out = []) {
  if (typeof ImageBitmap !== "undefined" && result instanceof ImageBitmap) out.push(result);
  else if (result && typeof result === "object") for (const v of Object.values(result)) transferables(v, out);
  return out;
}

/*
  Jobs wait here and are done one at a time, most urgent (lowest
  `priority`) first, then in the order asked. Between jobs it lets
  messages in, so a cancellation or an urgent request that arrives while
  a page is being drawn is seen before the next one starts.
*/
export class JobQueue {
  constructor(workshop, deliver) {
    this.workshop = workshop;
    this.deliver = deliver; // (id, result | null, error?)
    this.jobs = [];
    this.running = false;
    const channel = new MessageChannel();
    this.tick = () => new Promise((r) => {
      channel.port1.onmessage = r;
      channel.port2.postMessage(0);
    });
  }

  add(job) {
    this.jobs.push(job);
    if (!this.running) this.run();
  }

  cancel(id) {
    const i = this.jobs.findIndex((j) => j.id === id);
    if (i >= 0) {
      this.jobs.splice(i, 1);
      this.deliver(id, null);
    }
  }

  hurry(id, priority) {
    const job = this.jobs.find((j) => j.id === id);
    if (job) job.priority = priority;
  }

  async run() {
    this.running = true;
    while (this.jobs.length) {
      await this.tick();
      if (!this.jobs.length) break;
      let next = 0;
      for (let i = 1; i < this.jobs.length; i++) if (this.jobs[i].priority < this.jobs[next].priority) next = i;
      const [job] = this.jobs.splice(next, 1);
      try {
        this.deliver(job.id, await this.workshop[job.kind](job.args));
      } catch (err) {
        this.deliver(job.id, null, err);
      }
    }
    this.running = false;
  }
}

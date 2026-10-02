/*
  The workshop on its own thread (see studio.js). The first message says
  what the Journal is; it answers whether it can draw here at all (it
  needs a 2D OffscreenCanvas, and fonts of its own), then takes jobs.
*/

import { JobQueue, Workshop, transferables } from "./workshop.js";
// everything the workshop imports, however deeply, named here too so the
// worker asks for it all at once rather than an import at a time
import "./cover-art.js";
import "./ink.js";
import "./layout.js";
import "./pages.js";
import "./paper.js";
import "./sketch.js";
import "./text.js";
import "../util.js";

let queue = null;

// (a worker can't start while the page is busy: this tells it it has)
self.postMessage({ type: "started" });

function able() {
  try {
    return !!self.fonts && typeof FontFace === "function" && typeof createImageBitmap === "function" && !!new OffscreenCanvas(1, 1).getContext("2d");
  } catch {
    return false;
  }
}

self.onmessage = ({ data }) => {
  if (data.type === "open") {
    if (!able()) return self.postMessage({ type: "unable" });
    queue = new JobQueue(new Workshop(data.settings), (id, result, error) => {
      if (error) console.error(error);
      self.postMessage({ type: "done", id, result }, transferables(result));
    });
  } else if (data.type === "job") queue?.add(data.job);
  else if (data.type === "cancel") queue?.cancel(data.id);
  else if (data.type === "hurry") queue?.hurry(data.id, data.priority);
};

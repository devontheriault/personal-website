/*
  The studio: where the Journal's binding and pages get drawn, out of the
  way of the frames.

  A page takes anything from 1 to 40ms to draw (a Sketch is the slow
  kind), several times that on a phone. Drawn in a frame, that is a
  stutter; drawn in idle time, it still holds up the next touch. So the
  drawing is done by the workshop (workshop.js) on a thread of its own,
  and each request is answered, a little later, by a promise. A browser
  that can't draw in a worker (no OffscreenCanvas, or no fonts there)
  gets the same workshop on the page instead, and the same promises.

  `request` resolves with the drawing, or with null if it was cancelled
  first. A drawing that was already under way when it was cancelled
  still arrives; whoever asked should let its bitmaps go.

  Only this file is loaded on the page to begin with: the workshop itself
  is fetched here only if it turns out to be needed here.
*/

export class Studio {
  // `settings`: { journal, titleStyle, largePrint, height } (see Workshop)
  constructor(settings) {
    this.settings = settings;
    this.journal = settings.journal;
    this.jobs = new Map(); // id → { job, resolve }, until answered
    this.nextId = 1;
    this.queue = null; // the workshop on this thread, if it came to that
    // resolves once the worker is running (or the drawing has come here)
    this.started = new Promise((resolve) => (this.start = resolve));
    try {
      this.worker = new Worker(new URL("./studio-worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }) => {
        if (data.type === "done") this.answer(data.id, data.result);
        else if (data.type === "started") this.start();
        else if (data.type === "unable") this.drawHere();
      };
      this.worker.onerror = () => this.drawHere();
      this.worker.postMessage({ type: "open", settings });
    } catch {
      this.drawHere();
    }
  }

  // ask for a drawing (a Workshop method and its arguments); lower
  // priorities are drawn first
  request(kind, args = {}, priority = 1) {
    const id = this.nextId++;
    const job = { id, kind, args, priority };
    const done = new Promise((resolve) => this.jobs.set(id, { job, resolve }));
    if (this.queue) this.queue.add(job);
    else if (this.worker) this.worker.postMessage({ type: "job", job });
    // (otherwise it's moving onto this thread, and takes the job with it)
    return { id, done, priority };
  }

  // a request is wanted sooner than it was
  hurry(request, priority) {
    request.priority = priority;
    const waiting = this.jobs.get(request.id);
    if (!waiting) return;
    waiting.job.priority = priority;
    if (this.queue) this.queue.hurry(request.id, priority);
    else if (this.worker) this.worker.postMessage({ type: "hurry", id: request.id, priority });
  }

  cancel(id) {
    if (!this.jobs.has(id)) return;
    if (this.queue) this.queue.cancel(id);
    else if (this.worker) this.worker.postMessage({ type: "cancel", id });
    else this.answer(id, null);
  }

  // pages drawn from now on are for a new screen
  resize(height, largePrint) {
    this.settings = { ...this.settings, height, largePrint };
    return this.request("resize", { height, largePrint }, -1);
  }

  answer(id, result) {
    const job = this.jobs.get(id);
    this.jobs.delete(id);
    job?.resolve(result);
  }

  // no worker after all: draw on this thread, starting with whatever the
  // worker was asked for and hadn't answered
  async drawHere() {
    if (this.moving) return;
    this.moving = true;
    this.worker?.terminate();
    this.worker = null;
    this.start();
    const { JobQueue, Workshop } = await import("./workshop.js");
    this.queue = new JobQueue(new Workshop(this.settings), (id, result) => this.answer(id, result));
    for (const { job } of this.jobs.values()) this.queue.add(job);
  }
}

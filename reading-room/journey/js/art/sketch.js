/*
  The Sketch: a generated ink-and-wash drawing of the book as an object,
  on the left-hand page of its Entry.

  The book is modelled as a few boxes (boards, spine, text block), posed,
  and projected orthographically, the way a sketcher flattens what they
  see. An orthographic view keeps every face a parallelogram, so lettering
  on the cover and spine can be laid onto its face with a single affine
  transform. Faces are painted back to front; each one first re-lays the
  page's own paper inside its outline, so nearer faces hide farther ones
  without covering the paper in flat colour.

  Pose, proportions and every wobble are seeded from the book's id: the
  drawing never changes between visits.
*/

import { INK, hatch, penPolygon, penStroke, rgba, wash } from "./ink.js";
import { wrap } from "./text.js";
import { seeded } from "../util.js";

const PAGES_TINT = "#b59a6a";

const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const mul = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
const apply = (M, [x, y, z]) => [
  M[0][0] * x + M[0][1] * y + M[0][2] * z,
  M[1][0] * x + M[1][1] * y + M[1][2] * z,
  M[2][0] * x + M[2][1] * y + M[2][2] * z,
];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => scale(a, 1 / Math.hypot(...a));

// a box's six faces: [axis, sign, kind-key]
const FACES = [
  [0, -1, "nx"], [0, 1, "px"],
  [1, -1, "ny"], [1, 1, "py"],
  [2, -1, "nz"], [2, 1, "pz"],
];

function boxFaces(slab) {
  const { min, max, kinds, rotate = null, pivot = [0, 0, 0] } = slab;
  const place = (p) => (rotate ? add(apply(rotate, sub(p, pivot)), pivot) : p);
  const faces = [];
  for (const [axis, sign, key] of FACES) {
    const kind = kinds[key];
    if (!kind) continue;
    const a = (axis + 1) % 3;
    const b = (axis + 2) % 3;
    const fixed = sign > 0 ? max[axis] : min[axis];
    const corner = (ua, ub) => {
      const p = [0, 0, 0];
      p[axis] = fixed;
      p[a] = ua ? max[a] : min[a];
      p[b] = ub ? max[b] : min[b];
      return place(p);
    };
    const n = [0, 0, 0];
    n[axis] = sign;
    faces.push({
      kind,
      key,
      corners: [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)],
      normal: rotate ? apply(rotate, n) : n,
      slab,
    });
  }
  return faces;
}

function chooseModel(entry, rand) {
  const pages = Number(entry.book.pages) || 300;
  const W = 0.62 + rand() * 0.1;
  const T = Math.min(0.26, Math.max(0.055, 0.04 + pages * 0.00024));
  const b = 0.018; // board thickness
  const sq = 0.016; // the "squares": boards overhang the text block

  const poses = ["standing", "lying", "ajar", "leaning", "standing", "lying"];
  const pose = poses[Math.floor(rand() * poses.length)];

  const cover = { pz: "cover", nz: "back", nx: "spine", px: "board-edge", py: "board-edge", ny: "board-edge" };
  const block = { px: "fore", py: "head", ny: "tail" };

  const slabs = [];
  const openAngle = pose === "ajar" ? 0.55 + rand() * 0.35 : 0;

  slabs.push({ min: [0, 0, -T / 2], max: [W, 1, -T / 2 + b], kinds: { ...cover, pz: null, nx: null } });
  slabs.push({ min: [0, sq, -T / 2 + b], max: [W - sq, 1 - sq, T / 2 - b], kinds: { ...block, pz: openAngle ? "first-page" : null } });
  slabs.push({ min: [-b, 0, -T / 2], max: [0, 1, T / 2], kinds: { nx: "spine", py: "board-edge", ny: "board-edge" } });
  slabs.push({
    min: [0, 0, T / 2 - b],
    max: [W, 1, T / 2],
    kinds: { pz: "cover", nz: openAngle ? "pastedown" : null, px: "board-edge", py: "board-edge", ny: "board-edge" },
    rotate: openAngle ? rotY(-openAngle) : null,
    pivot: [0, 0, T / 2 - b],
  });

  let posed = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let yaw;
  let pitch;
  if (pose === "lying") {
    posed = rotX(-Math.PI / 2);
    yaw = (rand() - 0.5) * 1.1 + (rand() > 0.5 ? 0.35 : -0.35);
    pitch = 0.72 + rand() * 0.22;
  } else {
    if (pose === "leaning") posed = rotZ((rand() > 0.5 ? 1 : -1) * (0.09 + rand() * 0.07));
    // the spine side usually; an open cover is seen from the fore-edge
    const spineSide = pose === "ajar" ? false : rand() < 0.75;
    yaw = (spineSide ? 1 : -1) * (0.42 + rand() * 0.3);
    pitch = 0.26 + rand() * 0.16;
  }

  return { W, T, b, pose, slabs, posed, view: mul(rotX(pitch), rotY(yaw)) };
}

// convex hull (monotone chain) of 2D points
function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function traceClip(ctx, poly) {
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
}

// lay text onto a face: `frame` maps local units (u across, v down) to the page
function onFace(ctx, frame, draw) {
  const { o, u, v } = frame;
  ctx.save();
  ctx.transform(u[0], u[1], v[0], v[1], o[0], o[1]);
  draw();
  ctx.restore();
}

/*
  Draw the Sketch for `entry` into `box` (page units) on a page whose
  paper is `paper`, laid at `paperRect`.
*/
export function drawSketch(ctx, entry, box, paper, paperRect) {
  const rand = seeded(entry.id, 3);
  const model = chooseModel(entry, rand);
  const color = entry.book.cover || "#6b4630";
  const { posed, view } = model;

  // light comes from the upper left, slightly in front
  const light = norm([-0.55, 0.75, 0.55]);

  let faces = model.slabs.flatMap(boxFaces).map((f) => {
    const world = f.corners.map((c) => apply(posed, c));
    return { ...f, world, worldNormal: apply(posed, f.normal) };
  });

  // stand everything on the ground
  const allWorld = faces.flatMap((f) => f.world);
  const groundY = Math.min(...allWorld.map((p) => p[1]));
  faces.forEach((f) => (f.world = f.world.map((p) => [p[0], p[1] - groundY, p[2]])));

  const project = (p) => {
    const v = apply(view, p);
    return [v[0], -v[1], v[2]];
  };

  // cast shadow on the ground, away from the light
  const shadowDir = [0.55, -0.75, -0.25];
  const shadowPts = faces
    .flatMap((f) => f.world)
    .map((p) => {
      const t = p[1] / -shadowDir[1];
      return [p[0] + shadowDir[0] * t * 0.5, 0, p[2] + shadowDir[2] * t * 0.5];
    });
  const footprint = hull(shadowPts.map((p) => [p[0], p[2]])).map(([x, z]) => project([x, 0, z]));

  faces.forEach((f) => {
    f.screen = f.world.map(project);
    f.viewNormal = apply(view, f.worldNormal);
    f.depth = f.screen.reduce((s, p) => s + p[2], 0) / 4;
  });
  faces = faces.filter((f) => f.viewNormal[2] > 0.015);

  // fit the drawing to the box, leaving room for the shadow
  const pts = faces.flatMap((f) => f.screen).concat(footprint);
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const k = Math.min(box.w / (maxX - minX), box.h / (maxY - minY));
  const ox = box.x + (box.w - (maxX - minX) * k) / 2 - minX * k;
  // sit the drawing a little low in its box, on its shadow
  const oy = box.y + (box.h - (maxY - minY) * k) * 0.62 - minY * k;
  const toPage = (p) => [ox + p[0] * k, oy + p[1] * k];

  // shadow
  const shadow = footprint.map(toPage);
  wash(ctx, shadow, "#5e5247", rand, { alpha: 0.1, layers: 2, spread: 10, granulation: 0.3 });
  hatch(ctx, shadow, rand, { angle: 0.35, spacing: 11, width: 0.9, alpha: 0.35, jitter: 0.5 });

  faces.sort((a, b) => a.depth - b.depth);

  for (const f of faces) {
    const poly = f.screen.map(toPage);
    const lit = Math.max(0, dot(norm(f.worldNormal), light));

    // re-lay the paper inside this face so it hides what is behind it
    ctx.save();
    traceClip(ctx, poly);
    ctx.drawImage(paper, paperRect.x, paperRect.y, paperRect.w, paperRect.h);
    ctx.restore();

    const edgeFrame = (i0, i1, i3) => {
      const o = poly[i0];
      return { o, u: [poly[i1][0] - o[0], poly[i1][1] - o[1]], v: [poly[i3][0] - o[0], poly[i3][1] - o[1]] };
    };

    switch (f.kind) {
      case "cover":
      case "back":
      case "spine":
      case "board-edge": {
        // lit faces take a paler wash, shaded ones a deeper one
        const deep = (f.kind === "board-edge" ? 0.22 : 0.2) * (1.35 - lit * 0.7);
        wash(ctx, poly, color, rand, { alpha: deep, layers: 3, spread: 5, loose: 12 });
        if (lit < 0.45) {
          hatch(ctx, poly, rand, {
            angle: -1.05 + rand() * 0.2,
            spacing: 5.5 + lit * 12,
            width: 1,
            alpha: 0.45,
          });
        }
        break;
      }
      case "fore":
      case "head":
      case "tail": {
        wash(ctx, poly, PAGES_TINT, rand, { alpha: 0.1, layers: 2, spread: 3, granulation: 0.2 });
        // the leaves, seen edge-on: lines running the length of the face
        const [a, b, c, d] = poly;
        const long = Math.hypot(b[0] - a[0], b[1] - a[1]) > Math.hypot(d[0] - a[0], d[1] - a[1]);
        const lines = Math.max(3, Math.round((model.T * k) / 7));
        for (let i = 1; i < lines; i++) {
          const t = (i + (rand() - 0.5) * 0.5) / lines;
          const p0 = long ? [a[0] + (d[0] - a[0]) * t, a[1] + (d[1] - a[1]) * t] : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const p1 = long ? [b[0] + (c[0] - b[0]) * t, b[1] + (c[1] - b[1]) * t] : [d[0] + (c[0] - d[0]) * t, d[1] + (c[1] - d[1]) * t];
          const trimA = 0.05 + rand() * 0.2;
          const trimB = 0.05 + rand() * 0.2;
          const q0 = [p0[0] + (p1[0] - p0[0]) * trimA, p0[1] + (p1[1] - p0[1]) * trimA];
          const q1 = [p1[0] + (p0[0] - p1[0]) * trimB, p1[1] + (p0[1] - p1[1]) * trimB];
          penStroke(ctx, [q0, q1], rand, { width: 0.8, wobble: 0.5, alpha: 0.4 });
        }
        break;
      }
      case "first-page":
      case "pastedown": {
        wash(ctx, poly, PAGES_TINT, rand, { alpha: 0.05, layers: 1, spread: 2, granulation: 0 });
        if (f.kind === "first-page") {
          // a few lines of "writing", suggested rather than written
          const frame = edgeFrame(3, 2, 0);
          onFace(ctx, frame, () => {
            for (let i = 0; i < 9; i++) {
              const y = 0.2 + i * 0.065;
              const x1 = 0.72 - (i === 8 ? 0.3 : rand() * 0.12);
              ctx.fillStyle = rgba(INK, 0.22);
              ctx.fillRect(0.16, y, x1 - 0.16, 0.006);
            }
          });
        }
        break;
      }
    }

    // lettering: the title on the front board, the title down the spine
    if (f.kind === "cover" && f.key === "pz") {
      // corners: (x0,y0) (x1,y0) (x1,y1) (x0,y1) with y up — so the
      // top-left of the cover as read is corner 3
      const frame = edgeFrame(3, 2, 0);
      const W = model.W;
      onFace(ctx, frame, () => {
        // local units: 100 to the board's height, the same scale across
        ctx.scale(1 / (100 * W), 1 / 100);
        ctx.fillStyle = rgba(INK, 0.82);
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        let size = 11;
        ctx.font = `${size}px "Homemade Apple"`;
        let lines = wrap(ctx, entry.book.title, 78 * W).filter(Boolean);
        while (lines.length > 3 && size > 7) {
          size -= 1;
          ctx.font = `${size}px "Homemade Apple"`;
          lines = wrap(ctx, entry.book.title, 78 * W).filter(Boolean);
        }
        lines.forEach((line, i) => ctx.fillText(line, 50 * W, 26 + i * size * 1.45));
        ctx.font = `7px "Homemade Apple"`;
        ctx.fillStyle = rgba(INK, 0.65);
        // a long name is written smaller, not cut short
        let authorSize = 7;
        while (ctx.measureText(entry.book.author).width > 86 * W && authorSize > 4.5) {
          authorSize -= 0.5;
          ctx.font = `${authorSize}px "Homemade Apple"`;
        }
        ctx.fillText(entry.book.author, 50 * W, 84);
      });
    }

    if (f.kind === "spine") {
      // spine face corners: axis x, a = y, b = z → (y0,z0) (y1,z0) (y1,z1) (y0,z1)
      // text runs head → tail (−y); letters stand toward the front board (+z)
      const frame = { o: poly[2], u: [poly[3][0] - poly[2][0], poly[3][1] - poly[2][1]], v: [poly[1][0] - poly[2][0], poly[1][1] - poly[2][1]] };
      const aspect = model.T / 1; // spine is T wide, 1 tall
      onFace(ctx, frame, () => {
        // local u ∈ [0,1] along the spine, v ∈ [0,1] across it
        ctx.scale(1 / 100, 1 / (100 * aspect));
        ctx.fillStyle = rgba(INK, 0.78);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const size = Math.min(9, 100 * aspect * 0.5);
        ctx.font = `${size}px "Homemade Apple"`;
        let title = entry.book.title;
        while (ctx.measureText(title).width > 70 && title.length > 4) title = title.slice(0, -2).trimEnd() + "…";
        ctx.fillText(title.replace(/……$/, "…"), 44, 50 * aspect);
      });
    }

    const outline = f.kind === "board-edge" ? 1.7 : 2.3;
    penPolygon(ctx, poly, rand, { width: outline, wobble: 0.9 });
  }
}

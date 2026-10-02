/*
  The ribbon lies between the Contents' two pages, on the recto of Leaf
  c. It is shaped as one more sheet in the stack, half a Leaf's thickness
  above that recto, and turns with Leaf c: it lies beneath Leaf c − 1 as
  that Leaf lifts off it, rides over on c's recto, and comes to rest
  under c on the left. It never jumps from one side to the other, and
  never comes through a Leaf lying on it. While a Leaf lies flat on top
  of it only the tail that hangs out past the foot is drawn.
*/

import * as THREE from "three";
import { PAGE_H } from "./dimensions.js";
import { NZ, S, curl, restProfile } from "./leaf.js";
import { clamp, lerp } from "../util.js";

// a satin ribbon lying down the gutter and out past the foot of the page
// (its head sits clear of the spine, where the Leaves close up to nothing)
const RIBBON = { width: 0.017, tail: 0.15, x0: 0.02, x1: 0.06, onPage: 18, hanging: 8, across: 5 };
const ROWS = RIBBON.onPage + RIBBON.hanging;

// its shape across the page at each of the Leaf's own rows: between them
// it is straight where the Leaf is straight, so it never dips through it
const rowX = Array.from({ length: NZ + 1 }, () => new Float32Array(S.length));
const rowY = Array.from({ length: NZ + 1 }, () => new Float32Array(S.length));

// a point `s` along row `j` from the spine, between samples
function along(j, s) {
  let i = 1;
  while (i < S.length - 1 && S[i] < s) i++;
  const k = clamp((s - S[i - 1]) / (S[i] - S[i - 1]));
  return [lerp(rowX[j][i - 1], rowX[j][i], k), lerp(rowY[j][i - 1], rowY[j][i], k)];
}

// a point `s` from the spine, `zn` of the way from head to foot
function at(zn, s) {
  const j = Math.min(NZ - 1, Math.floor(zn * NZ));
  const k = zn * NZ - j;
  const [x0, y0] = along(j, s);
  const [x1, y1] = along(j + 1, s);
  return [lerp(x0, x1, k), lerp(y0, y1, k)];
}

export class Ribbon {
  /*
    `leaf` is the Contents Leaf it marks. It belongs to `right` (and folds
    over with it at the end) until that Leaf starts to turn, then to `left`.
  */
  constructor(leaf, { left, right }) {
    this.leaf = leaf;
    this.homes = { left, right };
    const { across } = RIBBON;
    // several across, so it follows the page's steep curve into the gutter
    // instead of cutting a flat chord through it
    this.positions = new Float32Array(ROWS * across * 3);
    const idx = [];
    for (let i = 0; i < ROWS - 1; i++) {
      for (let j = 0; j < across - 1; j++) {
        const a = i * across + j;
        idx.push(a, a + 1, a + across, a + 1, a + across + 1, a + across);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({ color: 0x7a2c25, roughness: 0.36, metalness: 0.08, side: THREE.DoubleSide })
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    left.add(this.mesh);
  }

  // `progress`, `lag` as the stack laid the Leaves out (stack.js)
  update({ progress, lag }, { tau, openness, N }) {
    const c = this.leaf;
    const t = progress(c);
    const gap = tau / 2;
    const right = restProfile((N - c) * tau + gap, openness);
    const left = restProfile((c + 1) * tau - gap, openness);
    const covered = progress(c - 1) <= 0 || t >= 1;
    const parent = t <= 0 ? this.homes.right : this.homes.left;
    if (this.mesh.parent !== parent) parent.add(this.mesh);

    for (let j = 0; j <= NZ; j++) curl(t, right, left, lag, j / NZ, rowX[j], rowY[j]);

    const { onPage, hanging, across } = RIBBON;
    const p = this.positions;
    const zEnd = PAGE_H / 2;
    const zStart = covered ? zEnd - 0.06 : -PAGE_H / 2 + 0.02;
    for (let i = 0; i < ROWS; i++) {
      // the last row on the page lies exactly on its foot, where the ribbon
      // goes over the edge: rows either side of it would cut the corner
      // under the paper
      let z = lerp(zStart, zEnd, i / (onPage - 1));
      let fall = 0;
      if (i >= onPage) {
        // past the foot of the page the ribbon falls away
        const k = (i - onPage + 1) / hanging;
        z = zEnd + k * RIBBON.tail;
        fall = 0.05 * k * k + 0.01 * k;
      }
      const zn = clamp((z + PAGE_H / 2) / PAGE_H);
      const mid = lerp(RIBBON.x0, RIBBON.x1, zn);
      for (let j = 0; j < across; j++) {
        const [x, y] = at(zn, mid + (j / (across - 1) - 0.5) * RIBBON.width);
        p.set([x, y - fall, z], (i * across + j) * 3);
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }
}

/*
  Paper geometry: how a Leaf lies, how it turns, and the page blocks
  beneath.

  Coordinates are the Journal's own: the spine runs along z at x = 0, pages
  lie in the x–z plane with y pointing up out of the paper, the head of
  the page is at z = −H/2. A page on the right runs from the spine to
  x = W; one on the left runs to x = −W.

  Every Leaf is described along its own length s (0 at the spine, W at the
  fore-edge) by the angle φ(s) its surface makes with the table. Lying on
  the right, φ is small, rising out of the gutter onto the page block;
  lying on the left, φ is near π. Turning is an interpolation between the
  two, with the fore-edge corner leading, so the sheet curls over rather
  than pivoting as a flat card. Integrating φ along s gives the shape, so
  the paper never stretches.
*/

import * as THREE from "three";
import { PAGE_H, PAGE_W } from "./dimensions.js";
import { pictureTexture } from "./textures.js";
import { clamp } from "../util.js";

// how far the rise out of the gutter reaches across the page
const GUTTER = 0.075;

const NX = 44;
export const NZ = 10;

// samples along the page, crowded toward the spine where the paper bends
export const S = Array.from({ length: NX + 1 }, (_, i) => PAGE_W * Math.pow(i / NX, 1.55));

/*
  The shape of a page lying on a block `h` thick, `open` from 0 (closed
  flat under the cover) to 1 (lying open, falling into the gutter).
  Returns x and y at each sample in S, and the angle of each step between
  samples — which a turning Leaf reuses, so at rest it lies exactly on
  the block.
*/
export function restProfile(h, open) {
  const n = S.length;
  const seg = new Float32Array(n);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const rise = h * open;
  y[0] = h - rise;
  const angleAt = (px) => Math.atan((rise * Math.exp(-px / GUTTER)) / GUTTER);
  for (let i = 1; i < n; i++) {
    const ds = S[i] - S[i - 1];
    // midpoint step: φ taken where the step is, not where it started
    const a0 = angleAt(x[i - 1]);
    const a1 = angleAt(x[i - 1] + ds * Math.cos(a0) * 0.5);
    x[i] = x[i - 1] + ds * Math.cos(a1);
    y[i] = y[i - 1] + ds * Math.sin(a1);
    seg[i] = a1;
  }
  return { seg, x, y, h };
}

const smooth = (t) => {
  const c = clamp(t);
  return c * c * (3 - 2 * c);
};

/*
  One row of a sheet `t` of the way through a turn, `zn` of the way from
  head (0) to foot (1): x and y at each sample in S, written into `x`, `y`.
  `right` and `left` are the rest profiles it leaves from and arrives on;
  `lag` is how far the spine end trails the corner.
*/
export function curl(t, right, left, lag, zn, x, y) {
  const n = S.length;
  // the corner nearest the reader, at the foot, leads the turn
  const reach = 0.72 + 0.28 * zn;
  const T = (i) => smooth((t - lag + lag * (S[i] / PAGE_W) * reach) / (1 - lag));
  x[0] = 0;
  y[0] = right.y[0] + (left.y[0] - right.y[0]) * T(0);
  for (let i = 1; i < n; i++) {
    const ds = S[i] - S[i - 1];
    const tm = (T(i - 1) + T(i)) / 2;
    const aR = right.seg[i];
    const aL = Math.PI - left.seg[i];
    const a = aR + (aL - aR) * tm;
    x[i] = x[i - 1] + ds * Math.cos(a);
    y[i] = y[i - 1] + ds * Math.sin(a);
  }
}

const rowX = new Float32Array(S.length);
const rowY = new Float32Array(S.length);

export class Leaf {
  constructor() {
    const verts = (NX + 1) * (NZ + 1);
    this.positions = new Float32Array(verts * 3);
    const uvs = new Float32Array(verts * 2);
    const index = [];
    for (let j = 0; j <= NZ; j++) {
      for (let i = 0; i <= NX; i++) {
        const k = j * (NX + 1) + i;
        uvs[k * 2] = S[i] / PAGE_W;
        uvs[k * 2 + 1] = 1 - j / NZ;
        if (i < NX && j < NZ) {
          const a = k;
          const b = k + 1;
          const c = k + NX + 1;
          const d = c + 1;
          index.push(a, c, b, b, c, d);
        }
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    // normals from the start, though they're only worked out once shaped:
    // without them its shaders would be compiled for flat shading
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(index);

    this.frontMaterial = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, side: THREE.FrontSide });
    this.backMaterial = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, side: THREE.BackSide });
    this.front = new THREE.Mesh(this.geometry, this.frontMaterial);
    this.back = new THREE.Mesh(this.geometry, this.backMaterial);
    this.front.castShadow = true;
    this.front.receiveShadow = true;
    this.back.receiveShadow = true;
    this.frontMaterial.shadowSide = THREE.DoubleSide;
    this.group = new THREE.Group();
    this.group.add(this.front, this.back);
    this.front.userData.leaf = this;
    this.back.userData.leaf = this;
    this.frontPage = -1;
    this.backPage = -1;
  }

  setMaps(front, back) {
    if (this.frontMaterial.map !== front) {
      this.frontMaterial.map = front;
      this.frontMaterial.needsUpdate = true;
    }
    if (this.backMaterial.map !== back) {
      this.backMaterial.map = back;
      this.backMaterial.needsUpdate = true;
    }
  }

  /*
    Shape the leaf `t` of the way through a turn (0 lying on the right,
    1 on the left). `right` and `left` are the rest profiles it leaves from
    and arrives on. `lag` is how far the spine end trails the corner.
  */
  shape(t, right, left, lag = 0.32) {
    const p = this.positions;
    const n = S.length;
    for (let j = 0; j <= NZ; j++) {
      const zn = j / NZ;
      const z = -PAGE_H / 2 + zn * PAGE_H;
      curl(t, right, left, lag, zn, rowX, rowY);
      for (let i = 0; i < n; i++) {
        const k = (j * n + i) * 3;
        p[k] = rowX[i];
        p[k + 1] = rowY[i];
        p[k + 2] = z;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}

/*
  A page block seen from its three open sides: head, tail and fore-edge.
  Its top follows the same rest profile as the page lying on it, so the
  two meet exactly. `side` is +1 for the right-hand block, −1 for the left.
*/
export class PageBlock {
  constructor(side, { anisotropy }) {
    this.side = side;
    const n = S.length;
    // head and tail: a strip of 2n verts each; fore-edge: 4 verts
    this.positions = new Float32Array((n * 4 + 4) * 3);
    this.uvs = new Float32Array((n * 4 + 4) * 2);
    const index = [];
    for (let f = 0; f < 2; f++) {
      const base = f * n * 2;
      for (let i = 0; i < n - 1; i++) {
        const a = base + i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const e = n * 4;
    index.push(e, e + 1, e + 2, e + 1, e + 3, e + 2);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(this.positions.length), 3));
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(this.uvs, 2));
    this.geometry.setIndex(index);

    // the edges, seen edge-on (cover-art.js), arrive with the covers
    this.texture = pictureTexture({ anisotropy, repeat: true });
    this.material = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  update(profile, leaves) {
    const { x, y, h } = profile;
    const n = S.length;
    const p = this.positions;
    const uv = this.uvs;
    const sx = this.side;
    const visible = h > 1e-5;
    this.mesh.visible = visible;
    if (!visible) return;
    // a page's worth of stripes per leaf
    this.texture.repeat.set(1, Math.max(0.02, leaves / 256));

    for (let f = 0; f < 2; f++) {
      const z = f === 0 ? PAGE_H / 2 : -PAGE_H / 2;
      for (let i = 0; i < n; i++) {
        const k = (f * n * 2 + i * 2) * 3;
        p[k] = sx * x[i];
        p[k + 1] = 0;
        p[k + 2] = z;
        p[k + 3] = sx * x[i];
        p[k + 4] = y[i];
        p[k + 5] = z;
        const q = (f * n * 2 + i * 2) * 2;
        uv[q] = x[i];
        uv[q + 1] = 0;
        uv[q + 2] = x[i];
        uv[q + 3] = 1;
      }
    }
    const e = n * 4 * 3;
    const fx = sx * x[n - 1];
    const top = y[n - 1];
    const verts = [
      [fx, 0, -PAGE_H / 2], [fx, top, -PAGE_H / 2],
      [fx, 0, PAGE_H / 2], [fx, top, PAGE_H / 2],
    ];
    verts.forEach((v, i) => {
      p[e + i * 3] = v[0];
      p[e + i * 3 + 1] = v[1];
      p[e + i * 3 + 2] = v[2];
    });
    const eu = n * 4 * 2;
    [[0, 0], [0, 1], [1, 0], [1, 1]].forEach(([u, v], i) => {
      uv[eu + i * 2] = u;
      uv[eu + i * 2 + 1] = v;
    });
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}

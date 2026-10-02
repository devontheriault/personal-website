/*
  The Leaves: the page block on each side, the Leaf lying on top of each
  block (the pages you read), and the Leaves in the air mid-turn.

  Leaf i is `progress(i)` of the way through its turn: 0 lying on the
  right, 1 on the left. Only the top Leaf of each block is modelled as a
  sheet; the rest are the block. A Leaf in the air lies over the ones
  below it on either side, so they are stacked by thickness.
*/

import { Leaf, PageBlock, restProfile } from "./leaf.js";
import { show } from "./textures.js";

const IN_THE_AIR = 9; // the most Leaves ever in the air at once

export class PageStack {
  constructor({ left, right }, { leafCount, leafThickness, anisotropy }) {
    this.N = leafCount;
    this.tau = leafThickness;

    this.rightBlock = new PageBlock(1, { anisotropy });
    this.leftBlock = new PageBlock(-1, { anisotropy });
    right.add(this.rightBlock.mesh);
    left.add(this.leftBlock.mesh);

    this.rightTop = new Leaf();
    this.leftTop = new Leaf();
    right.add(this.rightTop.group);
    left.add(this.leftTop.group);

    this.flying = Array.from({ length: IN_THE_AIR }, () => {
      const leaf = new Leaf();
      leaf.group.visible = false;
      left.add(leaf.group);
      return leaf;
    });
  }

  /*
    Lay the Leaves out for turn state `P` (how many Leaves have turned),
    `width` (how many are in the air at once, in a riffle) and `riffle`
    (which Leaves a riffle starts and ends on). `openness` is how far the
    pages have fallen into the gutter. Returns how thick each side lies
    and each Leaf's progress, for the binding and the ribbon.
  */
  update({ P, width = 1, riffle = null }, openness, textures) {
    const { N, tau } = this;
    width = Math.max(1, width);
    const progress = (i) => Math.min(1, Math.max(0, 0.5 + (P - i - 0.5) / width));

    const flying = [];
    let leftCount = 0;
    let kR = -1;
    let kL = -1;
    for (let i = 0; i < N; i++) {
      const p = progress(i);
      if (p >= 1) {
        leftCount++;
        kL = i;
      } else if (p <= 0) {
        if (kR < 0) kR = i;
      } else flying.push({ i, p });
    }
    const rightCount = N - leftCount - flying.length;
    const hL = leftCount * tau;
    const hR = rightCount * tau;
    const right = restProfile(hR, openness);
    const left = restProfile(hL, openness);

    this.rightBlock.update(right, rightCount);
    this.leftBlock.update(left, leftCount);

    // in a riffle only the first and last Leaves to move are ever seen
    // clearly; the ones between (in the air, or glimpsed on top of either
    // block as they pass) carry a suggestion of writing
    const real = (i) => !riffle || i === riffle.from || i === riffle.from - 1 || i === riffle.to || i === riffle.to - 1;

    // what the Leaves show now, kept whatever the budget
    const keep = new Set();
    this.rightTop.group.visible = kR >= 0;
    if (kR >= 0) {
      this.rightTop.setMaps(real(kR) ? textures.get(2 * kR + 1) : textures.generic(true), null);
      this.rightTop.frontPage = 2 * kR + 1;
      keep.add(real(kR) ? 2 * kR + 1 : "recto");
      this.rightTop.shape(0, right, left);
    }
    this.leftTop.group.visible = kL >= 0;
    if (kL >= 0) {
      this.leftTop.setMaps(null, real(kL) ? textures.get(2 * kL + 2) : textures.generic(false));
      this.leftTop.backPage = 2 * kL + 2;
      keep.add(real(kL) ? 2 * kL + 2 : "verso");
      this.leftTop.shape(1, right, left);
    }

    const lag = riffle ? 0.2 : 0.3;
    this.flying.forEach((leaf, n) => {
      const f = flying[n];
      leaf.group.visible = !!f;
      if (!f) return;
      const above = flying.filter((o) => o.i < f.i).length;
      const below = flying.length - 1 - above;
      const r = restProfile(hR + tau * (1 + below), openness);
      const l = restProfile(hL + tau * (1 + above), openness);
      if (real(f.i)) {
        leaf.setMaps(textures.get(2 * f.i + 1), textures.get(2 * f.i + 2));
        keep.add(2 * f.i + 1).add(2 * f.i + 2);
      } else {
        leaf.setMaps(textures.generic(true), textures.generic(false));
        keep.add("recto").add("verso");
      }
      leaf.shape(f.p, r, l, lag);
    });
    textures.evict(keep);

    return { hL, hR, progress, lag };
  }

  // the page edges' picture, one bitmap for both blocks
  showEdges(image) {
    show(this.rightBlock.texture, image, { keep: true });
    show(this.leftBlock.texture, image, { keep: true });
  }

  // every Leaf, lying or in the air, showing every kind of page it can:
  // for compiling their shaders before any is needed (journal-scene.js)
  *allLeaves() {
    yield this.rightTop;
    yield this.leftTop;
    yield* this.flying;
  }

  // the Leaves lying face up, which can be pointed at
  get readable() {
    const out = [];
    if (this.rightTop.group.visible) out.push(this.rightTop.front);
    if (this.leftTop.group.visible) out.push(this.leftTop.back);
    return out;
  }
}

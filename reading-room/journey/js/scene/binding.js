/*
  The binding: two cloth boards and the spine that bends between them.

  The front board swings open on a pivot halfway up the closed block, so
  its hinge edge sweeps round like a real joint. Everything that folds
  over at the end (the back board, the right-hand page block, the Leaf
  lying on it) lives in `rightInner`, inside `rightHalf`, which pivots
  halfway up whatever is still lying on the right.
*/

import * as THREE from "three";
import { BLOCK, BOARD_H, BOARD_T, BOARD_W } from "./dimensions.js";
import { pictureTexture, show, stampedMaps, stampedMaterial } from "./textures.js";

const SPINE_STEPS = 17;

export class Binding {
  /*
    Its pictures (the cloth and foil, and the pastedowns inside the boards:
    the title page inside the front, the last page inside the back) are
    drawn by the studio and arrive later, through `showCovers` and
    `showInsides`.
  */
  constructor(content, { anisotropy }) {
    this.front = stampedMaps({ anisotropy });
    // the back is only ever seen after folding over the spine: upside down
    this.back = stampedMaps({ anisotropy, upsideDown: true });
    this.spineMaps = stampedMaps({ anisotropy });
    this.cloth = {
      color: pictureTexture({ anisotropy, repeat: true }),
      bump: pictureTexture({ anisotropy, srgb: false, repeat: true }),
    };
    this.insides = {
      front: pictureTexture({ anisotropy, upsideDown: true }),
      back: pictureTexture({ anisotropy }),
    };
    this.covered = false;
    this.lined = false;

    const edge = new THREE.MeshStandardMaterial({
      map: this.cloth.color,
      bumpMap: this.cloth.bump,
      bumpScale: 1,
      roughness: 0.9,
    });
    const paper = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.93 });

    const board = (top, bottom) => {
      const g = new THREE.BoxGeometry(BOARD_W, BOARD_T, BOARD_H);
      g.translate(BOARD_W / 2, 0, 0);
      // px, nx, py, ny, pz, nz
      const mesh = new THREE.Mesh(g, [edge, edge, top, bottom, edge, edge]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    // front board: outside up when closed
    this.frontPivot = new THREE.Group();
    this.frontBoard = board(stampedMaterial(this.front), paper(this.insides.front));
    this.frontPivot.add(this.frontBoard);
    content.add(this.frontPivot);

    this.rightHalf = new THREE.Group();
    this.rightInner = new THREE.Group();
    this.rightHalf.add(this.rightInner);
    content.add(this.rightHalf);
    this.backBoard = board(paper(this.insides.back), stampedMaterial(this.back));
    this.backBoard.position.y = -BOARD_T / 2;
    this.rightInner.add(this.backBoard);

    this.spine = this.buildSpine(this.spineMaps);
    content.add(this.spine);
  }

  // the cloth and foil (workshop.covers)
  showCovers({ front, back, spine, cloth }) {
    for (const [maps, pictures] of [[this.front, front], [this.back, back], [this.spineMaps, spine], [this.cloth, cloth]]) {
      for (const k of Object.keys(maps)) show(maps[k], pictures[k]);
    }
    this.covered = true;
  }

  // the pastedowns (workshop.insides)
  showInsides({ front, back }) {
    show(this.insides.front, front);
    show(this.insides.back, back);
    this.lined = true;
  }

  // everything that can be seen, `open` and `close` as the scene has them,
  // has its picture (inside the boards can't be seen while it's shut)
  ready(open, close) {
    const shut = (open <= 0 && close <= 0) || close >= 1;
    return this.covered && (this.lined || shut);
  }

  get textures() {
    return [...Object.values(this.front), ...Object.values(this.back), ...Object.values(this.spineMaps), ...Object.values(this.cloth), ...Object.values(this.insides)];
  }

  // a strip of cloth, bent afresh every frame between the two hinges
  buildSpine(maps) {
    const n = SPINE_STEPS;
    this.spinePositions = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      uv[i * 4] = i / (n - 1);
      uv[i * 4 + 1] = 1;
      uv[i * 4 + 2] = i / (n - 1);
      uv[i * 4 + 3] = 0;
      if (i < n - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.spinePositions, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const material = stampedMaterial(maps);
    material.side = THREE.DoubleSide;
    const spine = new THREE.Mesh(g, material);
    spine.castShadow = true;
    return spine;
  }

  /*
    `coverAngle` swings the front board open (0 → π); `foldAngle` folds
    the back over at the end. `hL` and `hR` are how thick the Leaves lying
    on each side are.
  */
  update({ coverAngle, foldAngle, hL, hR, closing }) {
    const pivotF = BLOCK / 2;
    this.frontPivot.position.set(0, pivotF, 0);
    this.frontPivot.rotation.z = coverAngle;
    this.frontBoard.position.set(0, BLOCK / 2 + BOARD_T / 2, 0);

    const pivotR = (hL + hR) / 2;
    this.rightHalf.position.set(0, pivotR, 0);
    this.rightHalf.rotation.z = foldAngle;
    this.rightInner.position.set(0, -pivotR, 0);

    const rf = BLOCK / 2 + BOARD_T;
    const pf = [-Math.sin(coverAngle) * rf, pivotF + Math.cos(coverAngle) * rf];
    const rb = BOARD_T + pivotR;
    const pb = [Math.sin(foldAngle) * rb, pivotR - Math.cos(foldAngle) * rb];
    this.bendSpine(pb, pf, closing ? 1 : -1);
  }

  // a quadratic curve from the back board's hinge `pb` to the front's `pf`
  bendSpine(pb, pf, bulgeSide) {
    const p = this.spinePositions;
    const dx = pf[0] - pb[0];
    const dy = pf[1] - pb[1];
    const len = Math.hypot(dx, dy);
    this.spine.visible = len > 1e-4;
    if (!this.spine.visible) return;
    const cx = (pb[0] + pf[0]) / 2 + bulgeSide * len * 0.24;
    const cy = (pb[1] + pf[1]) / 2;
    const n = p.length / 6;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const a = (1 - u) * (1 - u);
      const b = 2 * u * (1 - u);
      const c = u * u;
      const x = a * pb[0] + b * cx + c * pf[0];
      const y = a * pb[1] + b * cy + c * pf[1];
      p.set([x, y, -BOARD_H / 2, x, y, BOARD_H / 2], i * 6);
    }
    const g = this.spine.geometry;
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }
}

/*
  The Journal in three dimensions: the renderer, the lamp, the camera,
  and the choreography that puts the binding (binding.js), the Leaves
  (stack.js) and the ribbon (ribbon.js) where a state says they are.

  The scene is driven entirely by a state object (see data/timeline.js):
    open   0 → 1   the cover swings open, the Journal settles flat
    close  0 → 1   the back cover folds over, the Journal floats again
    P              how many Leaves have been turned (fractional mid-turn)
    width          during a riffle, how many Leaves are in the air at once
    riffle         during a riffle, the Leaves it starts and ends on
    focus          −1 left page, 0 whole Spread, +1 right page (phones)
    mode           "spread" or "page" (phones: one page at a time)
    time, pointer  the closed Journal's drift, and its lean toward the pointer
    turn           a quaternion: the closed Journal turned in the hands
  Nothing here reads the scroll position or the clock; the same state
  always draws the same picture. It draws only when asked, and only once
  every picture it would show has arrived from the studio (`complete`).
*/

import * as THREE from "three";
import { RoomEnvironment } from "../../vendor/RoomEnvironment.js";
import { Binding } from "./binding.js";
import { BLOCK, BOARD_H, BOARD_T, BOARD_W } from "./dimensions.js";
import { PageTextures } from "./page-textures.js";
import { Ribbon } from "./ribbon.js";
import { PageStack } from "./stack.js";
import { pictureTexture, radialShadow } from "./textures.js";
import { PAGE } from "../art/layout.js";
import { clamp, easeInOut, lerp, smoothstep } from "../util.js";

const TILT = THREE.MathUtils.degToRad(12);
const FOV = 26;

const IDENTITY = new THREE.Quaternion();
// closed and floating: turned to show the spine, tipped to show the head
const POSE_FRONT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.36, 0.07, -0.56, "YXZ"));
// closed at the end, back cover up: the same pose, mirrored
const POSE_BACK = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.36, -0.07, 0.56, "YXZ"));

const ease = (a, b, x) => easeInOut(smoothstep(a, b, x));

// scratch, reused every frame
const q = new THREE.Quaternion();
const wobble = new THREE.Quaternion();
const tilt = new THREE.Quaternion();
const turn = new THREE.Quaternion();
const euler = new THREE.Euler();
const centre = new THREE.Vector3();
const target = new THREE.Vector3();
const VIEW = new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT));

export class JournalScene {
  /*
    `studio` draws the pages (art/studio.js); `binding` is the promised
    pictures of the binding, asked for from it already (early.js).
    `arrived` is called whenever a picture arrives, since a frame may be
    waiting for it.
  */
  constructor(canvas, journal, studio, { binding, arrived = () => {} }) {
    this.journal = journal;
    this.arrived = arrived;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // the lamp never moves, so the shadow is drawn again only when the
    // Journal does (see `moved`), not when only the camera or a page does
    renderer.shadowMap.autoUpdate = false;
    this.renderer = renderer;
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.32;
    pmrem.dispose();
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 40);
    this.camera.up.set(0, 0, -1);
    this.clear = { top: 0, bottom: 0 };

    // a warm reading lamp, up and to the left, beyond the head of the page
    const key = new THREE.DirectionalLight(0xfff5e8, 2.5);
    key.position.set(-1.7, 3.4, -1.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -1.8;
    sc.right = sc.top = 1.8;
    sc.near = 0.5;
    sc.far = 9;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 3;
    scene.add(key, key.target);
    scene.add(new THREE.HemisphereLight(0xfff3e2, 0x2a1d16, 0.5));

    // root: how the Journal is held; content: the Journal, centred in it
    this.root = new THREE.Group();
    this.content = new THREE.Group();
    this.root.add(this.content);
    scene.add(this.root);

    this.textures = new PageTextures(studio, renderer, { anisotropy, arrived });
    this.binding = new Binding(this.content, { anisotropy });
    const sides = { left: this.content, right: this.binding.rightInner };
    this.leafThickness = BLOCK / journal.leafCount;
    this.stack = new PageStack(sides, {
      leafCount: journal.leafCount,
      leafThickness: this.leafThickness,
      anisotropy,
    });

    binding.covers.then((c) => {
      this.binding.showCovers(c);
      this.stack.showEdges(c.edges);
      this.uploaded();
    });
    binding.insides.then((c) => {
      this.binding.showInsides(c);
      this.uploaded();
    });
    this.ribbon = new Ribbon(journal.contentsSpread, sides);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialShadow(), transparent: true, depthWrite: false, color: 0x000000 })
    );
    this.shadow.renderOrder = -1;
    scene.add(this.shadow);

    this.raycaster = new THREE.Raycaster();
    this.shapedFor = null;
    this.formedFor = null;
    this.last = null;
    // the Journal has moved or changed shape since the shadow was drawn
    this.moved = true;
    this.heldAs = { q: new THREE.Quaternion(), p: new THREE.Vector3(), c: new THREE.Vector3() };
  }

  // the binding's new pictures go up now, between frames, not in the next one
  uploaded() {
    for (const t of this.binding.textures) if (t.image) this.renderer.initTexture(t);
    this.arrived();
  }

  /*
    Compile every shader the Journal will ever use, all at once and (where
    the browser can) off the main thread, so that none is compiled in the
    middle of a movement. Leaves show a page on one side, the other, or
    both, and each of those is its own shader: every Leaf is shown here
    with both, and put back as it was.
  */
  async warm() {
    const stand = pictureTexture();
    const leaves = [this.stack.rightTop, this.stack.leftTop, ...this.stack.flying];
    const was = leaves.map((l) => [l.group.visible, l.frontMaterial.map, l.backMaterial.map]);
    leaves.forEach((l, i) => {
      l.group.visible = true;
      // one Leaf with each combination of pages
      l.setMaps(i % 3 === 1 ? null : stand, i % 3 === 0 ? null : stand);
    });
    await this.renderer.compileAsync(this.scene, this.camera);
    // and one frame, unseen (the page hides the canvas until the first
    // real one), for the rest of what a first frame costs: the shadow's
    // shaders, which compileAsync doesn't reach, and setting everything up.
    // It's paid while the binding is still being drawn.
    this.render();
    leaves.forEach((l, i) => {
      l.group.visible = was[i][0];
      l.setMaps(was[i][1], was[i][2]);
    });
    // (that shadow had every Leaf in it)
    this.moved = true;
  }

  // ------------------------------------------------------------ page art

  setHighlight(id) {
    this.textures.setHighlight(id);
  }

  refreshPages() {
    this.textures.refresh();
  }

  // ------------------------------------------------------------- layout

  resize(width, height, dpr) {
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.clearViewOffset(); // (updates the projection)
    Object.assign(this, { width, height, aspect: width / height, lift: 0 });
  }

  /*
    How many pixels the page's chrome takes above and below the closed
    Journal ("Scroll to open" beneath it). Closed, it sits in the band
    between them, so on a short screen the two never meet.
  */
  keepClear({ top, bottom }) {
    this.clear = { top, bottom };
  }

  // how far away the camera must be to fit w × h in view
  fit(w, h) {
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    return Math.max(h / (2 * t), w / (2 * t * this.aspect));
  }

  update(s) {
    this.last = s;
    const open = clamp(s.open);
    const close = clamp(s.close);
    const closing = close > 0;
    this.shape(s, open, close, closing);
    this.hold(s, open, close, closing);
    this.look(s, open, close, closing);
    this.shadowBeneath(open, close, closing);
  }

  /*
    Every picture the last state shows has arrived. (Shut, the Leaves
    can't be seen, so it needn't wait for their pages.)
  */
  get complete() {
    const s = this.last;
    if (!s) return false;
    const open = clamp(s.open);
    const close = clamp(s.close);
    const shut = (open <= 0 && close <= 0) || close >= 1;
    return this.binding.ready(open, close) && (shut || this.textures.missing === 0);
  }

  // for tests: resolves once the last state can be drawn in full, and
  // every drawing asked for (a highlight, say) has arrived
  async settled() {
    while (!this.complete || this.textures.drawing) {
      await new Promise((r) => setTimeout(r, 16));
      this.update(this.last);
    }
  }

  // ------------------------------------------------------------ pages

  // ask for these pages ahead of time
  want(indices, priority) {
    this.textures.want(indices, priority);
  }

  /*
    Ask for the pages of the Spreads around state `s` (the one before,
    and two after) before any Leaf needs them.
  */
  anticipate(s) {
    if (s.riffle || s.close >= 1) return;
    const k = Math.floor(s.P || 0);
    const near = [2 * k + 2, 2 * k + 3, 2 * k, 2 * k + 1, 2 * k - 1, 2 * k - 2, 2 * k + 4, 2 * k + 5];
    this.textures.want(near.filter((i) => i > 0), 1);
    // once open, a riffle may come at any moment
    if (s.open > 0) this.textures.wantGeneric();
  }

  /*
    The Journal itself: binding, Leaves and ribbon. Only redone when
    something that shapes them changes, so the closed Journal drifting
    in the air costs nothing but its pose.
  */
  shape(s, open, close, closing) {
    const form = `${open} ${close} ${s.P} ${s.width || 1} ${s.riffle ? `${s.riffle.from}-${s.riffle.to}` : ""}`;
    const key = `${form} ${this.textures.version}`;
    if (key === this.shapedFor) return;
    this.shapedFor = key;
    // (a new page on the same shape casts the same shadow)
    if (form !== this.formedFor) this.moved = true;
    this.formedFor = form;
    this.textures.begin();

    const coverAngle = Math.PI * ease(0.16, 0.78, open);
    const openness = closing ? 1 - smoothstep(0, 0.45, close) : smoothstep(0.3, 0.95, open);
    const foldAngle = Math.PI * ease(0.06, 0.7, close);

    const leaves = this.stack.update(s, openness, this.textures);
    this.binding.update({ coverAngle, foldAngle, hL: leaves.hL, hR: leaves.hR, closing });
    this.ribbon.update(leaves, { tau: this.leafThickness, openness, N: this.journal.leafCount });
    this.lying = leaves.hL + leaves.hR;
  }

  // where the Journal sits and how it's held
  hold(s, open, close, closing) {
    const shift = closing ? ease(0.3, 0.92, close) : 1 - ease(0.26, 0.9, open);
    if (closing) centre.set(-BOARD_W / 2 + 0.012, (this.lying + BOARD_T) / 2, 0);
    else centre.set(BOARD_W / 2 - 0.012, (BLOCK + BOARD_T) / 2, 0);
    this.content.position.copy(centre).multiplyScalar(shift).negate();

    if (closing) q.slerpQuaternions(IDENTITY, POSE_BACK, ease(0.45, 1, close));
    else q.slerpQuaternions(POSE_FRONT, IDENTITY, ease(0, 0.5, open));

    // floating: an almost imperceptible drift while closed
    const float = closing ? smoothstep(0.75, 1, close) : 1 - smoothstep(0, 0.22, open);
    const t = (s.time || 0) / 1000;
    const drift = Math.sin((t / 8) * Math.PI * 2);
    const sway = Math.sin((t / 11) * Math.PI * 2 + 1.3);
    wobble.setFromEuler(euler.set(drift * 0.012 * float, 0, sway * 0.016 * float));
    tilt.setFromEuler(euler.set((s.pointer?.y || 0) * 0.1 * float, 0, -(s.pointer?.x || 0) * 0.12 * float));
    // turned over in the hands while closed; it unwinds as the cover opens
    turn.identity();
    if (s.turn) turn.slerpQuaternions(IDENTITY, s.turn, float);
    this.root.quaternion.copy(turn).multiply(tilt).multiply(wobble).multiply(q);
    this.root.position.set(0, 0, drift * 0.014 * float);

    const was = this.heldAs;
    if (!was.q.equals(this.root.quaternion) || !was.p.equals(this.root.position) || !was.c.equals(this.content.position)) {
      this.moved = true;
      was.q.copy(this.root.quaternion);
      was.p.copy(this.root.position);
      was.c.copy(this.content.position);
    }
  }

  // the camera: framing the closed Journal, the open Spread, or one page
  look(s, open, close, closing) {
    const pageMode = s.mode === "page";
    const openFrame = pageMode ? this.fit(BOARD_W + 0.05, BOARD_H + 0.09) : this.fit(BOARD_W * 2 + 0.1, BOARD_H + 0.17);
    let closedFrame = pageMode ? this.fit(BOARD_W * 1.55, BOARD_H * 1.5) : this.fit(BOARD_W * 1.9, BOARD_H * 1.72);
    const framed = closing ? 1 - ease(0, 1, close) : ease(0, 1, open);
    // closed at the front, it keeps clear of the chrome (none shows at the back)
    const { top, bottom } = this.clear;
    const band = Math.max(0.2, 1 - (top + bottom) / this.height);
    if (!closing) closedFrame = Math.max(closedFrame, this.fit(0, (BOARD_H * 1.3) / band));
    this.shiftView(closing ? 0 : ((bottom - top) / 2) * (1 - framed));
    const focus = pageMode ? clamp(s.focus || 0, -1, 1) : 0;
    target.set(focus * (BOARD_W / 2 - 0.005) * framed, 0, 0.012 * framed);
    this.camera.position.copy(target).addScaledVector(VIEW, lerp(closedFrame, openFrame, framed));
    this.camera.lookAt(target);
  }

  // move the picture up the screen by `lift` pixels, turning nothing
  shiftView(lift) {
    if (Math.abs(lift - this.lift) < 0.01) return;
    this.lift = lift;
    const { width: w, height: h } = this;
    if (lift) this.camera.setViewOffset(w, h, 0, lift, w, h);
    else this.camera.clearViewOffset();
  }

  shadowBeneath(open, close, closing) {
    const lying = closing ? 1 - ease(0, 0.8, close) : ease(0.2, 1, open);
    const sh = this.shadow;
    const spreadW = lerp(BOARD_W * 1.3, BOARD_W * 2.35, lying);
    sh.scale.set(spreadW * lerp(1.15, 1.05, lying), 1, lerp(BOARD_H * 1.35, BOARD_H * 1.18, lying));
    sh.position.set(0.04 * (1 - lying), lerp(-0.85, -BOARD_T - 0.004, lying), lerp(0.1, 0.03, lying));
    sh.material.opacity = lerp(0.42, 0.62, lying);
  }

  render() {
    this.renderer.shadowMap.needsUpdate = this.moved;
    this.moved = false;
    this.renderer.render(this.scene, this.camera);
  }

  /*
    What is under the pointer: a Contents line, a page, the ribbon, or the
    Journal itself. `x`, `y` in normalised device coordinates.
  */
  pick(x, y) {
    this.raycaster.setFromCamera({ x, y }, this.camera);
    const { frontBoard, backBoard, spine } = this.binding;
    const targets = [this.ribbon.mesh, frontBoard, backBoard, spine, ...this.stack.readable];
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    if (hit.object === this.ribbon.mesh) return { type: "ribbon" };
    const leaf = hit.object.userData.leaf;
    if (leaf && hit.uv) {
      const right = leaf === this.stack.rightTop;
      const index = right ? leaf.frontPage : leaf.backPage;
      const u = right ? hit.uv.x : 1 - hit.uv.x;
      const px = u * PAGE.width;
      const py = (1 - hit.uv.y) * PAGE.height;
      const line = this.textures.hits(index).find(({ rect }) => px >= rect[0] && px <= rect[2] && py >= rect[1] && py <= rect[3]);
      if (line) return { type: "entry", id: line.id, page: index };
      return { type: "page", page: index };
    }
    return { type: "journal" };
  }
}

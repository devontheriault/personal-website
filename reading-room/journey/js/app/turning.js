/*
  Turning the closed Journal over in your hands.

  Dragging turns it about the screen's own axes, as though you had hold of
  it: across turns it about the vertical, up and down tips it towards or
  away from you. Let go and it carries on a little with the turn you gave
  it, then comes back to rest in its pose. main.js decides when it may be
  turned (only while it lies closed); the scene blends the turn out as the
  Journal opens, so a Journal left turned still opens cleanly.
*/

import * as THREE from "three";
import { smoothstep } from "../util.js";

const IDENTITY = new THREE.Quaternion();
const MAX_SPIN = 0.012; // radians per ms: a hard flick, not a spinning top
const COAST = 280; // ms: how long a flick carries on once let go
const SETTLE = 650; // ms: how quickly it comes back to its pose
const SETTLE_DELAY = 400; // ms: the pause before it starts back

const axis = new THREE.Vector3();
const up = new THREE.Vector3();
const across = new THREE.Vector3();
const dq = new THREE.Quaternion();

const angleOf = (q) => 2 * Math.acos(Math.min(1, Math.abs(q.w)));

export class Turning {
  constructor() {
    this.q = new THREE.Quaternion(); // the turn, in world space
    this.spin = new THREE.Vector3(); // axis × radians per ms, in world space
    this.held = false;
    this.last = 0;
    this.released = 0;
  }

  // still turning, or on its way back
  get moving() {
    return this.held || this.spin.lengthSq() > 0 || angleOf(this.q) > 0;
  }

  hold() {
    this.held = true;
    this.spin.set(0, 0, 0);
  }

  // the pointer moved (dx, dy) screen pixels in dt ms
  turn(camera, dx, dy, dt, perPixel) {
    const length = Math.hypot(dx, dy);
    if (!length) return;
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    across.set(1, 0, 0).applyQuaternion(camera.quaternion);
    axis.copy(up).multiplyScalar(dx).addScaledVector(across, dy).normalize();
    const angle = length * perPixel;
    this.q.premultiply(dq.setFromAxisAngle(axis, angle)).normalize();
    // how fast it's being turned, smoothed over the last few moves
    const ms = Math.max(dt, 8);
    this.spin.lerp(axis.multiplyScalar(Math.min(angle / ms, MAX_SPIN)), 1 - Math.exp(-ms / 50));
  }

  // let go; `still` is how long the pointer had been resting before it
  release(now, still) {
    this.held = false;
    if (still > 80) this.spin.set(0, 0, 0);
    this.last = this.released = now;
  }

  reset() {
    this.held = false;
    this.q.identity();
    this.spin.set(0, 0, 0);
  }

  step(now, reduced) {
    const dt = Math.min(now - this.last, 64);
    this.last = now;
    if (this.held) return;
    // with reduced motion it stays where it was put, until the Journal opens
    if (reduced) {
      this.spin.set(0, 0, 0);
      return;
    }
    const rate = this.spin.length();
    if (rate > 1e-6) {
      axis.copy(this.spin).divideScalar(rate);
      this.q.premultiply(dq.setFromAxisAngle(axis, rate * dt)).normalize();
      this.spin.multiplyScalar(Math.exp(-dt / COAST));
    } else {
      this.spin.set(0, 0, 0);
    }
    const pull = (1 - Math.exp(-dt / SETTLE)) * smoothstep(0, SETTLE_DELAY, now - this.released);
    this.q.slerp(IDENTITY, pull);
    if (!this.spin.lengthSq() && angleOf(this.q) < 1e-3) this.q.identity();
  }
}

import * as THREE from 'three';

/**
 * Tilted overhead camera, Zelda style. On wide screens it frames the whole play screen and stays put.
 * On tall (portrait) screens it frames a smaller window that follows Herman.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  tiltDeg = 45;
  private shakeAmt = 0;
  private target = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private distance = 20;
  private zShift = 0;
  private follow = false;
  private viewHalf = { w: 11, h: 6.5 };

  constructor(private screenHalf: { w: number; h: number }) {
    this.camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.5, 120);
    window.addEventListener('resize', () => this.refit());
  }

  setTilt(deg: number) {
    this.tiltDeg = deg;
    this.refit();
  }

  refit() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    const aspect = this.camera.aspect;
    this.follow = aspect < 1.25;
    if (this.follow) {
      // Upright phone or tablet: show a window around Herman (about 8 tiles across on a phone).
      const w = Math.min(this.screenHalf.w, THREE.MathUtils.clamp(aspect * 9, 4, 7));
      this.viewHalf = { w, h: 0.5 };
    } else {
      this.viewHalf = { w: this.screenHalf.w + 0.3, h: this.screenHalf.h + 0.3 };
    }
    this.fit(this.viewHalf.w, this.viewHalf.h);
  }

  /** Finds a camera distance (and small forward shift) so the rectangle fills the view. */
  private fit(hw: number, hh: number) {
    const cam = this.camera;
    const corners = [
      new THREE.Vector3(-hw, 0, -hh), new THREE.Vector3(hw, 0, -hh),
      new THREE.Vector3(-hw, 0, hh), new THREE.Vector3(hw, 0, hh),
    ];
    const v = new THREE.Vector3();
    const measure = (d: number, zs: number) => {
      this.place(new THREE.Vector3(0, 0, zs), d);
      let maxX = 0, top = -Infinity, bottom = Infinity;
      for (const c of corners) {
        v.copy(c).project(cam);
        maxX = Math.max(maxX, Math.abs(v.x));
        top = Math.max(top, v.y);
        bottom = Math.min(bottom, v.y);
      }
      return { maxX, top, bottom };
    };
    let zs = 0;
    let d = 20;
    for (let iter = 0; iter < 8; iter++) {
      let lo = 2, hi = 200;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        const m = measure(mid, zs);
        const over = Math.max(m.maxX, m.top, -m.bottom);
        if (over > 0.985) lo = mid; else hi = mid;
      }
      d = hi;
      const m = measure(d, zs);
      zs -= ((m.top + m.bottom) / 2) * hh * 0.6;
    }
    this.distance = d;
    this.zShift = zs;
    this.onFit?.(d);
    this.snap = true;
  }

  private snap = true;
  /** Called after the camera distance changes (used to keep fog at a sensible range). */
  onFit: ((distance: number) => void) | null = null;

  /** A quick jolt (hits, stomps). Amount is in world units. */
  shake(amount: number) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  private place(target: THREE.Vector3, d: number, shake = 0) {
    const t = THREE.MathUtils.degToRad(this.tiltDeg);
    const sx = shake ? (Math.random() - 0.5) * 2 * shake : 0;
    const sz = shake ? (Math.random() - 0.5) * 2 * shake : 0;
    this.camera.position.set(target.x + sx, target.y + Math.sin(t) * d, target.z + Math.cos(t) * d + sz);
    this.camera.lookAt(target.x + sx, target.y, target.z + sz);
    this.camera.updateMatrixWorld();
  }

  /** While set, the camera looks exactly here (used to slide from one screen to the next). */
  override: THREE.Vector3 | null = null;

  /** Where the camera would settle when Herman stands at `focus` on the current screen. */
  desiredFor(focus: THREE.Vector3, out = new THREE.Vector3()) {
    if (this.follow) {
      const mx = Math.max(0, this.screenHalf.w - this.viewHalf.w);
      const mz = Math.max(0, this.screenHalf.h - this.viewHalf.h);
      return out.set(
        THREE.MathUtils.clamp(focus.x, -mx, mx),
        0,
        THREE.MathUtils.clamp(focus.z, -mz, mz) + this.zShift,
      );
    }
    return out.set(0, 0, this.zShift);
  }

  /** Where the camera is looking right now. */
  get current() {
    return this.target;
  }

  /** Jump straight to the settled spot on the next update (no easing). */
  snapNow() {
    this.snap = true;
  }

  update(dt: number, focus: THREE.Vector3) {
    if (this.override) {
      this.target.copy(this.override);
      this.desired.copy(this.override);
      this.shakeAmt = 0;
      this.place(this.target, this.distance);
      return;
    }
    this.desiredFor(focus, this.desired);
    if (this.snap) {
      this.target.copy(this.desired);
      this.snap = false;
    } else {
      this.target.lerp(this.desired, 1 - Math.exp(-dt * 6));
    }
    this.shakeAmt *= Math.exp(-dt * 14);
    if (this.shakeAmt < 0.002) this.shakeAmt = 0;
    this.place(this.target, this.distance, this.shakeAmt);
  }
}

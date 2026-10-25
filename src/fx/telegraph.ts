import * as THREE from 'three';

/**
 * Red danger zones on the ground. Every big attack draws one first so the player can react:
 * a circle (or a slice of one) whose red fill grows out to the edge. When it reaches the edge, the attack lands.
 */

const vert = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const frag = /* glsl */ `
  uniform float uRadius; uniform float uProgress; uniform float uHalfAngle; uniform float uFlash; uniform vec3 uColor;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    if (r > uRadius) discard;
    float ang = abs(atan(vP.x, vP.y));
    if (ang > uHalfAngle) discard;
    float edge = smoothstep(uRadius - 0.09, uRadius - 0.03, r);
    float fill = step(r, uProgress * uRadius);
    float fillEdge = smoothstep(uProgress * uRadius - 0.08, uProgress * uRadius, r) * fill;
    float sideEdge = uHalfAngle < 3.1 ? smoothstep(uHalfAngle - 0.04 * uRadius / max(r, 0.2), uHalfAngle, ang) : 0.0;
    float a = 0.2 + fill * 0.34 + edge * 0.7 + fillEdge * 0.4 + sideEdge * 0.7;
    a = mix(a, 0.85, uFlash);
    gl_FragColor = vec4(uColor * (1.0 + uFlash * 1.5), a);
  }
`;

export interface Telegraph {
  x: number;
  z: number;
  radius: number;
  /** For slices: the direction the slice points (radians, like facing) and its half-width. */
  angle: number;
  halfAngle: number;
  duration: number;
  t: number;
  fired: boolean;
  onFire: (tg: Telegraph) => void;
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  flash: number;
  /** Follow a moving owner (e.g. an ogre's swipe) */
  follow?: () => { x: number; z: number; angle: number } | null;
}

export class Telegraphs {
  readonly group = new THREE.Group();
  private list: Telegraph[] = [];

  /** A red zone that fills over `duration` seconds, then calls onFire. */
  add(opts: {
    x: number; z: number; radius: number; duration: number; onFire: (tg: Telegraph) => void;
    angle?: number; halfAngle?: number; follow?: Telegraph['follow'];
  }): Telegraph {
    const uniforms = {
      uRadius: { value: opts.radius },
      uProgress: { value: 0 },
      uHalfAngle: { value: opts.halfAngle ?? Math.PI },
      uFlash: { value: 0 },
      uColor: { value: new THREE.Color(1.6, 0.18, 0.12) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(opts.radius * 2, opts.radius * 2), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = (opts.angle ?? 0) + Math.PI;
    mesh.position.set(opts.x, 0.06, opts.z);
    mesh.renderOrder = 3;
    this.group.add(mesh);
    const tg: Telegraph = {
      x: opts.x, z: opts.z, radius: opts.radius, angle: opts.angle ?? 0, halfAngle: opts.halfAngle ?? Math.PI,
      duration: opts.duration, t: 0, fired: false, onFire: opts.onFire, mesh, uniforms, flash: 0, follow: opts.follow,
    };
    this.list.push(tg);
    return tg;
  }

  /** Is a point inside this zone? */
  static contains(tg: Telegraph, x: number, z: number, pad = 0): boolean {
    const dx = x - tg.x;
    const dz = z - tg.z;
    const d = Math.hypot(dx, dz);
    if (d > tg.radius + pad) return false;
    if (tg.halfAngle >= Math.PI - 0.01) return true;
    let da = Math.atan2(dx, dz) - tg.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    return Math.abs(da) <= tg.halfAngle + pad / Math.max(d, 0.5);
  }

  cancelAll() {
    for (const tg of this.list) this.group.remove(tg.mesh);
    this.list = [];
  }

  /** Remove zones belonging to something that died. */
  cancel(tg: Telegraph) {
    const i = this.list.indexOf(tg);
    if (i >= 0) {
      this.group.remove(tg.mesh);
      this.list.splice(i, 1);
    }
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tg = this.list[i];
      if (tg.follow && !tg.fired) {
        const f = tg.follow();
        if (f) {
          tg.x = f.x;
          tg.z = f.z;
          tg.angle = f.angle;
          tg.mesh.position.set(f.x, 0.06, f.z);
          tg.mesh.rotation.z = f.angle + Math.PI;
        }
      }
      if (!tg.fired) {
        tg.t += dt;
        const k = Math.min(1, tg.t / tg.duration);
        tg.uniforms.uProgress.value = k;
        if (k >= 1) {
          tg.fired = true;
          tg.onFire(tg);
          tg.flash = 1;
        }
      } else {
        tg.flash -= dt / 0.25;
        tg.uniforms.uFlash.value = Math.max(0, tg.flash);
        (tg.mesh.material as THREE.ShaderMaterial).opacity = tg.flash;
        if (tg.flash <= 0) {
          this.group.remove(tg.mesh);
          (tg.mesh.material as THREE.Material).dispose();
          tg.mesh.geometry.dispose();
          this.list.splice(i, 1);
        }
      }
    }
  }
}

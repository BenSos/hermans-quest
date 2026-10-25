import * as THREE from 'three';
import { toon } from '../core/toon';

/**
 * Combat juice: sword slash arcs, hit sparks, slime goo bursts, the target ring
 * and the dash cooldown ring under Herman's feet.
 */

type Particle = { m: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number; spin: number; grow: number; gravity: number };

export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  private slashes: { m: THREE.Mesh; life: number }[] = [];
  private sparkGeo = new THREE.OctahedronGeometry(0.07, 0);
  private gooGeo = new THREE.IcosahedronGeometry(0.09, 1);
  private sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.8, 1.6) });
  private emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.1, 0.2) });
  private slashGeo: THREE.BufferGeometry;
  get slashGeometry() {
    return this.slashGeo;
  }

  constructor() {
    // A crescent: the swoosh of the sword, lying flat, opening toward +z (Herman's front).
    // Brightest along the outer edge, tapering off at both tips.
    const start = -Math.PI * 0.5 - 1.1;
    const len = 2.2;
    const g = new THREE.RingGeometry(0.8, 1.5, 32, 3, start, len);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const r = Math.hypot(x, y);
      let ang = Math.atan2(y, x) - start;
      while (ang < 0) ang += Math.PI * 2;
      const u = THREE.MathUtils.clamp(ang / len, 0, 1);
      const radial = THREE.MathUtils.smoothstep(r, 0.8, 1.42) * (1 - THREE.MathUtils.smoothstep(r, 1.42, 1.5) * 0.6);
      const taper = Math.pow(Math.sin(u * Math.PI), 0.7) * (0.35 + 0.65 * u);
      const k = radial * taper;
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.rotateX(-Math.PI / 2);
    this.slashGeo = g;
  }

  slash(x: number, z: number, angle: number) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.5, 1.6, 1.9),
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(this.slashGeo, mat);
    m.position.set(x, 0.62, z);
    m.rotation.y = angle;
    this.group.add(m);
    this.slashes.push({ m, life: 1 });
  }

  sparks(x: number, y: number, z: number, n = 7, mat?: THREE.Material) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sparkGeo, mat ?? this.sparkMat);
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 3;
      this.add(m, new THREE.Vector3(Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s), 0.28, 10, -0.9, 9);
    }
  }

  goo(x: number, z: number, color: number, n = 12, size = 1) {
    const mat = toon(color, { emissive: 0x0a1a05 });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.gooGeo, mat);
      m.position.set(x, 0.3 * size, z);
      m.scale.setScalar((0.7 + Math.random() * 0.8) * size);
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2.5;
      this.add(m, new THREE.Vector3(Math.cos(a) * s, 2.5 + Math.random() * 3, Math.sin(a) * s), 0.6, 4, -1.2, 14);
    }
  }

  /** A rising spark of fire (burning monsters). */
  ember(x: number, y: number, z: number) {
    const m = new THREE.Mesh(this.sparkGeo, this.emberMat);
    m.position.set(x, y, z);
    this.add(m, new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.6, (Math.random() - 0.5) * 0.4), 0.45, 6, -0.9, -1.5);
  }

  /** Bright burst of colored sparks (power-ups, chest opening, phoenix). */
  burst(x: number, y: number, z: number, color: THREE.Color, n = 24, speed = 5) {
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sparkGeo, mat);
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      this.add(m, new THREE.Vector3(Math.cos(a) * speed * (1 - up * 0.5), 2 + up * speed, Math.sin(a) * speed * (1 - up * 0.5)), 0.7, 8, -0.8, 6);
    }
  }

  /** A soft ring of dust (used when dashing and when slimes land). */
  puffRing(x: number, z: number, color = 0xf3e6c8, n = 8) {
    const mat = toon(color, { transparent: true, opacity: 0.8, depthWrite: false });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.gooGeo, mat);
      const a = (i / n) * Math.PI * 2;
      m.position.set(x + Math.cos(a) * 0.2, 0.08, z + Math.sin(a) * 0.2);
      this.add(m, new THREE.Vector3(Math.cos(a) * 2, 0.4, Math.sin(a) * 2), 0.35, 0, 1.6, 0);
    }
  }

  private add(m: THREE.Mesh, vel: THREE.Vector3, life: number, spin: number, grow: number, gravity: number) {
    this.group.add(m);
    this.particles.push({ m, vel, life, maxLife: life, spin, grow, gravity });
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.m);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.m.position.addScaledVector(p.vel, dt);
      if (p.m.position.y < 0.04) {
        p.m.position.y = 0.04;
        p.vel.multiplyScalar(0.5);
        p.vel.y = 0;
      }
      p.m.rotation.x += p.spin * dt;
      p.m.rotation.y += p.spin * dt * 0.7;
      const k = p.life / p.maxLife;
      const s = p.grow >= 0 ? 1 + (1 - k) * p.grow : Math.max(0.01, 1 + (1 - k) * p.grow);
      p.m.scale.setScalar(s * (p.m.userData.base ?? (p.m.userData.base = p.m.scale.x)));
      const mat = p.m.material as THREE.Material & { opacity?: number };
      if (mat.transparent) mat.opacity = k * 0.8;
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.life -= dt / 0.16;
      if (s.life <= 0) {
        this.group.remove(s.m);
        (s.m.material as THREE.Material).dispose();
        this.slashes.splice(i, 1);
        continue;
      }
      (s.m.material as THREE.MeshBasicMaterial).opacity = s.life * 0.85;
      s.m.scale.setScalar(1 + (1 - s.life) * 0.18);
    }
  }
}

/** A ground ring that fills up like a clock hand, e.g. the dash cooldown. */
export function makeProgressRing(inner: number, outer: number, color: THREE.Color) {
  const uniforms = {
    uProgress: { value: 1 },
    uColor: { value: color },
    uOpacity: { value: 0.85 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress; uniform vec3 uColor; uniform float uOpacity; varying vec2 vP;
      void main() {
        float a = atan(vP.x, vP.y) / 6.2831853 + 0.5;
        if (a > uProgress) discard;
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 48), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return { mesh, uniforms };
}

/** Red rotating brackets under whatever Herman is aiming at. */
export function makeTargetRing() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.5, 0.45), transparent: true, opacity: 0.9, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const arc = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 12, 1, i * (Math.PI / 2) + 0.25, Math.PI / 2 - 0.5), mat);
    arc.rotation.x = -Math.PI / 2;
    g.add(arc);
  }
  g.position.y = 0.04;
  g.renderOrder = 2;
  return g;
}

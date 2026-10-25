import * as THREE from 'three';

/** Cartoon river: two blues, drifting light streaks and foam flecks that flow downstream (+x). */
/**
 * Where the current screen sits in the big Adventure map. Every river shares it, so ripples line up
 * across neighboring screens and don't jump when the camera slides to the next screen.
 */
export const waterFrame = { value: new THREE.Vector2(0, 0) };

export function buildWater(width: number, depth: number, cx: number, cz: number, y: number, round = false) {
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x2b86c9) },
    uLight: { value: new THREE.Color(0x5cc3ee) },
    uFoam: { value: new THREE.Color(0xeefaff) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uBank: { value: new THREE.Vector2(cz - depth / 2 + 0.5, cz + depth / 2 - 0.5) },
    uCz: { value: cz },
    uFrame: waterFrame,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vBankZ;
      uniform float uCz;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vBankZ = w.z - modelMatrix[3].z + uCz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uDeep; uniform vec3 uLight; uniform vec3 uFoam; uniform vec2 uBank; uniform vec3 uTint; uniform vec2 uFrame;
      varying vec3 vWorld;
      varying float vBankZ;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 p = vWorld.xz + uFrame;
        float n1 = noise(vec2(p.x * 0.55 - uTime * 0.55, p.y * 1.8));
        float n2 = noise(vec2(p.x * 1.4 - uTime * 1.1, p.y * 3.4 + 7.0));
        float n3 = noise(vec2(p.x * 2.6 - uTime * 1.6, p.y * 5.0 - 3.0));
        // toward the banks the water gets lighter
        float bank = 1.0 - smoothstep(0.0, 0.9, min(vBankZ - uBank.x, uBank.y - vBankZ) + 0.6);
        vec3 col = mix(uDeep, uLight, step(0.55, n1 + bank * 0.5) * 0.85);
        float streak = step(0.8, n2) * step(0.45, n1);
        col = mix(col, uFoam, streak * 0.65);
        float fleck = step(0.86, n3);
        col = mix(col, uFoam, fleck * 0.9);
        gl_FragColor = vec4(col * uTint, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(round ? new THREE.CircleGeometry(width / 2, 28) : new THREE.PlaneGeometry(width, depth, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, y, cz);
  return {
    mesh,
    update: (t: number) => (uniforms.uTime.value = t),
    setTint: (c: THREE.Color) => uniforms.uTint.value.copy(c),
  };
}

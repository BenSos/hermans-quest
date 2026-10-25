import * as THREE from 'three';
import { toonGradient } from '../core/toon';

/**
 * Thousands of little grass blades that sway in the wind and bend away from Herman's feet.
 * One instanced mesh, one draw call.
 */
export interface GrassField {
  mesh: THREE.InstancedMesh;
  update: (time: number, player: THREE.Vector3) => void;
}

export function buildGrass(points: { x: number; z: number; tint: THREE.Color }[], seed = 1): GrassField {
  const h = 0.26;
  const w = 0.055;
  // A curved, tapered blade (7 points): wide at the root, leaning a little, with a sharp tip.
  const lean = (k: number) => k * k * 0.04;
  const verts = new Float32Array([
    -w, 0, 0, w, 0, 0,
    -w * 0.8, h * 0.35, lean(0.35), w * 0.8, h * 0.35, lean(0.35),
    -w * 0.5, h * 0.7, lean(0.7), w * 0.5, h * 0.7, lean(0.7),
    0, h, lean(1),
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(Array.from({ length: 7 }, () => [0, 1, 0]).flat()), 3));
  geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);

  const uniforms = {
    uTime: { value: 0 },
    uPlayer: { value: new THREE.Vector3(999, 0, 999) },
  };
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uPlayer = uniforms.uPlayer;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime; uniform vec3 uPlayer; varying float vBladeH;`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
         vec4 root = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float hk = position.y / ${h.toFixed(3)};
         vBladeH = hk;
         float wind = sin(uTime * 1.7 + root.x * 0.35 + root.z * 0.22) * 0.6
                    + sin(uTime * 3.3 + root.x * 1.1 - root.z * 0.7) * 0.25;
         vec3 bend = vec3(wind * 0.09, 0.0, wind * 0.03);
         vec2 away = root.xz - uPlayer.xz;
         float dist = length(away);
         float push = 1.0 - smoothstep(0.15, 0.75, dist);
         bend.xz += (away / max(dist, 0.001)) * push * 0.2;
         bend.y -= push * 0.09;
         vec3 localBend = inverse(mat3(instanceMatrix)) * bend;
         transformed += localBend * hk * hk;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vBladeH;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         // Shady roots, sunlit tips with a hint of yellow
         diffuseColor.rgb *= mix(0.6, 1.08, vBladeH);
         diffuseColor.rgb += vec3(0.07, 0.06, -0.02) * smoothstep(0.55, 1.0, vBladeH);`,
      );
  };
  mat.customProgramCacheKey = () => 'grass-blades';

  // One blade per spot (the original amount of grass)
  const mesh = new THREE.InstancedMesh(geo, mat, points.length);
  const dummy = new THREE.Object3D();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  points.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, rnd() * Math.PI, 0);
    const k = 0.7 + rnd() * 0.7;
    dummy.scale.set(k, k * (0.8 + rnd() * 0.5), k);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, p.tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  // Skip drawing grass the camera can't see (padding covers wind sway)
  mesh.computeBoundingSphere();
  if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.6;

  return {
    mesh,
    update: (time, player) => {
      uniforms.uTime.value = time;
      uniforms.uPlayer.value.copy(player);
    },
  };
}

import * as THREE from 'three';

/**
 * Toon (cel) shading helpers shared by every model in the game.
 * Everything uses a 3-step gradient so light falls off in bands, like a cartoon.
 */

let gradient: THREE.DataTexture | null = null;

export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([120, 195, 255]);
  gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(
  color: THREE.ColorRepresentation,
  opts: THREE.MeshToonMaterialParameters = {},
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });
}

/* ---------- Outlines (inverted hull) ---------- */

export const OUTLINE_COLOR = 0x23202e;
const outlineMats = new Map<number, THREE.MeshBasicMaterial>();
const outlineMeshes: THREE.Object3D[] = [];
let outlinesOn = true;

export function outlineMaterial(thickness: number): THREE.MeshBasicMaterial {
  const key = Math.round(thickness * 1000);
  const cached = outlineMats.get(key);
  if (cached) return cached;
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3(position) + normalize(normal) * ${thickness.toFixed(4)};`,
    );
  };
  m.customProgramCacheKey = () => `outline-${key}`;
  outlineMats.set(key, m);
  return m;
}

/** Adds a black shell around a mesh so it reads like an inked cartoon. */
export function addOutline<T extends THREE.Mesh>(
  mesh: T,
  thickness = 0.03,
  geometry: THREE.BufferGeometry = mesh.geometry,
): T {
  let shell: THREE.Mesh;
  if (mesh instanceof THREE.InstancedMesh) {
    const inst = new THREE.InstancedMesh(geometry, outlineMaterial(thickness), mesh.count);
    inst.instanceMatrix = mesh.instanceMatrix;
    inst.frustumCulled = false;
    shell = inst;
  } else {
    shell = new THREE.Mesh(geometry, outlineMaterial(thickness));
  }
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.visible = outlinesOn;
  shell.userData.isOutline = true;
  mesh.add(shell);
  outlineMeshes.push(shell);
  return mesh;
}

export function setOutlines(on: boolean) {
  outlinesOn = on;
  for (const o of outlineMeshes) o.visible = on;
}

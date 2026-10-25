import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { valueNoise } from './noise';

/** Shared-vertex copy with smooth normals (no cracks in outline shells). */
export function smooth(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.clone();
  g.deleteAttribute('normal');
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  return m;
}

/** A lumpy sphere: the building block for tree canopies, bushes and clouds. */
export function blob(radius: number, seed: number, wobble = 0.18, detail = 2): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const k = 1 + (valueNoise(n.x * 2.3 + seed * 7.1, n.y * 2.3 + n.z * 1.7 + seed) - 0.5) * wobble * 2;
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function at(
  geo: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = sx,
  sz = sx,
): THREE.BufferGeometry {
  const g = geo.clone();
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geos.map((g) => {
    let c = g.index ? g : mergeVertices(g, 1e-4);
    c = c.clone();
    for (const name of Object.keys(c.attributes)) if (name !== 'position' && name !== 'normal') c.deleteAttribute(name);
    if (!c.getAttribute('normal')) c.computeVertexNormals();
    return c;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('merge failed');
  return merged;
}

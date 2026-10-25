import * as THREE from 'three';

/** Sun, sky and fog. Three times of day so we can compare the mood. */

interface Preset {
  sunColor: number;
  sunIntensity: number;
  sunDir: [number, number, number];
  sky: number;
  ground: number;
  hemi: number;
  bg: number;
}

export const TIME_PRESETS: Record<'morning' | 'noon' | 'sunset' | 'night', Preset> = {
  morning: { sunColor: 0xffe2b8, sunIntensity: 2.6, sunDir: [-10, 10, -4], sky: 0xcfe4ff, ground: 0x7a9a55, hemi: 1.55, bg: 0xbfe0f5 },
  noon: { sunColor: 0xfff6e6, sunIntensity: 2.9, sunDir: [-6, 14, -5], sky: 0xc4e6ff, ground: 0x6f9a48, hemi: 1.6, bg: 0xa9dcf5 },
  sunset: { sunColor: 0xffb47e, sunIntensity: 2.5, sunDir: [11, 7, -5], sky: 0xffd6bd, ground: 0x6a7350, hemi: 1.35, bg: 0xf2bf9c },
  night: { sunColor: 0x9db8ff, sunIntensity: 1.25, sunDir: [6, 12, -6], sky: 0x3b4f8f, ground: 0x1d2a1f, hemi: 0.9, bg: 0x101a33 },
};

export type TimeOfDay = keyof typeof TIME_PRESETS;

export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;

  constructor(private scene: THREE.Scene) {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.sun = sun;
    scene.fog = new THREE.Fog(0xffffff, 32, 62);
  }

  /** Herman's lantern: a warm glow around him that only shows at night. */
  readonly lantern = new THREE.PointLight(0xffb066, 0, 7, 1.6);
  current: TimeOfDay = 'morning';
  private sunOffset = new THREE.Vector3(0, 30, 0);
  private focus = new THREE.Vector3();

  /** Keep the sun (and its shadows) centered on the part of the map the camera is looking at. */
  setFocus(x: number, z: number) {
    this.focus.set(x, 0, z);
    this.sun.position.copy(this.focus).add(this.sunOffset);
    this.sun.target.position.copy(this.focus);
  }

  /** Torch-lit dungeon: dim cold light from above, warm torches do the rest. */
  applyDungeon() {
    this.lantern.intensity = 6;
    this.sun.color.setHex(0x8b9cd6);
    this.sun.intensity = 0.9;
    this.sunOffset.set(-4, 30, 6);
    this.setFocus(this.focus.x, this.focus.z);
    this.hemi.color.setHex(0x59607e);
    this.hemi.groundColor.setHex(0x2a2420);
    this.hemi.intensity = 1.0;
    const bg = new THREE.Color(0x07060b);
    this.scene.background = bg;
    (this.scene.fog as THREE.Fog).color.copy(bg);
  }

  apply(name: TimeOfDay) {
    const p = TIME_PRESETS[name];
    this.current = name;
    this.lantern.intensity = name === 'night' ? 9 : 0;
    this.sun.color.setHex(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    const [x, y, z] = p.sunDir;
    const dir = new THREE.Vector3(x, y, z).normalize().multiplyScalar(30);
    this.sunOffset.copy(dir);
    this.setFocus(this.focus.x, this.focus.z);
    this.hemi.color.setHex(p.sky);
    this.hemi.groundColor.setHex(p.ground);
    this.hemi.intensity = p.hemi;
    const bg = new THREE.Color(p.bg);
    this.scene.background = bg;
    (this.scene.fog as THREE.Fog).color.copy(bg);
  }
}

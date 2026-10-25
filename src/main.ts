import * as THREE from 'three';
import './ui/style.css';
import { Renderer } from './core/renderer';
import { Input } from './core/input';
import { setOutlines } from './core/toon';
import { CameraRig } from './game/cameraRig';
import { Lighting } from './game/lighting';
import { GREENMEADOW_1 } from './world/greenmeadow';
import { buildScreen, BuiltScreen } from './world/screen';
import { waterFrame } from './world/water';
import { buildDungeon, Side } from './world/dungeon';
import { AREAS, OPPOSITE, area } from './world/world';
import { sfx } from './core/sfx';
import { Butterflies, DustPuffs } from './world/ambient';
import { Herman, WeaponId } from './entities/herman';
import { Slime } from './entities/slime';
import { Skeleton } from './entities/skeleton';
import { Ogre } from './entities/ogre';
import { Enemy, EnemyContext, EnemyKind, StatusKind } from './game/enemy';
import { Weapons, WEAPON_ORDER } from './game/weapons';
import { WaveDirector, HeartPickup, KeyPickup, CoinPickup, ACTS } from './game/waves';
import { Bullets } from './game/bullets';
import { Rocks, Rock, ROCK_BLAST_RADIUS } from './game/rocks';
import { Owned, Offer, Rarity, RARITIES, POWERS, CHEST_ODDS, computeState, rollOffers, rarityInfo } from './game/powerups';
import { Effects, makeProgressRing, makeTargetRing } from './fx/effects';
import { Telegraphs } from './fx/telegraph';
import { Hud, PauseMenu, DeathScreen, TitleScreen, VictoryScreen, GameMode, loadSettings } from './ui/hud';
import { PowerChooser, ownedListHtml } from './ui/powerUi';
import { SandboxPanel } from './ui/sandbox';
import { ShopPanel, ShopKind } from './ui/shop';
import { save, persist, eraseSave, addGold, applyProgression, progressionHearts, gearEffects, luckyWeights, GOLD_VALUE } from './game/save';

/* ---------- World ---------- */
const app = document.getElementById('app')!;
const scene = new THREE.Scene();
// Two maps: the meadow and the dungeon. Both are built up front; switching just swaps which one is live.
const meadow = buildScreen(GREENMEADOW_1);
const dungeon = buildDungeon();
dungeon.group.visible = false;
scene.add(meadow.group, dungeon.group);
let screen: BuiltScreen = meadow;

const rig = new CameraRig({ w: screen.width / 2, h: screen.depth / 2 });
const renderer = new Renderer(app, scene, rig.camera);
const lighting = new Lighting(scene);
const startSettings = loadSettings();
rig.tiltDeg = startSettings.tilt;
lighting.apply(startSettings.time);
scene.add(lighting.lantern);
const input = new Input(renderer.gl.domElement);
const hud = new Hud();
const fx = new Effects();
const telegraphs = new Telegraphs();
const bullets = new Bullets();
scene.add(fx.group, telegraphs.group, bullets.group);

const herman = new Herman();
herman.position.copy(screen.spawn);
herman.root.rotation.y = Math.PI;
scene.add(herman.root, herman.ghosts);

const weapons = new Weapons(herman, screen.collision, fx);
scene.add(weapons.group);

/* ---------- Rocks Herman can lift and throw (each outdoor screen has its own) ---------- */
const rocksByScreen = new Map<BuiltScreen, Rocks>();
function rocksFor(s: BuiltScreen): Rocks | null {
  if (s.kind !== 'meadow' || !s.rockSpots.length) return null;
  let r = rocksByScreen.get(s);
  if (!r) {
    r = new Rocks(s.collision, s.rockSpots);
    r.onLand = onRockLand;
    scene.add(r.group);
    rocksByScreen.set(s, r);
  }
  return r;
}
let rocks: Rocks | null = rocksFor(screen);
let carried: Rock | null = null;
let aiming = false;
const aimPos = new THREE.Vector3();
const handPos = new THREE.Vector3();

const butterflies = new Butterflies([
  new THREE.Vector3(-6, 0, -4.5), new THREE.Vector3(4.5, 0, -5), new THREE.Vector3(-7, 0, 3),
  new THREE.Vector3(4, 0, 2.5), new THREE.Vector3(8, 0, 4.5),
]);
scene.add(butterflies.group);
const dust = new DustPuffs();
scene.add(dust.group);

const dashRing = makeProgressRing(0.48, 0.58, new THREE.Color(2.2, 1.9, 0.9));
scene.add(dashRing.mesh);
const targetRing = makeTargetRing();
scene.add(targetRing);

// A bouncing golden arrow over the chest when Herman has the key
const chestMarker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 2.1, 0.5) }));
chestMarker.rotation.x = Math.PI;
chestMarker.visible = false;
scene.add(chestMarker);

/* ---------- Monsters ---------- */
const enemies: Enemy[] = [];
const hearts: HeartPickup[] = [];
let keyPickup: KeyPickup | null = null;
let container: HeartPickup | null = null; // Adventure: the boss's Heart Container
const coins: CoinPickup[] = [];
/** Moving to another area: 'fade' (through the keep gate) or 'scroll' (slide to the screen next door). */
let transition: {
  kind: 'fade' | 'scroll'; t: number; to: string; side: Side; swapped: boolean;
  dur?: number; off?: THREE.Vector3; hFrom?: THREE.Vector3; hTo?: THREE.Vector3;
  camFrom?: THREE.Vector3; camTo?: THREE.Vector3; face?: number;
} | null = null;
let shownNeighbors: BuiltScreen[] = [];
let hasKey = false;
let wavesCleared = 0;

function createEnemy(kind: EnemyKind, x: number, z: number, hpMul = 1, dropIn = true): Enemy {
  let e: Enemy;
  if (kind === 'green' || kind === 'blue' || kind === 'mini' || kind === 'kingSlime') e = new Slime(kind, x, z, Math.random, dropIn, hpMul);
  else if (kind === 'skelWarrior' || kind === 'skelArcher' || kind === 'skelKing') e = new Skeleton(kind, x, z, Math.random, hpMul);
  else e = new Ogre(kind, x, z, Math.random, hpMul);
  enemies.push(e);
  scene.add(e.root);
  return e;
}

function spawnPoint(minDist = 5, ok?: (x: number, z: number) => boolean): { x: number; z: number } {
  for (let i = 0; i < 80; i++) {
    const x = (Math.random() - 0.5) * (screen.width - 3);
    const z = (Math.random() - 0.5) * (screen.depth - 3);
    if (Math.hypot(x - herman.position.x, z - herman.position.z) < minDist) continue;
    if (ok && !ok(x, z)) continue;
    if (enemies.some((e) => Math.hypot(e.root.position.x - x, e.root.position.z - z) < 1.4)) continue;
    if (screen.walkable(x, z)) return { x, z };
  }
  return { x: -8, z: 3 };
}

/** Bosses need a big open spot on Herman's side of the river. */
function bossPoint(): { x: number; z: number } {
  const south = herman.position.z > 0;
  for (let i = 0; i < 80; i++) {
    const x = (Math.random() - 0.5) * (screen.width - 6);
    const z = south ? 1.5 + Math.random() * 3.5 : -5 + Math.random() * 3;
    if (Math.hypot(x - herman.position.x, z - herman.position.z) < 5) continue;
    if (!screen.walkable(x, z)) continue;
    const p = { x, z };
    screen.collision.resolve(p, 1.2);
    if (Math.hypot(p.x - x, p.z - z) < 0.05) return { x, z };
  }
  return spawnPoint(4);
}

const director = new WaveDirector((kind, hpMul, isBoss) => {
  const p = isBoss ? bossPoint() : spawnPoint();
  createEnemy(kind, p.x, p.z, hpMul);
});

/* ---------- Power-ups ---------- */
let owned: Owned[] = [];
let phoenixUsed = false;
let heartContainers = 0;
const chooser = new PowerChooser();
let chestOpenT = -1;
let rewardDone = false;

function applyPowers() {
  const st = computeState(owned);
  const adventure = mode === 'adventure';
  if (adventure) applyProgression(st);
  weapons.setPower(st);
  herman.speed = 4.6 * st.moveMul;
  herman.dashCooldown = Math.max(0.45, 1.5 * st.dashMul);
  herman.dashDistMul = adventure ? 1 + gearEffects().dashDist : 1;
  // Gear from Jerry shows on Herman in Adventure; Arena and Sandbox are plain clothes
  herman.setGear(adventure ? Object.values(save.equipped).filter((x): x is string => !!x) : []);
  const newMax = 10 + heartContainers * 2 + st.maxHeartsBonus + (adventure ? progressionHearts() : 0);
  if (newMax > herman.maxHalves) herman.halves += newMax - herman.maxHalves;
  herman.maxHalves = newMax;
  herman.halves = Math.min(herman.halves, herman.maxHalves);
  herman.phoenix = st.phoenix && !phoenixUsed;
  pauseMenu?.setOwned(ownedListHtml(owned));
}

/** Take a power-up card: add it, heal if it heals, celebrate. */
function grantOffer(o: Offer) {
  owned.push({ def: o.def, rarity: o.rarity });
  const heal = o.def.heal?.(o.rarity);
  applyPowers();
  if (heal === 'full') herman.halves = herman.maxHalves;
  else if (heal) herman.heal(heal);
  const r = rarityInfo(o.rarity);
  hud.showToast(`${o.def.name}!`, `${r.name}: ${o.def.describe(o.rarity)}`, 3200);
  fx.burst(herman.position.x, 1, herman.position.z, new THREE.Color(r.color).multiplyScalar(2.5), 26, 4);
  sfx.pick();
}

/** Show three power-up cards after the chest lid swings open. */
function offerPowers(weights: number[] | undefined, title: string | undefined, after: () => void) {
  const offers = rollOffers(owned, Math.random, 3, weights);
  const best = Math.max(...offers.map((o) => RARITIES.findIndex((r) => r.id === o.rarity)));
  sfx.chest(best);
  setTimeoutGame(0.7, () => {
    input.release();
    chooser.show(offers, owned, (o: Offer) => {
      grantOffer(o);
      after();
    }, weights, title);
  });
}

function openChest() {
  if (!hasKey || chooser.open) return;
  hasKey = false;
  chestOpenT = 0;
  const c = screen.chestPos;
  fx.burst(c.x, 0.6, c.z, new THREE.Color(3, 2.4, 0.9), 30, 4);
  rig.shake(0.1);
  offerPowers(undefined, undefined, () => {
    rewardDone = true;
    setTimeoutGame(2.5, () => (chestOpenT = -2));
  });
}

/* Game-time timers (they pause with the game) */
const timers: { t: number; fn: () => void }[] = [];
function setTimeoutGame(seconds: number, fn: () => void) {
  timers.push({ t: seconds, fn });
}

/* ---------- Hurting Herman ---------- */
function hurtPlayer(halves: number, fromX: number, fromZ: number): boolean {
  if (mode === 'sandbox' && sandbox.invincible) return false;
  // In the air, Herman sails right over ground attacks
  if (herman.airborne) return false;
  if (mode === 'adventure' && herman.alive && !herman.invulnerable) {
    const block = gearEffects().block;
    if (block > 0 && Math.random() < block) {
      herman.hurt(0, fromX, fromZ);
      sfx.block();
      fx.sparks(herman.position.x, 0.9, herman.position.z, 6);
      const s = toScreen(herman.position.x, 2, herman.position.z);
      hud.number('Blocked!', s.x, s.y, 'heal');
      return false;
    }
  }
  if (!herman.hurt(halves, fromX, fromZ)) return false;
  hud.hurtFlash();
  sfx.hurt();
  rig.shake(halves >= 3 ? 0.32 : 0.18);
  fx.sparks(herman.position.x, 0.8, herman.position.z, 5);
  const s = toScreen(herman.position.x, 2, herman.position.z);
  hud.number(halves === 1 ? '-½' : `-${halves / 2}`, s.x, s.y, 'hurt');
  return true;
}

herman.onPhoenix = () => {
  phoenixUsed = true;
  fx.burst(herman.position.x, 0.8, herman.position.z, new THREE.Color(3, 1.4, 0.3), 50, 6);
  hud.big('Phoenix Feather!', 'Herman rises again', 2200);
  rig.shake(0.3);
};

const ctx: EnemyContext = {
  dt: 0, t: 0, player: herman.position, playerAlive: true,
  collision: screen.collision, river: screen.river, walkable: screen.walkable,
  fx, telegraphs, bullets, camera: rig.camera,
  hurtPlayer,
  spawn: (kind, x, z) => {
    const p = { x, z };
    screen.collision.resolve(p, 0.4);
    if (screen.collision.waterAt(p.x, p.z)) return;
    createEnemy(kind, p.x, p.z, wavesRunning() ? director.spec?.hpMul ?? 1 : 1, kind !== 'mini');
  },
  shake: (a) => rig.shake(a),
  onDot: (e: Enemy, amount: number, kind: StatusKind) => {
    const s = toScreen(e.root.position.x, 0.9 + (e.isBoss ? 1.5 : 0), e.root.position.z);
    hud.number(String(Math.max(1, Math.round(amount))), s.x + (Math.random() - 0.5) * 20, s.y, kind);
  },
};

/* ---------- Waves ---------- */
director.onWaveStart = (n, spec) => {
  const act = Math.floor((n - 1) / 10);
  if (spec.boss) sfx.bossIntro();
  else sfx.waveStart();
  if (spec.boss) {
    const name = act < 3 ? ACTS[act].bossName : ACTS[(act - 3) % 3].bossName;
    hud.big(name, 'Boss fight! Big hits take 1½ hearts.', 2600);
  } else if ((n - 1) % 10 === 0) {
    hud.big(`Wave ${n}`, act === 0 ? 'Here come the slimes!' : act === 1 ? 'The skeletons rise!' : act === 2 ? 'Ogres incoming!' : 'Everything at once!', 2200);
  } else hud.big(`Wave ${n}`);
};
director.onWaveCleared = (n, spec) => {
  wavesCleared = n;
  if (spec.boss) hud.big('Boss defeated!', 'Grab the key and open the chest', 2600);
  else hud.big('Wave cleared!', weapons.groundArrowCount ? 'Your arrows fly home' : '', 1800);
  weapons.recallArrows();
};

weapons.onHit = (ev) => {
  if (ev.enemy === crystalTarget) return;
  const s = toScreen(ev.x, ev.y, ev.z);
  hud.number(String(Math.max(1, Math.round(ev.damage))), s.x, s.y, ev.killed ? 'kill' : 'hit');
  if (ev.killed) sfx.kill();
  else sfx.hit();
  rig.shake(ev.killed ? 0.12 : 0.05);
};
/** The crystal switch acts like a target so the bow and boomerang aim at it automatically. */
const crystalTarget: Enemy = {
  root: new THREE.Group(), radius: 0.45, kind: 'mini', isBoss: false, displayName: '', hp: 1, maxHp: 1, contactDamage: 0,
  state: 'alive',
  targetable: () => true,
  harmful: () => false,
  hit: () => {
    const cp = screen.crystalPos;
    if (cp) activateCrystal(cp);
    return 0;
  },
  applyStatus: () => {},
  update: () => {},
  dispose: () => {},
};
let crystalOn = false;
function activateCrystal(cp: THREE.Vector3): boolean {
  if (screen.hitCrystal?.()) {
    crystalOn = true;
    screen.revealBridge?.();
    ctx.river = screen.river;
    sfx.crystal();
    setTimeoutGame(0.5, () => sfx.puzzle());
    fx.burst(cp.x, 1.1, cp.z, new THREE.Color(0.8, 1.6, 3), 30, 4);
    rig.shake(0.25);
    hud.big('A bridge rises from the lava!', '', 2200);
    return true;
  }
  return false;
}
weapons.onProjectile = (x, z) => {
  const cp = screen.crystalPos;
  if (!cp || Math.hypot(x - cp.x, z - cp.z) > 0.7) return false;
  if (!activateCrystal(cp)) fx.sparks(cp.x, 1.1, cp.z, 4);
  return true;
};
weapons.onOutOfArrows = () => hud.showToast('Out of arrows!', 'Walk over them to pick them up, or switch weapons.');

/* ---------- Settings, pause, death ---------- */
let paused = false;
let mapReady = false;
let timeSetting = startSettings.time;
let arenaMap = startSettings.map;
type Mode = GameMode;
let mode: Mode = startSettings.mode;
let started = false;

function applyMapLighting() {
  if (screen.kind === 'dungeon') lighting.applyDungeon();
  else lighting.apply(timeSetting);
  pauseMenu?.setDungeonNote(screen.kind === 'dungeon');
}

/** Remove every monster, bullet, warning circle and pickup from the field. */
function clearField() {
  for (const e of enemies) {
    e.dispose(ctx);
    scene.remove(e.root);
  }
  enemies.length = 0;
  for (const h of hearts) scene.remove(h.mesh);
  hearts.length = 0;
  if (keyPickup) scene.remove(keyPickup.mesh);
  keyPickup = null;
  if (container) scene.remove(container.mesh);
  container = null;
  // Coins still on the ground go straight into Herman's pocket
  let left = 0;
  for (const c of coins) {
    scene.remove(c.mesh);
    left += c.value;
  }
  coins.length = 0;
  if (left && mode === 'adventure' && herman.alive) addGold(left);
  bullets.clear();
  telegraphs.cancelAll();
}

/** Gold bursts out of a monster or chest as coins. */
function spawnCoins(x: number, z: number, total: number, spread = 1) {
  if (mode !== 'adventure' || total <= 0) return;
  const n = Math.min(12, total);
  const each = Math.floor(total / n);
  let extra = total - each * n;
  for (let i = 0; i < n; i++) {
    const c = new CoinPickup(x, z, each + (extra-- > 0 ? 1 : 0), spread);
    coins.push(c);
    scene.add(c.mesh);
  }
}

/** Make another screen the live one (any map, any mode). */
function setScreen(next: BuiltScreen) {
  dropRock();
  if (rocks) {
    rocks.showAim(null, null, 0);
    rocks.group.visible = false;
  }
  hideNeighbors();
  if (next !== screen) {
    screen.group.visible = false;
    screen = next;
  }
  screen.group.visible = true;
  screen.group.position.set(0, 0, 0);
  screen.setNorthTall?.(true);
  setShadows(screen, true);
  if (mode !== 'adventure') waterFrame.value.set(0, 0);
  ctx.collision = screen.collision;
  ctx.river = screen.river;
  ctx.walkable = screen.walkable;
  weapons.setCollision(screen.collision);
  weapons.collectAll();
  clearField();
  rocks = rocksFor(screen);
  if (rocks) {
    rocks.group.visible = true;
    rocks.group.position.set(0, 0, 0);
  }
  const inMeadow = screen.kind === 'meadow';
  butterflies.group.visible = inMeadow;
  // Butterflies flutter around solid things (well, trees, houses) but pass right by Herman
  butterflies.setObstacles(screen.collision.colliders.filter((c) => !c.water && !c.low));
  hud.setHandsAvailable(inMeadow);
  if (!inMeadow && weapons.current === 'hands') selectWeapon('sword');
  screen.setWaterTint(timeSetting === 'night' ? new THREE.Color(0.32, 0.42, 0.75) : new THREE.Color(1, 1, 1));
  applyMapLighting();
}

/* ---------- The Adventure map is one big connected world, one screen at a time ---------- */
const SCREEN_W = 22;
const SCREEN_H = 13;

/** Neighbor screens skip casting shadows (cheaper to draw); the current screen gets them back. */
function setShadows(s: BuiltScreen, on: boolean) {
  if (s.group.userData.shadowsOn === on) return;
  s.group.userData.shadowsOn = on;
  s.group.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    if (o.userData.castShadow === undefined) o.userData.castShadow = o.castShadow;
    o.castShadow = on && o.userData.castShadow;
  });
}

function hideNeighbors() {
  for (const n of shownNeighbors) {
    if (n === screen) continue;
    n.group.visible = false;
    n.group.position.set(0, 0, 0);
    const r = rocksByScreen.get(n);
    if (r) {
      r.group.visible = false;
      r.group.position.set(0, 0, 0);
    }
  }
  shownNeighbors = [];
}

/** Outdoors, the screens around this one sit right next to it, so you see the next field past the edge. */
function layoutNeighbors() {
  hideNeighbors();
  if (mode !== 'adventure') return;
  const a = area(adv.area);
  if (a.kind !== 'meadow') return;
  for (const n of AREAS) {
    if (n.id === a.id || n.region !== a.region || n.kind !== 'meadow' || n.secret || a.secret) continue;
    const dx = n.grid.x - a.grid.x, dy = n.grid.y - a.grid.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) continue;
    placeNeighbor(n.id, dx * SCREEN_W, dy * SCREEN_H);
  }
}

/** Each frame: hide neighbor screens the camera can't see at all (saves a lot of drawing). */
const camFrustum = new THREE.Frustum();
const camMat = new THREE.Matrix4();
const nbBox = new THREE.Box3();
function cullNeighbors() {
  if (!shownNeighbors.length) return;
  camMat.multiplyMatrices(rig.camera.projectionMatrix, rig.camera.matrixWorldInverse);
  camFrustum.setFromProjectionMatrix(camMat);
  for (const n of shownNeighbors) {
    if (n === screen) continue;
    const p = n.group.position;
    // The playable part (plus a tree's height) is what matters
    nbBox.min.set(p.x - SCREEN_W / 2 - 1, -1, p.z - SCREEN_H / 2 - 1);
    nbBox.max.set(p.x + SCREEN_W / 2 + 1, 4.5, p.z + SCREEN_H / 2 + 1);
    const vis = camFrustum.intersectsBox(nbBox);
    n.group.visible = vis;
    const r = rocksByScreen.get(n);
    if (r) r.group.visible = vis;
  }
}

function placeNeighbor(id: string, x: number, z: number) {
  const s = screenFor(id);
  s.group.position.set(x, 0, z);
  s.group.visible = true;
  // A screen below this one hides its tall top-row trees and houses so they don't cover the bottom of this one
  s.setNorthTall?.(z <= 0);
  setShadows(s, false);
  s.chest?.setOpen(adv.opened.has(id) ? 1 : 0);
  s.setWaterTint(timeSetting === 'night' ? new THREE.Color(0.32, 0.42, 0.75) : new THREE.Color(1, 1, 1));
  const r = rocksFor(s);
  if (r) {
    r.group.visible = true;
    r.group.position.set(x, 0, z);
  }
  if (!shownNeighbors.includes(s)) shownNeighbors.push(s);
}

/** Ripples on rivers line up across screens: tell the water where this screen sits in the big map. */
function setWaterFrame() {
  if (mode !== 'adventure') return waterFrame.value.set(0, 0);
  const a = area(adv.area);
  waterFrame.value.set(a.grid.x * SCREEN_W, a.grid.y * SCREEN_H);
}

/** Where Herman stands (and faces) when he arrives in an area from a side. */
function arrivalFor(id: string, s: BuiltScreen, arriveSide: Side | null) {
  const a = area(id);
  const pos = s.spawn.clone();
  let face = Math.PI;
  if (arriveSide) {
    const inward = { north: [0, 1], south: [0, -1], west: [1, 0], east: [-1, 0] }[arriveSide];
    face = Math.atan2(inward[0], inward[1]);
    if (a.kind === 'room') {
      const d = s.doors?.find((dd) => dd.side === arriveSide);
      if (d) pos.copy(d.entry);
    } else {
      const ex = s.exits.find((e) => e.side === arriveSide);
      if (ex) pos.set((ex.minX + ex.maxX) / 2 + inward[0] * 1.9, 0, (ex.minZ + ex.maxZ) / 2 + inward[1] * 1.9);
    }
  }
  s.collision.resolve(pos, herman.radius);
  return { pos, face };
}

/** Before sliding into a keep room, set its doors the way they'll be, so the doorway is open. */
function prepareRoomDoors(id: string, s: BuiltScreen) {
  const a = area(id);
  for (const d of s.doors ?? []) {
    const link = a.links[d.side];
    if (!link) {
      d.setClosed(true, true);
      continue;
    }
    const locked = !!link.lock && !adv.unlocked.has(link.conn);
    const kind = locked ? link.lock! : 'open';
    if (d.kind !== kind) d.setKind(kind);
    d.setClosed(locked, true);
  }
}

/** Arena mode: swap between Greenmeadow and the Dungeon. Starts the run over (wave 1). */
function switchMap(kind: 'meadow' | 'dungeon', announce: boolean) {
  const next = kind === 'dungeon' ? dungeon : meadow;
  if (next === screen) return;
  setScreen(next);
  herman.position.copy(screen.spawn);
  if (announce) {
    if (mode === 'sandbox') sandboxRestart();
    else restart();
    setPaused(false);
    hud.big(screen.name, screen.kind === 'meadow' ? 'Fresh air and rocks to throw' : 'No way out. Sword, boomerang and bow only.', 2400);
  }
}
// eslint-disable-next-line prefer-const
let pauseMenu: PauseMenu | undefined;
pauseMenu = new PauseMenu((s) => {
  herman.setClothes(s.tabard, s.pants);
  setOutlines(s.outlines);
  renderer.setBloom(s.glow);
  if (rig.tiltDeg !== s.tilt) rig.setTilt(s.tilt);
  timeSetting = s.time;
  arenaMap = s.map;
  sfx.setEnabled(s.sound);
  if (started && s.mode !== mode) {
    startMode(s.mode);
    setPaused(false);
  } else if (mode !== 'adventure' && s.map !== screen.kind) switchMap(s.map, mapReady);
  applyMapLighting();
  screen.setWaterTint(s.time === 'night' ? new THREE.Color(0.32, 0.42, 0.75) : new THREE.Color(1, 1, 1));
});
mapReady = true;
pauseMenu.setMode(mode);
pauseMenu.setOwned(ownedListHtml(owned));
const deathScreen = new DeathScreen();
const titleScreen = new TitleScreen(mode);
const victory = new VictoryScreen();
let deathTimer = 0;

function setPaused(p: boolean) {
  if (deathScreen.open || chooser.open || titleScreen.open || victory.open || sandboxPanel.open || shop.open) return;
  paused = p;
  pauseMenu?.show(p);
  if (p) pauseMenu?.setSaveNote(`${save.gold} gold · ${save.runs} run${save.runs === 1 ? '' : 's'} · Grumbok beaten ${save.grumbokBeaten} time${save.grumbokBeaten === 1 ? '' : 's'}. Gold, shop upgrades and gear are saved in this browser.`);
  input.release();
}
pauseMenu.onResume = () => setPaused(false);
pauseMenu.onErase = () => {
  eraseSave();
  applyPowers();
  pauseMenu?.setSaveNote('Saved progress erased. Fresh start: 0 gold, no upgrades, no gear.');
  hud.showToast('Progress erased', 'Gold, upgrades and gear are back to zero.');
};
pauseMenu.onRestart = () => {
  setPaused(false);
  if (mode === 'adventure') newAdventure();
  else if (mode === 'sandbox') sandboxRestart();
  else restart();
};
pauseMenu.onJump = (w) => {
  setPaused(false);
  if (mode === 'sandbox') sandboxStartWaves(w);
  else restart(w);
};
deathScreen.onRetry = () => {
  deathScreen.show(false);
  if (mode === 'adventure') newAdventure();
  else if (mode === 'sandbox') {
    sandboxRestart();
    openSandbox(true);
  } else restart();
};
titleScreen.onPick = (m) => {
  sfx.unlock();
  pauseMenu?.set('mode', m);
  started = true;
  startMode(m);
};
victory.onContinue = () => {
  victory.show(false);
  input.release();
};
victory.onNew = () => {
  victory.show(false);
  newAdventure();
};

/** Start Adventure, Arena or Sandbox from scratch. */
function startMode(m: Mode) {
  mode = m;
  pauseMenu?.setMode(m);
  victory.show(false);
  hud.setSandboxButton(m === 'sandbox');
  if (m === 'sandbox') {
    setScreen(arenaMap === 'dungeon' ? dungeon : meadow);
    resetRun();
    sandbox.wavesOn = false;
    director.reset(1);
    herman.position.copy(screen.spawn);
    wavesCleared = 0;
    openSandbox(true);
  } else if (m === 'arena') {
    setScreen(arenaMap === 'dungeon' ? dungeon : meadow);
    restart();
    hud.big('Arena', screen.kind === 'meadow' ? 'Survive the waves in Greenmeadow' : 'Survive the waves in the Dungeon', 2200);
  } else newAdventure();
}

/** Everything a fresh run needs, in either mode. */
function resetRun() {
  clearField();
  hasKey = false;
  timers.length = 0;
  weapons.reset();
  for (const r of rocksByScreen.values()) r.reset();
  carried = null;
  aiming = false;
  herman.carrying = false;
  herman.aimingThrow = false;
  herman.setWeapon(weapons.current);
  herman.revive();
  owned = [];
  phoenixUsed = false;
  heartContainers = 0;
  applyPowers();
  chestOpenT = -2;
  rewardDone = false;
  deathTimer = 0;
  transition = null;
  rig.override = null;
  lighting.setFocus(0, 0);
  hud.setFade(0);
}

/** Arena: back to wave 1 (or a practice wave). */
function restart(startWave = 1) {
  resetRun();
  herman.position.copy(screen.spawn);
  director.reset(startWave);
  wavesCleared = startWave - 1;
}

/* ---------- Sandbox mode: you pick the monsters, the wave and the power-ups ---------- */
const sandbox = { wavesOn: false, invincible: false };
const sandboxPanel = new SandboxPanel(() => ({
  wavesOn: sandbox.wavesOn, wave: Math.max(1, director.wave), invincible: sandbox.invincible, owned, map: screen.kind === 'dungeon' ? 'dungeon' : 'meadow',
}));

/** Waves only run in Arena, or in Sandbox after you press "Start at wave". */
function wavesRunning() {
  return mode === 'arena' || (mode === 'sandbox' && sandbox.wavesOn);
}

function openSandbox(open: boolean) {
  if (open && (deathScreen.open || chooser.open || titleScreen.open)) return;
  if (open && paused) {
    paused = false;
    pauseMenu?.show(false);
  }
  sandboxPanel.show(open);
  input.release();
}

/** Start over in the sandbox, but keep the power-ups you picked. */
function sandboxRestart() {
  const keep = owned.slice();
  resetRun();
  owned = keep;
  applyPowers();
  herman.halves = herman.maxHalves;
  sandbox.wavesOn = false;
  director.reset(1);
  wavesCleared = 0;
  herman.position.copy(screen.spawn);
}

function sandboxStartWaves(w: number) {
  clearField();
  hasKey = false;
  chestOpenT = -2;
  rewardDone = false;
  sandbox.wavesOn = true;
  director.reset(w);
  wavesCleared = w - 1;
  introDone = true;
  hud.dismissIntro();
}

sandboxPanel.onClose = () => openSandbox(false);
sandboxPanel.onSpawn = (counts) => {
  let n = 0;
  for (const [kind, count] of Object.entries(counts)) {
    for (let i = 0; i < (count ?? 0); i++) {
      const k = kind as EnemyKind;
      const boss = k === 'kingSlime' || k === 'skelKing' || k === 'ogreKing';
      const p = boss ? bossPoint() : spawnPoint(4);
      createEnemy(k, p.x, p.z);
      n++;
    }
  }
  if (n) {
    sfx.waveStart();
    hud.big(`${n} monster${n === 1 ? '' : 's'}!`, '', 1400);
    introDone = true;
    hud.dismissIntro();
  }
};
sandboxPanel.onClearMonsters = () => {
  for (const e of enemies) {
    e.dispose(ctx);
    scene.remove(e.root);
  }
  enemies.length = 0;
  bullets.clear();
  telegraphs.cancelAll();
};
sandboxPanel.onStartWaves = (w) => sandboxStartWaves(w);
sandboxPanel.onStopWaves = () => {
  sandbox.wavesOn = false;
  director.reset(1);
  sandboxPanel.onClearMonsters?.();
};
sandboxPanel.onAddPower = (id, rarity) => {
  const def = POWERS.find((p) => p.id === id);
  if (!def) return;
  if (def.once && owned.some((o) => o.def.id === id)) {
    hud.showToast(`Herman already has ${def.name}`, 'This one only works once.');
    return;
  }
  owned.push({ def, rarity });
  const heal = def.heal?.(rarity);
  applyPowers();
  if (heal === 'full') herman.halves = herman.maxHalves;
  else if (heal) herman.heal(heal);
  sfx.pick();
};
sandboxPanel.onRemovePower = (i) => {
  const removed = owned.splice(i, 1)[0];
  if (removed?.def.id === 'phoenix') phoenixUsed = false;
  applyPowers();
};
sandboxPanel.onClearPowers = () => {
  owned = [];
  phoenixUsed = false;
  applyPowers();
};
sandboxPanel.onInvincible = (on) => {
  sandbox.invincible = on;
  if (on) herman.halves = herman.maxHalves;
};
sandboxPanel.onHeal = () => {
  herman.halves = herman.maxHalves;
  sfx.heart();
};
sandboxPanel.onMap = (m) => {
  if ((m === 'dungeon') === (screen.kind === 'dungeon')) return;
  arenaMap = m;
  pauseMenu?.set('map', m);
};
hud.onSandbox = () => openSandbox(!sandboxPanel.open);

/* ---------- Adventure mode: Greenmeadow + Ogre Keep ---------- */
const adv = freshAdventure();
function freshAdventure() {
  return {
    area: 'v1',
    visited: new Set<string>(),
    cleared: new Set<string>(),
    opened: new Set<string>(),
    unlocked: new Set<string>(),
    keys: 0,
    bigKey: false,
    bossDown: false,
    won: false,
    fighting: false,
    screenClear: true,
    fountainReady: true,
    time: 0,
  };
}
const areaScreens = new Map<string, BuiltScreen>();
let entryToken = 0;
let lockToast: unknown = null;
let blockedToast: string | null = null;

const AREA_HINTS: Record<string, string> = {
  v1: 'Home. Spend your gold with Bob, Jerry and the Training Yard',
  g1: 'Ogre Keep is north, then east',
  g4: 'Ogre Keep lies to the north',
  r1: 'Doors slam shut until every monster is beaten',
  r2: 'A chest with a small key is in here',
  r3: 'A crystal across the lava... and a locked door to the east',
  r4: 'The Big Key is in this chest!',
  r6: 'A healing fountain!',
  v2: 'You jumped the hedge. Sneaky!',
};

function screenFor(id: string): BuiltScreen {
  let s = areaScreens.get(id);
  if (!s) {
    const a = area(id);
    const neighbor = (dx: number, dy: number) => {
      if (a.secret) return null;
      const n = AREAS.find((o) => o.region === a.region && o.kind === 'meadow' && !o.secret && o.grid.x === a.grid.x + dx && o.grid.y === a.grid.y + dy);
      return n?.meadow?.tiles ?? null;
    };
    s = a.kind === 'meadow'
      ? buildScreen(a.meadow!, { neighbor, origin: { x: a.grid.x * SCREEN_W, z: a.grid.y * SCREEN_H } })
      : buildDungeon(a.room!);
    s.group.visible = false;
    scene.add(s.group);
    areaScreens.set(id, s);
  }
  return s;
}

function newAdventure() {
  // Throw away the keep rooms so doors, bridges and chests start fresh. Meadows just close their chests.
  hideNeighbors();
  for (const [id, s] of [...areaScreens]) {
    if (s.kind === 'meadow') {
      s.chest?.setOpen(0);
      continue;
    }
    if (s === screen) s.group.visible = false;
    scene.remove(s.group);
    areaScreens.delete(id);
  }
  Object.assign(adv, freshAdventure());
  resetRun();
  save.runs++;
  persist();
  // Charms from Jerry: start the run with a power-up
  const charm = gearEffects().startPower;
  if (charm === 'flame') owned.push({ def: POWERS.find((p) => p.id === 'fire')!, rarity: 'common' });
  else if (charm === 'randomRare') {
    const pool = POWERS.filter((p) => p.rarities.includes('rare'));
    owned.push({ def: pool[Math.floor(Math.random() * pool.length)], rarity: 'rare' });
  }
  applyPowers();
  herman.halves = herman.maxHalves;
  enterArea('v1', null);
  if (charm !== 'none') {
    const o = owned[owned.length - 1];
    hud.showToast(`Charm: ${o.def.name}!`, `${rarityInfo(o.rarity).name}: ${o.def.describe(o.rarity)}`, 3400);
  }
  hud.big('Oakhollow Village', save.runs <= 1 ? 'Home. Monsters drop gold: spend it here, then head north!' : 'Spend your gold, then head north to Ogre Keep', 2800);
}

/** Walk into an area. arriveSide is the edge Herman comes in from (null = the area's start spot). */
function enterArea(id: string, arriveSide: Side | null) {
  const a = area(id);
  setScreen(screenFor(id));
  const firstVisit = !adv.visited.has(id);
  adv.area = id;
  adv.visited.add(id);
  adv.fighting = false;
  adv.screenClear = true;
  adv.fountainReady = true;
  crystalOn = !!screen.crystalPos && !!screen.river;
  const token = ++entryToken;
  lockToast = null;

  layoutNeighbors();
  setWaterFrame();

  // Where Herman appears
  const { pos, face } = arrivalFor(id, screen, arriveSide);
  herman.position.copy(pos);
  herman.face(face);

  // Doors: locked ones stay locked until a key opens them, for the whole run
  for (const d of screen.doors ?? []) {
    const link = a.links[d.side];
    if (!link) {
      d.setClosed(true, true);
      continue;
    }
    const locked = !!link.lock && !adv.unlocked.has(link.conn);
    const kind = locked ? link.lock! : 'open';
    if (d.kind !== kind) d.setKind(kind);
    d.setClosed(locked, true);
  }

  // Monsters: outdoor screens refill every visit, keep rooms stay cleared
  const roomDone = a.kind === 'room' && (adv.cleared.has(id) || (a.boss && adv.bossDown));
  if (!roomDone && a.enemies.length) {
    if (a.boss) {
      createEnemy('ogreKing', 0, -3);
      sfx.bossIntro();
      hud.big('Grumbok the Ogre King', 'Run when the red circle spreads! His hits take 1½ hearts.', 3000);
    } else {
      const ok = id === 'r3' && !adv.cleared.has('r3') ? (_x: number, z: number) => z > -0.5 : undefined;
      for (const k of a.enemies) {
        const p = spawnPoint(4.5, ok);
        createEnemy(k, p.x, p.z);
      }
    }
    adv.fighting = true;
    adv.screenClear = false;
    if (a.kind === 'room') {
      // The doors slam behind Herman
      setTimeoutGame(0.45, () => {
        if (token !== entryToken) return;
        for (const d of screen.doors ?? []) if (!d.closed) d.setClosed(true);
      });
    }
  } else if (a.kind === 'room') adv.cleared.add(id);

  if (a.village && herman.alive && herman.halves < herman.maxHalves) {
    herman.halves = herman.maxHalves;
    sfx.fountain();
    hud.showToast('Home sweet home', 'Resting in Oakhollow restores all your hearts.');
  }
  lidK = adv.opened.has(id) ? 1 : 0;
  chestOpenT = -1;
  if (a.boss && adv.bossDown) screen.showChest?.();
  if (firstVisit && !a.boss) hud.big(a.title, AREA_HINTS[id] ?? (a.kind === 'room' ? 'Ogre Keep' : ''), 1800);
}

function startTransition(to: string, side: Side) {
  if (transition) return;
  dropRock();
  const a = area(adv.area);
  const b = area(to);
  const dx = b.grid.x - a.grid.x, dy = b.grid.y - a.grid.y;
  const nextDoor = a.region === b.region && a.kind === b.kind && Math.abs(dx) + Math.abs(dy) === 1 && !a.secret && !b.secret;
  if (!nextDoor) {
    // Through the keep gate: a quick fade, like walking into a building
    transition = { kind: 'fade', t: 0, to, side, swapped: false };
    return;
  }
  // Next door: slide the camera over while Herman walks across the border
  const dest = screenFor(to);
  const off = new THREE.Vector3(dx * SCREEN_W, 0, dy * SCREEN_H);
  if (b.kind === 'room') {
    prepareRoomDoors(to, dest);
    dest.group.position.copy(off);
    dest.group.visible = true;
  } else {
    placeNeighbor(to, off.x, off.z);
    setShadows(dest, true);
    dest.setNorthTall?.(true);
  }
  bullets.clear();
  telegraphs.cancelAll();
  const arrive = arrivalFor(to, dest, side);
  transition = {
    kind: 'scroll', t: 0, to, side, swapped: false,
    dur: dx ? 0.8 : 0.6,
    off,
    hFrom: herman.position.clone(),
    hTo: arrive.pos.clone().add(off),
    camFrom: rig.current.clone(),
    camTo: rig.desiredFor(arrive.pos).add(off),
    face: Math.atan2(dx, dy),
  };
  weapons.collectAll();
  input.release();
}

/** Room cleared: doors swing open, arrows fly home. */
function onAreaCleared() {
  const a = area(adv.area);
  adv.fighting = false;
  adv.screenClear = true;
  weapons.recallArrows();
  if (a.kind !== 'room') {
    if (a.chest && !adv.opened.has(a.id)) hud.showToast('All clear!', 'The chest here can be opened now.');
    return;
  }
  adv.cleared.add(a.id);
  for (const d of screen.doors ?? []) {
    const link = a.links[d.side];
    if (link && (!link.lock || adv.unlocked.has(link.conn))) d.setClosed(false);
  }
  if (!a.boss) {
    sfx.puzzle();
    hud.showToast('Room cleared!', a.chest && !adv.opened.has(a.id) ? 'Open the chest.' : 'The doors are open.');
  }
}

function bossDefeated(x: number, z: number) {
  adv.bossDown = true;
  save.grumbokBeaten++;
  persist();
  sfx.bigBoom();
  setTimeoutGame(0.6, () => sfx.victory());
  hud.big('Grumbok is defeated!', 'Grab the Heart Container, then open the golden chest', 3200);
  container = new HeartPickup(x, z + 0.6);
  container.life = 1e9;
  container.mesh.scale.setScalar(2.6);
  scene.add(container.mesh);
  screen.showChest?.();
  fx.burst(screen.chestPos.x, 0.6, screen.chestPos.z, new THREE.Color(3, 2.4, 0.9), 30, 4);
}

const FAR = new THREE.Vector3(999, 0, 999);
const doorPromptPos = new THREE.Vector3();
function advChestAvailable() {
  const a = area(adv.area);
  return !!a.chest && !adv.opened.has(a.id) && !!screen.chest && screen.chest.group.visible !== false;
}

function openAdvChest() {
  const a = area(adv.area);
  if (!a.chest || adv.opened.has(a.id) || chooser.open) return;
  if (!adv.screenClear) {
    hud.showToast('Not yet!', 'Beat the monsters here first.');
    return;
  }
  adv.opened.add(a.id);
  chestOpenT = 0;
  const c = screen.chestPos;
  fx.burst(c.x, 0.6, c.z, new THREE.Color(3, 2.4, 0.9), 30, 4);
  rig.shake(0.1);
  const chestGold = { wooden: 8, silver: 20, gold: 60, smallkey: 5, bigkey: 10, cheater: 50 }[a.chest];
  setTimeoutGame(0.35, () => spawnCoins(c.x, c.z + 0.6, chestGold, 1.6));
  if (a.chest === 'cheater') {
    sfx.chest(3);
    hud.big('Ah, you cheater!', '50 coins for finding the secret clearing', 3200);
  } else if (a.chest === 'smallkey') {
    adv.keys++;
    sfx.key();
    hud.showToast('Small Key!', 'It opens one locked door in Ogre Keep.', 3200);
  } else if (a.chest === 'bigkey') {
    adv.bigKey = true;
    sfx.key();
    setTimeoutGame(0.25, () => sfx.chest(4));
    hud.big('The Big Key!', "It opens the door to Grumbok's throne", 2800);
  } else {
    const kind = a.chest;
    const title = kind === 'gold' ? 'Golden chest! Choose a reward' : kind === 'silver' ? 'Silver chest! Choose a power-up' : 'Choose a power-up';
    offerPowers(luckyWeights(CHEST_ODDS[kind]), title, () => {
      if (kind === 'gold' && !adv.won) {
        adv.won = true;
        setTimeoutGame(2.2, () => {
          const mins = Math.floor(adv.time / 60);
          const secs = String(Math.floor(adv.time % 60)).padStart(2, '0');
          victory.show(true, `Herman beat Grumbok in ${mins}:${secs} with ${owned.length} power-up${owned.length === 1 ? '' : 's'} and ${herman.maxHalves / 2} hearts. You have ${save.gold} gold to spend in Oakhollow. The Gloomwood opens in the next phase.`);
          input.release();
        });
      }
    });
  }
}

function minimapHtml(): string {
  const a = area(adv.area);
  const list = AREAS.filter((x) => x.region === a.region && (!x.secret || adv.visited.has(x.id)));
  const xs = list.map((x) => x.grid.x);
  const ys = list.map((x) => x.grid.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  let cells = '';
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const c = list.find((l) => l.grid.x === x && l.grid.y === y);
      if (!c) {
        cells += '<i class="mm empty"></i>';
        continue;
      }
      const chestLeft = !!c.chest && !adv.opened.has(c.id) && !(c.boss && !adv.bossDown);
      const cls = ['mm', adv.visited.has(c.id) ? 'seen' : '', c.id === a.id ? 'here' : '', c.boss ? 'boss' : '', chestLeft ? 'chest' : '', c.village ? 'town' : ''].join(' ');
      cells += `<i class="${cls}" title="${c.title}"></i>`;
    }
  }
  return `<div class="mm-title">${a.region}</div><div class="mm-grid" style="--cols:${maxX - minX + 1}">${cells}</div><div class="mm-legend"><i></i>chest</div>`;
}

type DoorT = NonNullable<BuiltScreen['doors']>[number];
const DOOR_IN: Record<Side, [number, number]> = { north: [0, 1], south: [0, -1], west: [1, 0], east: [-1, 0] };

/** A closed, locked door Herman is standing in front of (anywhere along its width). */
function lockedDoorNear(): DoorT | null {
  if (mode !== 'adventure' || !herman.alive) return null;
  const a = area(adv.area);
  const hp = herman.position;
  for (const d of screen.doors ?? []) {
    if (!d.closed || d.kind === 'open' || !a.links[d.side]) continue;
    const z = d.zone;
    const [ix, iz] = DOOR_IN[d.side];
    // The door's zone, stretched 1.6 tiles into the room and a little past each side
    const minX = z.minX - 0.4, maxX = z.maxX + 0.4;
    const minZ = z.minZ - 0.4, maxZ = z.maxZ + 0.4;
    const ex = ix > 0 ? 1.6 : 0, wx = ix < 0 ? 1.6 : 0, sz = iz > 0 ? 1.6 : 0, nz = iz < 0 ? 1.6 : 0;
    if (hp.x >= minX - wx && hp.x <= maxX + ex && hp.z >= minZ - nz && hp.z <= maxZ + sz) return d;
  }
  return null;
}

function doorHasKey(d: DoorT) {
  return !adv.fighting && (d.kind === 'key' ? adv.keys > 0 : adv.bigKey);
}

/** The "Open door" button: use the key, open the door and walk Herman through to the next room. */
function openLockedDoor(d: DoorT) {
  const a = area(adv.area);
  const link = a.links[d.side];
  if (!link || !d.closed) return;
  if (!doorHasKey(d)) {
    if (adv.fighting) hud.showToast('Not now!', 'Beat the monsters first.');
    else if (d.kind === 'key') hud.showToast('You need a small key', 'It is in the Guard Room chest, east of the Entrance Hall.', 3600);
    else hud.showToast('You need the Big Key', 'It is in the Ogre Den: through the locked east door in Lava Crossing.', 3800);
    return;
  }
  if (d.kind === 'key') adv.keys--;
  adv.unlocked.add(link.conn);
  d.setKind('open');
  sfx.keyUnlock();
  d.setClosed(false);
  hud.showToast('Unlocked!', link.to === 'boss' ? 'Grumbok waits beyond...' : '');
  const token = entryToken;
  setTimeoutGame(0.6, () => {
    if (token === entryToken) startTransition(link.to, OPPOSITE[d.side]);
  });
}

/** Adventure-only work each step: doors, keys, fountain, crystal, exits, room clears. */
function tickAdventure(dt: number) {
  adv.time += dt;
  const a = area(adv.area);
  const hp = herman.position;
  ctx.river = screen.river;

  if (adv.fighting && enemies.length === 0) onAreaCleared();

  // Heart Container from the boss
  if (container) {
    container.update(dt);
    if (herman.alive && Math.hypot(container.mesh.position.x - hp.x, container.mesh.position.z - hp.z) < 0.95) {
      scene.remove(container.mesh);
      container = null;
      heartContainers++;
      applyPowers();
      herman.halves = herman.maxHalves;
      sfx.heart();
      setTimeoutGame(0.15, () => sfx.key());
      hud.big('Heart Container!', 'Herman now has one more heart', 2400);
      fx.burst(hp.x, 1, hp.z, new THREE.Color(3, 0.8, 0.9), 30, 4);
    }
  }

  // Healing fountain: once per visit
  if (screen.fountainPos && adv.fountainReady && herman.alive && herman.halves < herman.maxHalves
    && Math.hypot(screen.fountainPos.x - hp.x, screen.fountainPos.z - hp.z) < 1.6) {
    adv.fountainReady = false;
    herman.halves = herman.maxHalves;
    sfx.fountain();
    fx.burst(screen.fountainPos.x, 1, screen.fountainPos.z, new THREE.Color(0.9, 1.8, 3), 30, 4);
    hud.showToast('The fountain heals you!', 'All hearts restored.');
  }

  // Locked doors: walking up shows an "Open door" button (E or tap). Without the key, a hint says where it is.
  const ld = lockedDoorNear();
  if (ld && lockToast !== ld && !doorHasKey(ld)) {
    if (adv.fighting) hud.showToast('Not now!', 'Beat the monsters first.');
    else if (ld.kind === 'key') hud.showToast('Locked door', 'You need a small key. It is in the Guard Room chest, east of the Entrance Hall.', 3600);
    else hud.showToast('The Big Key door', 'The Big Key is in the Ogre Den: through the locked east door in Lava Crossing.', 3800);
  }
  lockToast = ld;

  // Leaving the screen
  if (!herman.alive) return;
  let side: Side | null = null;
  if (screen.kind === 'meadow') {
    for (const e of screen.exits) if (hp.x >= e.minX && hp.x <= e.maxX && hp.z >= e.minZ && hp.z <= e.maxZ) side = e.side;
  } else {
    for (const d of screen.doors ?? []) {
      const z = d.zone;
      if (!d.closed && hp.x >= z.minX && hp.x <= z.maxX && hp.z >= z.minZ && hp.z <= z.maxZ) side = d.side;
    }
  }
  if (side) {
    const link = a.links[side];
    if (link) {
      startTransition(link.to, OPPOSITE[side]);
      blockedToast = null;
    } else if (a.blocked?.[side] && blockedToast !== side) {
      blockedToast = side;
      hud.showToast('The road is closed', a.blocked[side]!);
    }
  } else blockedToast = null;
}

/* ---------- Controls ---------- */
function dropRock() {
  if (!carried || !rocks) return;
  rocks.drop(carried, herman.position.x + Math.sin(herman.facingAngle) * 0.7, herman.position.z + Math.cos(herman.facingAngle) * 0.7);
  carried = null;
  aiming = false;
  herman.carrying = false;
  herman.aimingThrow = false;
}
const selectWeapon = (w: WeaponId) => {
  if (w === 'hands' && screen.kind !== 'meadow') {
    hud.showToast('No rocks down here', 'In the dungeon you fight with sword, boomerang and bow.');
    return;
  }
  if (w !== 'hands') dropRock();
  weapons.select(w);
};
const cycleWeapon = () => {
  const order = screen.kind === 'meadow' ? WEAPON_ORDER : WEAPON_ORDER.filter((w) => w !== 'hands');
  const i = order.indexOf(weapons.current);
  selectWeapon(order[(i + 1) % order.length]);
};
const dash = () => {
  if (paused || !herman.alive || chooser.open) return;
  const m = aiming ? { x: 0, y: 0 } : input.move();
  if (herman.tryDash(m.x, m.y)) {
    sfx.dash();
    fx.puffRing(herman.position.x, herman.position.z);
    // Dashing cancels aiming (you keep the rock)
    aiming = false;
    herman.aimingThrow = false;
  }
};

/** Shift / JUMP: hop over rocks, bushes, signs, chests and monsters. */
const jump = () => {
  if (paused || !herman.alive || chooser.open || transition) return;
  if (herman.tryJump()) {
    sfx.jump();
    fx.puffRing(herman.position.x, herman.position.z, 0xe8d6ae, 6);
  }
};
herman.onLand = () => {
  const p = herman.position;
  if (screen.kind === 'meadow' && screen.collision.waterAt(p.x, p.z)) {
    sfx.splash();
    fx.burst(p.x, 0.1, p.z, new THREE.Color(0.75, 0.92, 1.3), 18, 3);
    fx.puffRing(p.x, p.z, 0xd8f2ff, 10);
  } else {
    sfx.thud();
    fx.puffRing(p.x, p.z, 0xe8d6ae, 10);
  }
};

/** E / tap: lift a rock, start aiming, or throw. Returns true if it did something. */
function rockAction(): boolean {
  if (paused || !herman.alive || chooser.open || herman.jumping) return false;
  if (aiming && carried && rocks) {
    const ang = Math.atan2(aimPos.x - herman.position.x, aimPos.z - herman.position.z);
    herman.face(ang);
    rocks.throw(carried, herman.position, aimPos);
    herman.throwAt(ang);
    carried = null;
    aiming = false;
    herman.carrying = false;
    herman.aimingThrow = false;
    return true;
  }
  if (carried) {
    aiming = true;
    herman.aimingThrow = true;
    const f = herman.facingAngle;
    aimPos.set(herman.position.x + Math.sin(f) * 4, 0, herman.position.z + Math.cos(f) * 4);
    clampAim();
    return true;
  }
  if (weapons.current === 'hands' && screen.kind === 'meadow' && rocks) {
    const r = rocks.nearest(herman.position.x, herman.position.z, 1.2);
    if (r) {
      rocks.pickUp(r, herman.carryHolder);
      sfx.rockLift();
      carried = r;
      herman.carrying = true;
      fx.puffRing(herman.position.x, herman.position.z, 0xe8d6ae, 6);
      return true;
    }
  }
  return false;
}

function clampAim() {
  const b = screen.collision.bounds;
  aimPos.x = THREE.MathUtils.clamp(aimPos.x, b.minX + 0.3, b.maxX - 0.3);
  aimPos.z = THREE.MathUtils.clamp(aimPos.z, b.minZ + 0.3, b.maxZ - 0.3);
}

function onRockLand(x: number, z: number, water: boolean) {
  if (water) {
    fx.goo(x, z, 0x8fd6ff, 16, 0.9);
    rig.shake(0.08);
    sfx.splash();
  } else {
    sfx.rockLand();
    rig.shake(0.35);
    fx.puffRing(x, z, 0xe8d6ae, 16);
    fx.sparks(x, 0.3, z, 10);
  }
  // Everything inside the circle gets smashed
  for (const e of enemies) {
    if (!e.targetable()) continue;
    const dx = e.root.position.x - x;
    const dz = e.root.position.z - z;
    const d = Math.hypot(dx, dz);
    if (d > ROCK_BLAST_RADIUS + e.radius * 0.6) continue;
    const dmg = e.isBoss ? 8 : e.kind === 'ogre' ? e.maxHp / 2 : e.hp + 1;
    const dealt = e.hit(dmg, dx / (d || 1), dz / (d || 1), e.isBoss ? 2 : 7);
    const sp = toScreen(e.root.position.x, 1 + (e.isBoss ? 1.5 : 0), e.root.position.z);
    hud.number(String(Math.max(1, Math.round(dealt))), sp.x, sp.y, e.state === 'dead' ? 'kill' : 'hit');
  }
}
hud.onSelectWeapon = selectWeapon;
hud.onCycleWeapon = cycleWeapon;
hud.onAction = () => void rockAction();
hud.onDash = dash;
hud.onJump = jump;
hud.onPause = () => setPaused(!paused);

type Interactable = { pos: () => THREE.Vector3; label: () => string; act: () => void };
const interactables: Interactable[] = [
  {
    pos: () => screen.signPos,
    label: () => 'Read sign',
    act: () => mode !== 'adventure'
      ? hud.showToast(screen.signText, 'Beat a boss every 10 waves to win a key for the chest.')
      : area(adv.area).village
        ? hud.showToast('Oakhollow Village', "Bob's Smithy (left), Jerry's Armory (right), Training Yard (by the dummy). Ogre Keep: north, then east.", 4200)
        : hud.showToast('Ogre Keep: north, then east', 'Grumbok the Ogre King has taken the keep. Find the keys inside!', 3600),
  },
  {
    pos: () => (mode !== 'adventure' ? screen.chestPos : advChestAvailable() ? screen.chestPos : FAR),
    label: () => (mode === 'adventure' ? 'Open chest' : hasKey ? 'Open chest' : 'Locked chest'),
    act: () => {
      if (mode === 'adventure') openAdvChest();
      else if (hasKey) openChest();
      else hud.showToast('Locked tight!', 'Beat the boss on wave 10, 20 or 30 to get the key.');
    },
  },
];
/* ---------- Oakhollow shops ---------- */
const shop = new ShopPanel();
shop.onClose = () => {
  shop.show(false);
  input.release();
};
shop.onChange = () => {
  const before = herman.maxHalves;
  applyPowers();
  if (herman.maxHalves > before) herman.halves = herman.maxHalves;
};
function openShop(kind: ShopKind) {
  if (!herman.alive || chooser.open) return;
  input.release();
  shop.show(true, kind);
}
const npcPos = (id: 'bob' | 'jerry') => () => {
  if (mode !== 'adventure') return FAR;
  const n = screen.npcs?.find((x) => x.id === id);
  return n ? n.group.position : FAR;
};
interactables.push(
  { pos: npcPos('bob'), label: () => 'Talk to Bob (Smithy)', act: () => openShop('smith') },
  { pos: npcPos('jerry'), label: () => 'Talk to Jerry (Armory)', act: () => openShop('armor') },
  { pos: () => (mode === 'adventure' && screen.boardPos ? screen.boardPos : FAR), label: () => 'Training Yard', act: () => openShop('yard') },
);

/** Ben and Cole's secret button: back-left corner of Oakhollow. 10 gold the first time. */
let secretCd = 0;
function pressSecret() {
  if (secretCd > 0 || !screen.secretPos) return;
  secretCd = 1.2;
  screen.secret?.press();
  sfx.puzzle();
  const p = screen.secretPos;
  fx.burst(p.x, 0.6, p.z, new THREE.Color(3, 2.4, 0.9), 26, 3);
  if (!save.secretFound) {
    save.secretFound = true;
    persist();
    spawnCoins(p.x, p.z + 0.5, 10, 1.2);
    hud.big('Made by Ben and Cole!', 'You found the secret button. +10 gold', 3200);
  } else hud.showToast('Made by Ben and Cole', "Thanks for playing Herman's Quest!");
}
interactables.push({
  pos: () => (mode === 'adventure' && screen.secretPos ? screen.secretPos : FAR),
  label: () => 'Press the button',
  act: pressSecret,
});

/** The straw dummy in the Training Yard: hit it to see your damage. */
const dummyTarget: Enemy = {
  root: new THREE.Group(), radius: 0.4, kind: 'mini', isBoss: false, displayName: '', hp: 9999, maxHp: 9999, contactDamage: 0,
  state: 'alive',
  targetable: () => true,
  harmful: () => false,
  hit: (dmg, dx, dz) => {
    screen.dummy?.hit(dx, dz);
    sfx.thud();
    return dmg;
  },
  applyStatus: () => {},
  update: () => {},
  dispose: () => {},
};

interactables.push({
  pos: () => {
    const d = lockedDoorNear();
    if (!d) return FAR;
    // Put the button in front of the door, right where Herman stands
    const [ix, iz] = DOOR_IN[d.side];
    doorPromptPos.set(
      ix ? d.entry.x - ix * 0.9 : THREE.MathUtils.clamp(herman.position.x, d.zone.minX, d.zone.maxX),
      0,
      iz ? d.entry.z - iz * 0.9 : THREE.MathUtils.clamp(herman.position.z, d.zone.minZ, d.zone.maxZ),
    );
    return doorPromptPos;
  },
  label: () => {
    const d = lockedDoorNear();
    return d && doorHasKey(d) ? 'Open door' : 'Locked door';
  },
  act: () => {
    const d = lockedDoorNear();
    if (d) openLockedDoor(d);
  },
});
let nearby: Interactable | null = null;
const interact = () => {
  if (rockAction()) return;
  nearby?.act();
};
hud.onPromptTap = interact;

window.addEventListener('pointerdown', () => sfx.unlock());
window.addEventListener('keydown', () => sfx.unlock());
input.onPress = (code) => {
  if (chooser.open || titleScreen.open || victory.open || sandboxPanel.open || shop.open) return;
  if (code === 'KeyB' && mode === 'sandbox' && !paused) return openSandbox(true);
  if (code === 'Escape' || code === 'KeyP') return setPaused(!paused);
  if (paused) return;
  if (code === 'Space') dash();
  else if (code === 'ShiftLeft' || code === 'ShiftRight') jump();
  else if (code === 'KeyE' || code === 'Enter') interact();
  else if (code === 'KeyQ') cycleWeapon();
  else if (code === 'Digit1') selectWeapon('sword');
  else if (code === 'Digit2') selectWeapon('boomerang');
  else if (code === 'Digit3') selectWeapon('bow');
  else if (code === 'Digit4') selectWeapon('hands');
};

/* ---------- Helpers ---------- */
const projected = new THREE.Vector3();
function toScreen(x: number, y: number, z: number) {
  projected.set(x, y, z).project(rig.camera);
  return { x: (projected.x * 0.5 + 0.5) * window.innerWidth, y: (-projected.y * 0.5 + 0.5) * window.innerHeight };
}

const GOO: Partial<Record<EnemyKind, number>> = { green: 0x6fd35a, blue: 0x4fb8e6, mini: 0x86e3cf, kingSlime: 0x5fcf4a };

/* ---------- Game logic (one step) ---------- */
let introDone = false;
let introTimer = 6;
let dustTimer = 0;
let splashTimer = 0;
let lastExit: string | null = null;
let time = 0;

function tick(dt: number) {
  time += dt;
  const t = time;

  // Sliding to the screen next door: the camera glides over while Herman walks across
  if (transition?.kind === 'scroll') {
    const tr = transition;
    tr.t += dt;
    const k = Math.min(1, tr.t / tr.dur!);
    const e = k * k * (3 - 2 * k);
    herman.update(dt, t, { x: Math.sin(tr.face!), z: Math.cos(tr.face!) });
    herman.position.lerpVectors(tr.hFrom!, tr.hTo!, e);
    herman.face(tr.face!);
    rig.override = (rig.override ?? new THREE.Vector3()).lerpVectors(tr.camFrom!, tr.camTo!, e);
    lighting.setFocus(tr.off!.x * e, tr.off!.z * e);
    if (k >= 1) {
      transition = null;
      rig.override = null;
      lighting.setFocus(0, 0);
      enterArea(tr.to, tr.side);
      rig.snapNow();
    }
    return;
  }

  // Fade between screens (everything waits while the screen is dark)
  if (transition) {
    const T = 0.28;
    transition.t += dt;
    if (!transition.swapped && transition.t >= T) {
      transition.swapped = true;
      enterArea(transition.to, transition.side);
    }
    hud.setFade(transition.t < T ? transition.t / T : Math.max(0, 1 - (transition.t - T) / T));
    if (transition.t >= T * 2) {
      transition = null;
      hud.setFade(0);
    }
    return;
  }

  const m = input.move();
  const wantsMove = Math.hypot(m.x, m.y) > 0.1;

  for (let i = timers.length - 1; i >= 0; i--) {
    timers[i].t -= dt;
    if (timers[i].t <= 0) {
      const fn = timers[i].fn;
      timers.splice(i, 1);
      fn();
    }
  }

  if (aiming) {
    // While aiming, WASD (or the joystick) moves the gold target circle instead of Herman.
    aimPos.x += m.x * 11 * dt;
    aimPos.z += m.y * 11 * dt;
    clampAim();
    herman.face(Math.atan2(aimPos.x - herman.position.x, aimPos.z - herman.position.z));
    herman.update(dt, t, { x: 0, z: 0 });
  } else {
    herman.update(dt, t, { x: m.x, z: m.y });
  }
  if (!herman.alive && carried) dropRock();
  rocks?.update(dt);
  screen.collision.resolve(herman.position, herman.radius, { wade: true, jump: herman.airborne });

  // Wading: rivers and ponds slow Herman down and splash around his legs
  const inWater = screen.kind === 'meadow' && herman.alive && !herman.jumping && screen.collision.waterAt(herman.position.x, herman.position.z);
  if (inWater && !herman.wading) {
    sfx.splash();
    fx.burst(herman.position.x, 0.1, herman.position.z, new THREE.Color(0.75, 0.92, 1.3), 14, 2.5);
  }
  herman.wading = inWater;
  herman.terrainMul = inWater ? 0.5 : 1;
  if (inWater) {
    splashTimer -= dt;
    if (splashTimer <= 0 && (herman.isMoving() || herman.dashing)) {
      splashTimer = 0.16;
      fx.puffRing(herman.position.x, herman.position.z, 0xd8f2ff, 5);
      fx.goo(herman.position.x, herman.position.z, 0x9fdcff, 3, 0.45);
      sfx.wade();
    }
  }

  if (!introDone) {
    introTimer -= dt;
    if (wantsMove || introTimer <= 0) {
      introDone = true;
      hud.dismissIntro();
    }
  }

  // Monsters
  ctx.dt = dt;
  ctx.t = t;
  ctx.playerAlive = herman.alive;
  for (let i = 0; i < enemies.length; i++) enemies[i].update(ctx);
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const ea = enemies[i], eb = enemies[j];
      if (ea.state !== 'alive' || eb.state !== 'alive') continue;
      const a = ea.root.position, b = eb.root.position;
      const min = ea.radius + eb.radius;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 0.0001) {
        // Big monsters push small ones more than the other way round
        const wa = eb.radius / min, wb = ea.radius / min;
        const push = min - d;
        a.x -= (dx / d) * push * wa; a.z -= (dz / d) * push * wa;
        b.x += (dx / d) * push * wb; b.z += (dz / d) * push * wb;
      }
    }
  }
  for (const e of enemies) {
    if (!e.harmful()) continue;
    const d = Math.hypot(e.root.position.x - herman.position.x, e.root.position.z - herman.position.z);
    if (d < e.radius + herman.radius && hurtPlayer(e.contactDamage, e.root.position.x, e.root.position.z)) {
      if (!e.isBoss) e.hit(0, (e.root.position.x - herman.position.x) / (d || 1), (e.root.position.z - herman.position.z) / (d || 1), 5);
    }
  }

  bullets.update(dt, t, screen.collision, herman.position, herman.radius * 0.8, (dmg, x, z) => hurtPlayer(dmg, x, z));
  telegraphs.update(dt);
  const cp = mode === 'adventure' ? screen.crystalPos : null;
  const dp = mode === 'adventure' ? screen.dummyPos : null;
  if (cp && !crystalOn) {
    crystalTarget.root.position.set(cp.x, 0, cp.z);
    weapons.update(dt, t, wantsMove, [...enemies, crystalTarget]);
  } else if (dp && Math.hypot(dp.x - herman.position.x, dp.z - herman.position.z) < 5.5) {
    dummyTarget.root.position.set(dp.x, 0, dp.z);
    weapons.update(dt, t, wantsMove, [...enemies, dummyTarget]);
  } else weapons.update(dt, t, wantsMove, enemies);

  // Clean up the defeated
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.state !== 'dead') continue;
    const p = e.root.position;
    e.dispose(ctx);
    const goo = GOO[e.kind];
    if (goo) fx.goo(p.x, p.z, goo, e.isBoss ? 40 : e.kind === 'blue' ? 18 : 12, e.kind === 'mini' ? 0.6 : e.isBoss ? 2.2 : 1);
    else if (e.kind.startsWith('skel')) {
      fx.goo(p.x, p.z, 0xece3cc, e.isBoss ? 30 : 12, e.isBoss ? 1.6 : 0.8);
    } else {
      fx.puffRing(p.x, p.z, 0xe8d6ae, 14);
      fx.goo(p.x, p.z, 0x9bb35b, e.isBoss ? 30 : 10, e.isBoss ? 1.8 : 1.1);
    }
    scene.remove(e.root);
    enemies.splice(i, 1);
    if (e.kind === 'blue') {
      for (const side of [-1, 1]) {
        const mini = createEnemy('mini', p.x + side * 0.35, p.z, 1, false);
        mini.hit(0, side, 0, 5);
      }
    }
    if (e.isBoss && mode === 'adventure') {
      rig.shake(0.8);
      fx.burst(p.x, 1.2, p.z, new THREE.Color(3, 2.4, 0.9), 50, 7);
      bossDefeated(p.x, p.z);
    } else if (e.isBoss) {
      rig.shake(0.6);
      sfx.bigBoom();
      fx.burst(p.x, 1.2, p.z, new THREE.Color(3, 2.4, 0.9), 40, 6);
      // The key flies toward Herman's side of the meadow and lands near the boss
      const land = { x: p.x, z: p.z };
      screen.collision.resolve(land, 0.6);
      if (screen.collision.waterAt(land.x, land.z) || !screen.walkable(land.x, land.z)) Object.assign(land, spawnPoint(0));
      keyPickup = new KeyPickup(p.x, p.z, land.x, land.z);
      scene.add(keyPickup.mesh);
      for (let k = 0; k < 2; k++) {
        const h = new HeartPickup(p.x + (k - 0.5) * 1.2, p.z + 0.8);
        hearts.push(h);
        scene.add(h.mesh);
      }
    }
    spawnCoins(p.x, p.z, Math.round((GOLD_VALUE[e.kind] ?? 1) * gearEffects().goldMul), e.isBoss ? 1.6 : 0.8);
    if (!e.isBoss) {
      const dropChance = herman.halves <= 4 ? 0.28 : 0.12;
      if (Math.random() < dropChance) {
        const h = new HeartPickup(p.x, p.z);
        hearts.push(h);
        scene.add(h.mesh);
      }
    }
  }

  if (wavesRunning() && introDone && herman.alive) director.update(dt, enemies.length);
  if (wavesRunning() && director.state === 'reward' && rewardDone) {
    rewardDone = false;
    director.resume();
  }

  // Key
  if (keyPickup) {
    keyPickup.update(dt);
    if (keyPickup.landed && herman.alive && Math.hypot(keyPickup.mesh.position.x - herman.position.x, keyPickup.mesh.position.z - herman.position.z) < 0.9) {
      scene.remove(keyPickup.mesh);
      fx.burst(keyPickup.mesh.position.x, 1, keyPickup.mesh.position.z, new THREE.Color(3, 2.4, 0.9), 20, 3);
      keyPickup = null;
      hasKey = true;
      sfx.key();
      hud.showToast('You got the key!', 'Open the treasure chest.', 2800);
    }
  }

  secretCd -= dt;

  // Gold coins
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    const got = herman.alive && c.update(dt, herman.position);
    if (got || c.life <= 0) {
      if (got) {
        addGold(c.value);
        sfx.coin();
      }
      scene.remove(c.mesh);
      coins.splice(i, 1);
    }
  }

  // Heart pickups
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    h.update(dt);
    const close = Math.hypot(h.mesh.position.x - herman.position.x, h.mesh.position.z - herman.position.z) < 0.75;
    if ((close && herman.alive && herman.halves < herman.maxHalves) || h.life <= 0) {
      if (close && h.life > 0) {
        herman.heal(2);
        sfx.heart();
        const s = toScreen(herman.position.x, 1.9, herman.position.z);
        hud.number('+1 ♥', s.x, s.y, 'heal');
      }
      scene.remove(h.mesh);
      hearts.splice(i, 1);
    }
  }

  // Chest lid
  if (chestOpenT >= 0) chestOpenT = Math.min(1, chestOpenT + dt / 0.6);
  else if (chestOpenT === -2) chestOpenT = -1;

  // Death
  if (!herman.alive) {
    deathTimer += dt;
    if (deathTimer > 1.2 && !deathScreen.open) {
      if (mode === 'adventure') {
        save.deaths++;
        persist();
        deathScreen.show(true, 0, `Herman fell in ${area(adv.area).title}. He wakes up in Oakhollow with all ${save.gold} of his gold. Power-ups reset, but upgrades and gear stay.`);
      }
      else if (mode === 'sandbox') deathScreen.show(true, 0, "Herman fell in the Sandbox. Try again keeps your power-ups. Tip: turn on \"Can't lose hearts\" in the Sandbox panel.");
      else deathScreen.show(true, wavesCleared);
      input.release();
    }
  }

  dustTimer -= dt;
  if ((herman.isMoving() || herman.dashing) && dustTimer <= 0 && !herman.wading && !herman.jumping) {
    dust.emit(herman.position.x, herman.position.z, herman.velocity.x, herman.velocity.z);
    dustTimer = herman.dashing ? 0.03 : 0.11;
  }

  nearby = null;
  for (const it of interactables) if (it.pos().distanceTo(herman.position) < 1.35) nearby = it;

  if (mode === 'adventure') {
    tickAdventure(dt);
    return;
  }
  let inExit: string | null = null;
  for (const e of screen.exits) {
    const p = herman.position;
    if (p.x >= e.minX && p.x <= e.maxX && p.z >= e.minZ && p.z <= e.maxZ) inExit = e.label || e.side;
  }
  if (inExit && inExit !== lastExit) hud.showToast('Arena mode stays on this screen', 'Pick Adventure in the pause menu to explore.');
  lastExit = inExit;
}

/* ---------- Frame: logic + visuals ---------- */
const clock = new THREE.Clock();
const debug = { frozen: false };
let lidK = 0;

function frame() {
  const dt = debug.frozen ? 0 : Math.min(clock.getDelta(), 1 / 20);
  const running = !paused && !deathScreen.open && !chooser.open && !titleScreen.open && !victory.open && !sandboxPanel.open && !shop.open && !debug.frozen;
  if (running) tick(dt);
  else if (deathScreen.open) herman.update(dt, time, { x: 0, z: 0 });

  const t = time;
  dust.update(dt);
  if (!debug.frozen) fx.update(running ? dt : 0);
  butterflies.update(t);
  screen.update(t, running ? dt : 0, herman.position);
  for (const n of shownNeighbors) if (n !== screen) n.update(t, running ? dt : 0, FAR);
  if (transition?.kind === 'scroll') {
    const dest = screenFor(transition.to);
    if (dest.kind === 'dungeon') dest.update(t, running ? dt : 0, FAR);
  }
  rig.update(dt, herman.position);
  cullNeighbors();

  // Chest lid opens smoothly and closes again later
  const lidTarget = chestOpenT >= 0 || (mode === 'adventure' && adv.opened.has(adv.area)) ? 1 : 0;
  lidK += (lidTarget - lidK) * (1 - Math.exp(-dt * 8));
  screen.chest?.setOpen(lidK);
  const markChest = mode !== 'adventure' ? hasKey : advChestAvailable() && adv.screenClear && !transition;
  chestMarker.visible = markChest;
  if (markChest) chestMarker.position.set(screen.chestPos.x, 1.35 + Math.abs(Math.sin(t * 4)) * 0.3, screen.chestPos.z);

  lighting.lantern.position.set(herman.position.x, 2.2, herman.position.z + 0.4);

  const ready = herman.dashReady;
  dashRing.mesh.visible = herman.alive && ready < 1;
  dashRing.uniforms.uProgress.value = ready;
  dashRing.mesh.position.set(herman.position.x, 0.035, herman.position.z);
  const tgt = weapons.target;
  targetRing.visible = !!tgt && herman.alive;
  if (tgt) {
    targetRing.position.set(tgt.root.position.x, 0.04, tgt.root.position.z);
    targetRing.scale.setScalar(Math.max(0.8, tgt.radius * 2.2));
    targetRing.rotation.y = t * 1.5;
  }

  // HUD
  hud.setHearts(herman.halves, herman.maxHalves);
  hud.setWeapon(weapons.current, weapons.power.infiniteQuiver ? Infinity : weapons.arrows, weapons.quiverMax, !!carried, aiming);
  herman.carryHolder.getWorldPosition(handPos);
  rocks?.showAim(aiming ? handPos : null, aiming ? aimPos : null, t);
  // What can Herman do with rocks right now?
  let rockLabel: string | null = null;
  let rockSpot: THREE.Vector3 | null = null;
  if (herman.alive && !chooser.open) {
    if (aiming) rockLabel = 'THROW';
    else if (carried) rockLabel = 'AIM';
    else {
      const r = screen.kind === 'meadow' && rocks ? rocks.nearest(herman.position.x, herman.position.z, 1.2) : null;
      if (r) {
        rockSpot = r.mesh.position;
        rockLabel = weapons.current === 'hands' ? 'LIFT' : 'SWITCH';
      }
    }
  }
  hud.setAction(rockLabel && rockLabel !== 'SWITCH' ? rockLabel : null);
  hud.setDash(ready);
  hud.setKey(mode !== 'adventure' && hasKey);
  hud.setAdvKeys(mode === 'adventure' && started, adv.keys, adv.bigKey);
  hud.setGold(mode === 'adventure' && started, save.gold);
  hud.setMinimap(mode === 'adventure' && started ? minimapHtml() : null);
  const boss = enemies.find((e) => e.isBoss && e.state !== 'dead');
  hud.setBoss(boss ? boss.displayName : null, boss ? boss.hp / boss.maxHp : 0);
  const left = enemies.length + director.pending;
  const theme = director.spec?.theme ?? '';
  let waveText = '';
  if (mode === 'adventure') {
    const a = area(adv.area);
    const n = enemies.filter((e) => e.state !== 'dead').length;
    waveText = `<b>${a.title}</b>${n ? `Monsters left: ${n}` : a.kind === 'room' ? 'Cleared!' : 'All clear'}`;
  } else if (mode === 'sandbox' && !sandbox.wavesOn) {
    const n = enemies.filter((e) => e.state !== 'dead').length;
    waveText = `<b>Sandbox</b>${n ? `Monsters: ${n}` : 'Press B or the Sandbox button for monsters'}${sandbox.invincible ? ' · can\'t lose hearts' : ''}`;
  } else if (director.wave > 0) {
    if (director.state === 'reward') waveText = `<b>Wave ${director.wave}</b>${hasKey ? 'Open the chest!' : keyPickup ? 'Grab the key!' : 'Open the chest!'}`;
    else if (director.state === 'cleared') waveText = `<b>Wave ${director.wave}</b>Cleared!`;
    else waveText = `<b>Wave ${director.wave}</b>${theme} left: ${left}`;
  }
  hud.setWave(waveText);
  if (rockLabel && !hud.touch) {
    const at = rockSpot ?? herman.position;
    const s = toScreen(at.x, rockSpot ? 1.1 : 2.6, at.z);
    const text = rockLabel === 'THROW' ? 'Throw! (WASD moves the circle)' : rockLabel === 'AIM' ? 'Aim the rock' : rockLabel === 'LIFT' ? 'Lift rock' : 'Press 4 for empty hands to lift this rock';
    if (rockLabel === 'SWITCH') hud.showPrompt(text, s.x, s.y, false);
    else hud.showPrompt(text, s.x, s.y);
  } else if (rockLabel === 'SWITCH' && hud.touch && rockSpot) {
    const s = toScreen(rockSpot.x, 1.1, rockSpot.z);
    hud.showPrompt('Pick empty hands to lift', s.x, s.y);
  } else if (nearby && herman.alive && !chooser.open) {
    const np = nearby.pos();
    const s = toScreen(np.x, 1.35, np.z);
    hud.showPrompt(nearby.label(), s.x, s.y);
  } else hud.showPrompt(null);
  hud.update(dt);

  renderer.render();
  requestAnimationFrame(frame);
}

rig.onFit = (d) => {
  const fog = scene.fog as THREE.Fog;
  fog.near = d * 1.3;
  fog.far = d * 2.8;
};
rig.refit();
requestAnimationFrame(frame);

/* ---------- Test hooks (used by automated checks; harmless in play) ---------- */
function state() {
  return {
    wave: director.wave, waveState: director.state, enemies: enemies.length, pending: director.pending,
    kinds: enemies.map((e) => e.kind).join(','),
    halves: herman.halves, max: herman.maxHalves, alive: herman.alive, weapon: weapons.current, arrows: weapons.arrows,
    ground: weapons.groundArrowCount, pos: [+herman.position.x.toFixed(2), +herman.position.z.toFixed(2)],
    dashReady: +herman.dashReady.toFixed(2), wavesCleared, hasKey, mode, area: adv.area, keys: adv.keys, bigKey: adv.bigKey, fighting: adv.fighting, key: !!keyPickup, owned: owned.map((o) => `${o.def.id}:${o.rarity}`).join(' '),
    bullets: bullets.count,
  };
}
function sim(seconds: number, move: { x: number; y: number } | null = null) {
  input.forced = move ?? { x: 0, y: 0 };
  for (let i = 0; i < Math.round(seconds * 60); i++) if (!deathScreen.open && !chooser.open && !victory.open) tick(1 / 60);
  input.forced = null;
  return state();
}
(window as unknown as Record<string, unknown>).__hq = {
  herman, rig, scene, screen, renderer, weapons, enemies, director, input, hearts, bullets, telegraphs, lighting,
  sim, state, dash, select: selectWeapon, switchMap, map: () => screen.kind, rocks, rockAction, aimPos, isAiming: () => aiming, order: WEAPON_ORDER, restart, createEnemy, debug, fx,
  openChest, chooser, give: (h: boolean) => (hasKey = h), owned: () => owned, applyPowers,
  key: () => keyPickup,
  enterArea, adv, mode: () => mode, startMode, newAdventure, screenFor, area,
  doors: () => screen.doors,
  lockedDoorNear, interact: () => interact(),
  sandbox, sandboxPanel, openSandbox, sandboxRestart,
  save, shop, openShop, coins: () => coins.length, jump, eraseSave,
  cur: () => screen,
  transitioning: () => (transition ? transition.kind : null),
  neighbors: () => shownNeighbors.map((n) => n.name),
  container: () => container,
  openAdvChest, onProjectile: (x: number, z: number) => weapons.onProjectile?.(x, z),
  grant: (id: string, rarity: Rarity) => {
    const def = POWERS.find((p) => p.id === id);
    if (def) {
      owned.push({ def, rarity });
      applyPowers();
    }
  },
};

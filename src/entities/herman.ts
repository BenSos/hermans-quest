import * as THREE from 'three';
import { toon, addOutline } from '../core/toon';
import { smooth } from '../core/geo';

/**
 * Herman: a short, sturdy cartoon hero in everyday clothes (shirt and trousers you can recolor).
 * Gear bought from Jerry shows on him: helmets, armor, boots and a charm on a cord.
 */
export class Herman {
  readonly root = new THREE.Group();
  readonly position = this.root.position;
  readonly velocity = new THREE.Vector3();
  readonly radius = 0.32;
  speed = 4.6;

  private body = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private cape = new THREE.Group();
  private plume = new THREE.Group();
  private torso!: THREE.Mesh;
  private walkPhase = 0;
  private moveAmt = 0;
  private facing = 0;

  /* Weapons held in hand */
  private sword!: THREE.Group;
  private heldRang!: THREE.Group;
  private bow!: THREE.Group;
  private weapon: WeaponId = 'sword';

  /* Health, measured in half hearts */
  maxHalves = 10;
  halves = 10;
  alive = true;
  private invuln = 0;
  /** Wind Boots make the dash go farther. */
  dashDistMul = 1;
  /** Jumping (Shift): -1 on the ground, otherwise seconds into the jump. */
  private jumpT = -1;
  private landCd = 0;
  jumpY = 0;
  onLand: (() => void) | null = null;
  /** Wading through a river: slower, and Herman sinks to his knees. */
  wading = false;
  terrainMul = 1;
  private wadeY = 0;

  get airborne() {
    return this.jumpY > 0.3;
  }

  get jumping() {
    return this.jumpT >= 0;
  }

  tryJump(): boolean {
    if (!this.alive || this.jumpT >= 0 || this.landCd > 0 || this.dashTime > 0) return false;
    this.jumpT = 0;
    return true;
  }
  private deathT = 0;
  private knock = new THREE.Vector3();

  /* Dash */
  dashCooldown = 1.5;
  /** Phoenix Feather: rise again once when falling. */
  phoenix = false;
  onPhoenix: (() => void) | null = null;
  private dashTime = 0;
  private dashCd = 0;
  private dashDir = new THREE.Vector3();
  private ghostTimer = 0;
  readonly ghosts = new THREE.Group();
  private ghostPool: { g: THREE.Object3D; mat: THREE.MeshBasicMaterial; life: number }[] = [];

  /* Carrying a rock over his head (hands slot) */
  readonly carryHolder = new THREE.Group();
  carrying = false;
  /** While aiming a throw, Herman stands still and faces the target. */
  aimingThrow = false;

  /* Attack animation */
  private swingT = 1;
  private throwT = 1;
  private aiming = 0;

  /* Clothes and gear (gear only shows in Adventure once bought from Jerry and worn) */
  private shirtMat = toon(0x2f6fd6);
  private pantsMat = toon(0x3a5a8c);
  private gearParts: Record<string, THREE.Object3D[]> = {};
  private shoes: THREE.Object3D[] = [];
  private hair!: THREE.Group;

  constructor() {
    const steel = toon(0xc9d2de);
    const darkSteel = toon(0x8c96a8);
    const iron = toon(0x9aa2ae);
    const leather = toon(0x6b4226);
    const softLeather = toon(0xa8774a);
    const skin = toon(0xf1c49e);
    const gold = toon(0xf4c542, { emissive: 0x3a2800 });
    const red = toon(0xd13b33);
    const visor = toon(0x23202e);
    const OL = 0.022;

    const part = (geo: THREE.BufferGeometry, mat: THREE.Material, outline = OL) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      if (outline > 0) addOutline(m, outline, smooth(geo));
      return m;
    };
    const gear = (id: string, ...objs: THREE.Object3D[]) => {
      (this.gearParts[id] ??= []).push(...objs);
      for (const o of objs) o.visible = false;
    };

    this.root.add(this.body);

    // Legs in trousers, with plain shoes (pivot at the hip so they can swing)
    for (const [leg, x] of [[this.legL, -0.12], [this.legR, 0.12]] as const) {
      leg.position.set(x, 0.4, 0);
      const thigh = part(new THREE.CapsuleGeometry(0.085, 0.16, 4, 8), this.pantsMat);
      thigh.position.y = -0.14;
      const shoe = part(new THREE.CapsuleGeometry(0.09, 0.07, 4, 8), leather);
      shoe.position.set(0, -0.33, 0.03);
      shoe.scale.set(1, 0.75, 1.25);
      this.shoes.push(shoe);
      leg.add(thigh, shoe);
      // Gear boots: Soft (tan), Swift (blue), Wind (white with little wings)
      const bootGeo = new THREE.CapsuleGeometry(0.1, 0.12, 4, 8);
      const soft = part(bootGeo, softLeather);
      const swift = part(bootGeo, toon(0x3d6fb0));
      const wind = part(bootGeo, toon(0xeef3f8));
      for (const b of [soft, swift, wind]) {
        b.position.set(0, -0.3, 0.03);
        b.scale.set(1, 0.95, 1.2);
        leg.add(b);
      }
      const cuff = part(new THREE.TorusGeometry(0.1, 0.025, 6, 12), toon(0xf4c542), 0.01);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.2;
      leg.add(cuff);
      const wing = part(new THREE.ConeGeometry(0.05, 0.16, 4), toon(0xffffff), 0.012);
      wing.position.set(x < 0 ? -0.1 : 0.1, -0.24, -0.06);
      wing.rotation.set(-0.8, 0, x < 0 ? 0.9 : -0.9);
      leg.add(wing);
      gear('softboots', soft);
      gear('swiftboots', swift, cuff);
      gear('windboots', wind, wing);
      this.body.add(leg);
    }

    // Shirt (color can be changed in the pause menu)
    this.torso = part(new THREE.CapsuleGeometry(0.235, 0.2, 6, 14), this.shirtMat);
    this.torso.position.y = 0.66;
    this.torso.scale.set(1, 1, 0.85);
    this.body.add(this.torso);
    const collar = part(new THREE.TorusGeometry(0.11, 0.025, 6, 14), this.shirtMat, 0.012);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.9;
    this.body.add(collar);

    // Trousers top under the belt
    const hips = part(new THREE.CylinderGeometry(0.21, 0.24, 0.14, 14), this.pantsMat);
    hips.position.y = 0.46;
    this.body.add(hips);
    const belt = part(new THREE.TorusGeometry(0.215, 0.035, 6, 18), leather, 0.015);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.55;
    belt.scale.set(1, 0.85, 1);
    this.body.add(belt);
    const buckle = part(new THREE.BoxGeometry(0.08, 0.07, 0.03), gold, 0.012);
    buckle.position.set(0, 0.55, 0.19);
    this.body.add(buckle);

    // Armor from Jerry, worn over the shirt
    const vest = part(new THREE.CapsuleGeometry(0.25, 0.1, 6, 14), toon(0xd8b98a));
    vest.position.y = 0.64;
    vest.scale.set(1, 0.9, 0.88);
    const quilt: THREE.Object3D[] = [];
    for (const y of [0.58, 0.67, 0.76]) {
      const q = new THREE.Mesh(new THREE.TorusGeometry(0.248, 0.008, 4, 20), toon(0x9c7a4a));
      q.rotation.x = Math.PI / 2;
      q.scale.set(1, 0.88, 1);
      q.position.y = y;
      quilt.push(q);
    }
    gear('vest', vest, ...quilt);
    const mail = part(new THREE.CapsuleGeometry(0.255, 0.16, 6, 14), iron);
    mail.position.y = 0.6;
    mail.scale.set(1, 0.92, 0.9);
    const mailHem = part(new THREE.CylinderGeometry(0.25, 0.27, 0.1, 14), darkSteel, 0.012);
    mailHem.position.y = 0.45;
    gear('chain', mail, mailHem);
    const plate = part(new THREE.CapsuleGeometry(0.26, 0.12, 6, 14), steel, 0.025);
    plate.position.y = 0.65;
    plate.scale.set(1, 0.9, 0.92);
    const plateRidge = part(new THREE.BoxGeometry(0.04, 0.3, 0.04), gold, 0.01);
    plateRidge.position.set(0, 0.66, 0.23);
    const pads: THREE.Object3D[] = [];
    for (const x of [-0.25, 0.25]) {
      const pad = part(new THREE.SphereGeometry(0.12, 14, 10), steel);
      pad.position.set(x, 0.86, 0);
      pad.scale.set(1.15, 0.8, 1.15);
      pads.push(pad);
    }
    gear('plate', plate, plateRidge, ...pads);
    this.body.add(vest, ...quilt, mail, mailHem, plate, plateRidge, ...pads);

    // Charm pendant on the chest
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 4, 16, Math.PI), toon(0x5c3a1f));
    cord.rotation.set(Math.PI, 0, 0);
    cord.position.set(0, 0.88, 0.12);
    cord.rotation.x = Math.PI + 0.5;
    const coin = part(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 12), gold, 0.01);
    coin.rotation.x = Math.PI / 2;
    coin.position.set(0, 0.76, 0.23);
    const ember = part(new THREE.OctahedronGeometry(0.05), toon(0xff5a2a, { emissive: 0x8a1a00 }), 0.01);
    ember.position.set(0, 0.76, 0.23);
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.025 : 0.06;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    starShape.closePath();
    const star = part(new THREE.ExtrudeGeometry(starShape, { depth: 0.015, bevelEnabled: false }), toon(0x9fe0ff, { emissive: 0x1a4a6a }), 0.008);
    star.position.set(0, 0.76, 0.22);
    gear('charm', cord);
    gear('coin', coin);
    gear('ember', ember);
    gear('star', star);
    this.body.add(cord, coin, ember, star);

    // Arms in shirt sleeves, bare hands (pivot at the shoulder)
    for (const [arm, x] of [[this.armL, -0.29], [this.armR, 0.29]] as const) {
      arm.position.set(x, 0.82, 0);
      const upper = part(new THREE.CapsuleGeometry(0.07, 0.18, 4, 8), this.shirtMat);
      upper.position.y = -0.14;
      const hand = part(new THREE.SphereGeometry(0.072, 10, 8), skin);
      hand.position.y = -0.3;
      arm.add(upper, hand);
      // Plate armor adds steel vambraces
      const brace = part(new THREE.CylinderGeometry(0.08, 0.075, 0.14, 10), steel, 0.015);
      brace.position.y = -0.2;
      arm.add(brace);
      gear('plate', brace);
      this.body.add(arm);
    }
    this.armL.rotation.z = -0.12;
    this.armR.rotation.z = 0.12;

    // Sword in the right hand, pointing forward and up
    const sword = new THREE.Group();
    const grip = part(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6), leather, 0.012);
    const guard = part(new THREE.BoxGeometry(0.2, 0.04, 0.05), gold, 0.012);
    guard.position.y = 0.08;
    const bladeGeo = new THREE.BoxGeometry(0.06, 0.5, 0.018);
    bladeGeo.translate(0, 0.35, 0);
    const blade = part(bladeGeo, toon(0xe8eef5, { emissive: 0x1a1f26 }), 0.012);
    const tipGeo = new THREE.ConeGeometry(0.0425, 0.08, 4);
    tipGeo.rotateY(Math.PI / 4);
    tipGeo.scale(1, 1, 0.3);
    tipGeo.translate(0, 0.64, 0);
    const tip = part(tipGeo, toon(0xe8eef5), 0);
    const pommel = part(new THREE.SphereGeometry(0.035, 8, 6), gold, 0.012);
    pommel.position.y = -0.08;
    sword.add(grip, guard, blade, tip, pommel);
    sword.position.set(0, -0.31, 0.02);
    sword.rotation.set(1.15, 0, 0);
    this.armR.add(sword);
    this.sword = sword;

    // Boomerang (held in the right hand when equipped)
    this.heldRang = buildBoomerang();
    this.heldRang.position.set(0, -0.33, 0.04);
    this.heldRang.rotation.set(1.3, 0, 0.4);
    this.armR.add(this.heldRang);

    // Bow in the left hand: an arc of wood with a string
    const bow = new THREE.Group();
    const arcGeo = new THREE.TorusGeometry(0.3, 0.026, 6, 18, Math.PI * 0.85);
    arcGeo.rotateZ(-Math.PI / 2 - Math.PI * 0.425);
    arcGeo.rotateY(Math.PI / 2);
    arcGeo.translate(0, 0.3, 0);
    const arc = part(arcGeo, toon(0x8a5530), 0.014);
    const chordY = 0.3 - 0.3 * Math.cos(Math.PI * 0.425);
    const chordHalf = 0.3 * Math.sin(Math.PI * 0.425);
    const stringGeo = new THREE.CylinderGeometry(0.006, 0.006, chordHalf * 2, 4);
    stringGeo.rotateX(Math.PI / 2);
    const string = new THREE.Mesh(stringGeo, toon(0xf3ead8));
    string.position.y = chordY;
    bow.add(arc, string);
    bow.position.set(0, -0.31, 0);
    this.armL.add(bow);
    this.bow = bow;

    // Quiver on the hip
    const quiverGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.34, 8);
    const quiver = part(quiverGeo, leather, 0.014);
    quiver.position.set(0.25, 0.52, -0.1);
    quiver.rotation.set(-0.35, 0, -0.25);
    for (let i = 0; i < 3; i++) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), red);
      fl.position.set((i - 1) * 0.03, 0.2, (i % 2) * 0.02);
      quiver.add(fl);
    }
    this.body.add(quiver);

    // A red cape comes with the Plate Armor and flows back when running
    const capeGeo = new THREE.PlaneGeometry(0.44, 0.58, 4, 6);
    capeGeo.translate(0, -0.29, 0);
    const cpos = capeGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < cpos.count; i++) {
      const x = cpos.getX(i);
      const y = cpos.getY(i);
      cpos.setZ(i, -Math.cos((x / 0.22) * 1.2) * 0.05 + 0.05);
      cpos.setX(i, x * (1 + -y * 0.35));
    }
    capeGeo.computeVertexNormals();
    const capeMesh = new THREE.Mesh(capeGeo, toon(0xc8362f, { side: THREE.DoubleSide }));
    capeMesh.castShadow = true;
    this.cape.add(capeMesh);
    this.cape.position.set(0, 0.88, -0.17);
    this.body.add(this.cape);
    gear('plate', this.cape);

    // Head: a friendly face with messy brown hair
    const head = new THREE.Group();
    head.position.y = 1.1;
    const face = part(new THREE.SphereGeometry(0.24, 20, 16), skin, 0.025);
    face.scale.set(1, 1.02, 0.98);
    head.add(face);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1b1a24 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), eyeMat);
      eye.position.set(sx * 0.085, 0.01, 0.215);
      eye.scale.set(1, 1.3, 0.6);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      shine.position.set(sx * 0.085 + 0.01, 0.025, 0.232);
      head.add(eye, shine);
    }
    const nose = part(new THREE.SphereGeometry(0.035, 8, 6), toon(0xe8ab84), 0);
    nose.position.set(0, -0.04, 0.235);
    const cheeks = toon(0xf09a8a);
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), cheeks);
      c.position.set(sx * 0.13, -0.05, 0.2);
      c.rotation.y = sx * 0.55;
      head.add(c);
    }
    head.add(nose);
    this.hair = new THREE.Group();
    const hairMat = toon(0x7a4a22);
    const cap = part(new THREE.SphereGeometry(0.255, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat, 0.02);
    cap.position.y = 0.02;
    cap.rotation.x = -0.25;
    this.hair.add(cap);
    for (const [hx, hy, hz, r] of [[-0.12, 0.13, 0.17, 0.07], [0, 0.16, 0.19, 0.075], [0.12, 0.13, 0.17, 0.07], [0.06, 0.24, 0.05, 0.08], [-0.08, 0.23, -0.02, 0.08]]) {
      const tuft = part(new THREE.SphereGeometry(r, 10, 8), hairMat, 0.015);
      tuft.position.set(hx, hy, hz);
      this.hair.add(tuft);
    }
    head.add(this.hair);

    // Helmets from Jerry
    const leatherCap = new THREE.Group();
    const lc = part(new THREE.SphereGeometry(0.262, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), softLeather, 0.02);
    lc.position.y = 0.06;
    lc.rotation.x = -0.3;
    const brim = part(new THREE.TorusGeometry(0.235, 0.028, 6, 20), leather, 0.012);
    brim.rotation.x = Math.PI / 2 - 0.3;
    brim.position.set(0, 0.17, -0.05);
    leatherCap.add(lc, brim);
    const ironHelm = new THREE.Group();
    const ih = part(new THREE.SphereGeometry(0.27, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), iron, 0.022);
    ih.position.y = 0.06;
    ih.rotation.x = -0.25;
    const noseGuard = part(new THREE.BoxGeometry(0.035, 0.12, 0.03), darkSteel, 0.012);
    noseGuard.position.set(0, 0.075, 0.245);
    noseGuard.rotation.x = -0.25;
    const ihRim = part(new THREE.TorusGeometry(0.245, 0.024, 6, 20), darkSteel, 0.012);
    ihRim.rotation.x = Math.PI / 2 - 0.25;
    ihRim.position.set(0, 0.13, -0.03);
    ironHelm.add(ih, noseGuard, ihRim);
    // Knight's Helm: the full closed helmet with a visor and red plume
    const knight = new THREE.Group();
    const helm = part(new THREE.SphereGeometry(0.28, 20, 16), steel, 0.025);
    helm.scale.set(1, 1.04, 1);
    const ridge = part(new THREE.TorusGeometry(0.285, 0.022, 6, 24, Math.PI), gold, 0.012);
    ridge.rotation.y = Math.PI / 2;
    const slit = part(new THREE.CylinderGeometry(0.287, 0.287, 0.065, 20, 1, true, -1.0, 2.0), visor, 0);
    knight.add(helm, ridge, slit);
    for (const [hx, hy] of [[-0.05, -0.09], [0.05, -0.09], [0, -0.14], [-0.1, -0.13], [0.1, -0.13]]) {
      const hole = part(new THREE.SphereGeometry(0.018, 6, 4), visor, 0);
      hole.position.set(hx, hy, Math.sqrt(Math.max(0, 0.28 * 0.28 - hx * hx - hy * hy)));
      knight.add(hole);
    }
    const krim = part(new THREE.TorusGeometry(0.27, 0.03, 6, 24), darkSteel, 0.012);
    krim.rotation.x = Math.PI / 2;
    krim.position.y = -0.16;
    knight.add(krim);
    for (let i = 0; i < 5; i++) {
      const puff = part(new THREE.SphereGeometry(0.075 - i * 0.006, 10, 8), red, 0.015);
      const a = 0.4 - i * 0.42;
      puff.position.set(0, Math.cos(a) * 0.32 + 0.02, Math.sin(a) * 0.32 - 0.02);
      this.plume.add(puff);
    }
    knight.add(this.plume);
    head.add(leatherCap, ironHelm, knight);
    gear('cap', leatherCap);
    gear('helm', ironHelm);
    gear('knighthelm', knight);
    this.body.add(head);

    this.root.scale.setScalar(1.3);
    this.carryHolder.position.set(0, 1.62, 0.02);
    this.body.add(this.carryHolder);
    this.setWeapon('sword');

    // Dash afterimages: see-through copies of Herman that fade out.
    for (let i = 0; i < 4; i++) {
      const g = this.root.clone(true);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.6), transparent: true, opacity: 0, depthWrite: false });
      const drop: THREE.Object3D[] = [];
      g.traverse((o) => {
        if (o.userData.isOutline) drop.push(o);
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).material = mat;
          o.castShadow = false;
        }
      });
      drop.forEach((o) => o.removeFromParent());
      g.visible = false;
      this.ghosts.add(g);
      this.ghostPool.push({ g, mat, life: 0 });
    }
  }

  setWeapon(w: WeaponId) {
    this.weapon = w;
    this.sword.visible = w === 'sword';
    this.heldRang.visible = w === 'boomerang';
    this.bow.visible = w === 'bow';
  }

  /** Hide the boomerang in hand while it is flying. */
  setRangInHand(inHand: boolean) {
    if (this.weapon === 'boomerang') this.heldRang.visible = inHand;
  }

  get facingAngle() {
    return this.facing;
  }

  get invulnerable() {
    return this.invuln > 0 || this.dashTime > 0 || !this.alive;
  }

  get dashing() {
    return this.dashTime > 0;
  }

  /** 0 = just dashed, 1 = ready. */
  get dashReady() {
    return 1 - Math.max(0, this.dashCd) / this.dashCooldown;
  }

  tryDash(dirX: number, dirZ: number): boolean {
    if (!this.alive || this.dashCd > 0 || this.dashTime > 0) return false;
    let l = Math.hypot(dirX, dirZ);
    if (l < 0.1) {
      dirX = Math.sin(this.facing);
      dirZ = Math.cos(this.facing);
      l = 1;
    }
    this.dashDir.set(dirX / l, 0, dirZ / l);
    this.dashTime = DASH_TIME;
    this.dashCd = this.dashCooldown;
    this.facing = Math.atan2(this.dashDir.x, this.dashDir.z);
    this.root.rotation.y = this.facing;
    this.ghostTimer = 0;
    return true;
  }

  /** Returns true if the hit landed (not invulnerable). */
  hurt(halves: number, fromX: number, fromZ: number): boolean {
    if (this.invulnerable) return false;
    this.halves = Math.max(0, this.halves - halves);
    this.invuln = 1.0;
    const dx = this.position.x - fromX;
    const dz = this.position.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.knock.set((dx / d) * 7, 0, (dz / d) * 7);
    if (this.halves <= 0) {
      if (this.phoenix) {
        this.phoenix = false;
        this.halves = 6;
        this.invuln = 2.5;
        this.onPhoenix?.();
        return true;
      }
      this.alive = false;
      this.deathT = 0;
    }
    return true;
  }

  heal(halves: number) {
    this.halves = Math.min(this.maxHalves, this.halves + halves);
  }

  revive() {
    this.alive = true;
    this.maxHalves = 10;
    this.speed = 4.6;
    this.dashCooldown = 1.5;
    this.phoenix = false;
    this.halves = this.maxHalves;
    this.invuln = 1.5;
    this.deathT = 0;
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.jumpT = -1;
    this.jumpY = 0;
    this.wading = false;
    this.terrainMul = 1;
    this.velocity.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.dashCd = 0;
    this.dashTime = 0;
  }

  /** Sword swing toward an angle (radians, same convention as facing). */
  swing(angle: number) {
    this.swingT = 0;
    this.facing = angle;
    this.root.rotation.y = angle;
  }

  /** Turn to face a direction without attacking (used while aiming a rock). */
  face(angle: number) {
    this.facing = angle;
    this.root.rotation.y = angle;
  }

  throwAt(angle: number) {
    this.throwT = 0;
    this.facing = angle;
    this.root.rotation.y = angle;
  }

  /** Bow raised and aimed (true while standing still with a target). */
  aimAt(angle: number | null) {
    if (angle === null) {
      this.aiming = Math.max(0, this.aiming - 0.2);
      return;
    }
    this.aiming = 1;
    let d = angle - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * 0.5;
    this.root.rotation.y = this.facing;
  }

  /** Shirt and trousers colors (pause menu). */
  setClothes(shirt: number, pants: number) {
    this.shirtMat.color.setHex(shirt);
    this.pantsMat.color.setHex(pants);
  }

  /** Show the gear Herman is wearing (gear ids from Jerry's Armory), or nothing. */
  setGear(ids: string[]) {
    const on = new Set(ids);
    // Each charm hangs on the same cord
    if (on.has('coin') || on.has('ember') || on.has('star')) on.add('charm');
    for (const [id, parts] of Object.entries(this.gearParts)) {
      const v = on.has(id);
      for (const p of parts) p.visible = v;
    }
    const boots = on.has('softboots') || on.has('swiftboots') || on.has('windboots');
    for (const s of this.shoes) s.visible = !boots;
    // Helmets hide the hair (the leather cap leaves a fringe showing)
    this.hair.visible = !on.has('helm') && !on.has('knighthelm') && !on.has('cap');
    // Dash afterimages copy visibility from Herman, so they match automatically
  }

  /** move: desired direction in world x/z (length 0..1). */
  update(dt: number, t: number, move: { x: number; z: number }) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd -= dt;
    this.updateGhosts(dt);

    if (!this.alive) {
      // Topple over backward
      this.deathT = Math.min(1, this.deathT + dt / 0.5);
      const k = 1 - Math.pow(1 - this.deathT, 3);
      this.body.rotation.x = -1.45 * k;
      this.body.position.y = 0.12 * k;
      this.body.visible = true;
      this.velocity.multiplyScalar(Math.exp(-dt * 8));
      this.knock.multiplyScalar(Math.exp(-dt * 8));
      this.position.addScaledVector(this.knock, dt);
      return;
    }

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      const sp = (DASH_DIST * this.dashDistMul) / DASH_TIME;
      this.velocity.set(this.dashDir.x * sp, 0, this.dashDir.z * sp);
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) {
        this.spawnGhost();
        this.ghostTimer = 0.045;
      }
      if (this.dashTime <= 0) this.velocity.multiplyScalar(0.35);
    } else {
      const sp = this.speed * (this.carrying ? 0.85 : 1) * this.terrainMul;
      const targetVX = move.x * sp;
      const targetVZ = move.z * sp;
      const k = 1 - Math.exp(-dt * 16);
      this.velocity.x += (targetVX - this.velocity.x) * k;
      this.velocity.z += (targetVZ - this.velocity.z) * k;
    }
    this.position.x += (this.velocity.x + this.knock.x) * dt;
    this.position.z += (this.velocity.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.exp(-dt * 10));

    const spd = Math.hypot(this.velocity.x, this.velocity.z);
    const amtTarget = Math.min(1, spd / this.speed);
    this.moveAmt += (amtTarget - this.moveAmt) * (1 - Math.exp(-dt * 12));
    const a = this.moveAmt;

    const swinging = this.swingT < 1;
    if (Math.hypot(move.x, move.z) > 0.1 && !swinging && this.dashTime <= 0) {
      const target = Math.atan2(move.x, move.z);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-dt * 18));
      this.root.rotation.y = this.facing;
    }

    this.walkPhase += spd * dt * 3.6;
    const s = Math.sin(this.walkPhase);
    this.legL.rotation.x = s * 0.8 * a;
    this.legR.rotation.x = -s * 0.8 * a;
    this.armL.rotation.x = -s * 0.6 * a;
    this.armR.rotation.x = s * 0.35 * a - 0.15 * a;
    // Jump arc, and sinking to the knees in a river
    this.landCd -= dt;
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      const k = this.jumpT / JUMP_TIME;
      this.jumpY = 4 * JUMP_H * k * (1 - k);
      if (k >= 1) {
        this.jumpT = -1;
        this.jumpY = 0;
        this.landCd = 0.12;
        this.onLand?.();
      }
    }
    this.wadeY += ((this.wading && this.jumpT < 0 ? -0.34 : 0) - this.wadeY) * (1 - Math.exp(-dt * 12));
    const tuck = this.jumpT >= 0 ? Math.sin((this.jumpT / JUMP_TIME) * Math.PI) : 0;
    this.body.position.y = (this.jumpT >= 0 ? 0 : Math.abs(Math.cos(this.walkPhase)) * 0.06 * a) + this.jumpY + this.wadeY;
    if (tuck > 0) {
      this.legL.rotation.x = -0.9 * tuck;
      this.legR.rotation.x = -0.5 * tuck;
    }
    this.body.rotation.x = this.dashTime > 0 ? 0.35 : 0.13 * a;
    this.body.rotation.y = 0;

    const breathe = Math.sin(t * 2.2) * (1 - a);
    this.torso.scale.set(1 + breathe * 0.012, 1 + breathe * 0.02, 0.85);
    this.armL.rotation.z = -0.12 - breathe * 0.03;
    this.armR.rotation.z = 0.12 + breathe * 0.03;

    // Sword swing: arm out front, body sweeps from right to left, blade in line with the arm
    if (this.swingT < 1) {
      this.swingT = Math.min(1, this.swingT + dt / 0.22);
      const k = this.swingT;
      const e = 1 - Math.pow(1 - k, 2);
      this.armR.rotation.x = -1.45;
      this.armR.rotation.z = 0.25;
      this.body.rotation.y = 0.95 - 1.9 * e;
      this.sword.rotation.x = 1.15 + (Math.PI - 1.15) * Math.sin(k * Math.PI);
    } else {
      this.sword.rotation.x = 1.15;
    }

    // Boomerang throw: wind back, fling forward
    if (this.throwT < 1) {
      this.throwT = Math.min(1, this.throwT + dt / 0.22);
      const k = this.throwT;
      this.armR.rotation.x = k < 0.35 ? 0.9 * (k / 0.35) : 0.9 - 2.5 * ((k - 0.35) / 0.65);
      this.body.rotation.y = k < 0.35 ? -0.4 * (k / 0.35) : -0.4 + 0.7 * ((k - 0.35) / 0.65);
    }

    // Holding a rock up high with both hands
    if (this.carrying) {
      const bob = Math.sin(this.walkPhase * 2) * 0.08 * a;
      this.armL.rotation.x = -2.85 + bob;
      this.armR.rotation.x = -2.85 + bob;
      this.armL.rotation.z = -0.32;
      this.armR.rotation.z = 0.32;
      this.carryHolder.position.y = 1.62 + bob * 0.3;
    }
    if (this.weapon === 'hands' && this.throwT < 1) {
      // Two-handed heave: wind back over the head, then fling forward
      const k = this.throwT;
      const ax = k < 0.35 ? -2.85 - 0.4 * (k / 0.35) : -3.25 + 2.6 * ((k - 0.35) / 0.65);
      this.armL.rotation.x = ax;
      this.armR.rotation.x = ax;
      this.armL.rotation.z = -0.3;
      this.armR.rotation.z = 0.3;
      this.body.rotation.y = 0;
      this.body.rotation.x = k < 0.35 ? -0.15 : 0.25;
    }

    // Bow raised while aiming
    if (this.weapon === 'bow' && this.aiming > 0) {
      const k = this.aiming;
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -1.5, k);
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0.35, k);
      this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, -1.35, k);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, -0.55, k);
      this.body.rotation.y = -0.35 * k;
    }

    this.cape.rotation.x = (0.08 + 0.75 * a + Math.sin(this.walkPhase * 2) * 0.08 * a + Math.sin(t * 1.5) * 0.03);
    this.plume.rotation.x = -0.15 * a + Math.sin(this.walkPhase * 2) * 0.06 * a + Math.sin(t * 2) * 0.02;

    // Blink while invulnerable after a hit
    this.body.visible = this.invuln <= 0 || Math.floor(this.invuln * 14) % 2 === 0;
  }

  private spawnGhost() {
    const slot = this.ghostPool.reduce((a, b) => (a.life < b.life ? a : b));
    copyPose(this.root, slot.g);
    slot.g.visible = true;
    slot.life = 1;
  }

  private updateGhosts(dt: number) {
    for (const gh of this.ghostPool) {
      if (gh.life <= 0) continue;
      gh.life -= dt / 0.28;
      gh.mat.opacity = Math.max(0, gh.life) * 0.45;
      if (gh.life <= 0) gh.g.visible = false;
    }
  }

  isMoving() {
    return this.moveAmt > 0.3;
  }
}

export type WeaponId = 'sword' | 'boomerang' | 'bow' | 'hands';

const DASH_DIST = 3;
const JUMP_TIME = 0.55;
const JUMP_H = 1.1;
const DASH_TIME = 0.18;

/** Copies every local transform (and visibility) from one object tree to an identical clone. */
function copyPose(src: THREE.Object3D, dst: THREE.Object3D) {
  dst.position.copy(src.position);
  dst.quaternion.copy(src.quaternion);
  dst.scale.copy(src.scale);
  let j = 0;
  for (let i = 0; i < src.children.length; i++) {
    const c = src.children[i];
    if (c.userData.isOutline) continue;
    const d = dst.children[j++];
    if (!d) break;
    d.visible = c.visible;
    copyPose(c, d);
  }
}

/** A wooden boomerang with red tips. Shared by the one in Herman's hand and the one in flight. */
export function buildBoomerang(): THREE.Group {
  const g = new THREE.Group();
  const wood = toon(0xb9773d);
  const tipMat = toon(0xd13b33);
  for (const side of [-1, 1]) {
    const armGeo = new THREE.BoxGeometry(0.36, 0.045, 0.1);
    armGeo.translate(0.16, 0, 0);
    const arm = new THREE.Mesh(armGeo, wood);
    arm.rotation.y = side * 0.62;
    arm.castShadow = true;
    addOutline(arm, 0.014, smooth(armGeo));
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.105), tipMat);
    tip.position.set(0.31, 0, 0);
    arm.add(tip);
    g.add(arm);
  }
  return g;
}

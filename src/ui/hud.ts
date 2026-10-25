import type { WeaponId } from '../entities/herman';
import type { TimeOfDay } from '../game/lighting';

/* ---------- Settings (changeable any time from the pause menu) ---------- */

export type GameMode = 'adventure' | 'arena' | 'sandbox';

export interface Settings {
  /** Shirt color (kept as 'tabard' so older saves still load). */
  tabard: number;
  pants: number;
  outlines: boolean;
  glow: boolean;
  tilt: number;
  time: TimeOfDay;
  map: 'meadow' | 'dungeon';
  mode: GameMode;
  sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = { tabard: 0x2f6fd6, pants: 0x3a5a8c, outlines: true, glow: true, tilt: 45, time: 'morning', map: 'meadow', mode: 'adventure', sound: true };
const STORE_KEY = 'hermans-quest.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: Settings) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/* ---------- Icons ---------- */

const HEART_PATH = 'M17 28 C 8 21, 2 16, 2 9.5 C 2 5, 5.5 2, 9.5 2 C 12.6 2, 15.4 3.8, 17 6.5 C 18.6 3.8, 21.4 2, 24.5 2 C 28.5 2, 32 5, 32 9.5 C 32 16, 26 21, 17 28 Z';
let heartId = 0;
const heartSvg = (fill: 0 | 1 | 2) => {
  const id = `hc${heartId++}`;
  return `
<svg viewBox="0 0 34 30" aria-hidden="true">
  <defs><clipPath id="${id}"><rect x="0" y="0" width="${fill === 2 ? 34 : 17}" height="30"/></clipPath></defs>
  <path d="${HEART_PATH}" fill="#5b3a37"/>
  ${fill ? `<path d="${HEART_PATH}" fill="#e8383d" clip-path="url(#${id})"/>` : ''}
  <path d="${HEART_PATH}" fill="none" stroke="#3b2716" stroke-width="2.5" stroke-linejoin="round"/>
  ${fill ? `<path d="M8 8.5 C 8.5 6.5, 10 5.5, 11.8 5.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>` : ''}
</svg>`;
};

export const ICONS: Record<WeaponId, string> = {
  sword: `
<svg viewBox="0 0 40 40" aria-hidden="true">
  <path d="M30 4 L36 4 L36 10 L17 29 L11 23 Z" fill="#e8eef5" stroke="#3b2716" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M9 19 L21 31" stroke="#e9b93c" stroke-width="5" stroke-linecap="round"/>
  <path d="M13 27 L6 34" stroke="#7a4e2d" stroke-width="5" stroke-linecap="round"/>
  <circle cx="5" cy="35" r="3" fill="#e9b93c" stroke="#3b2716" stroke-width="1.6"/>
</svg>`,
  boomerang: `
<svg viewBox="0 0 40 40" aria-hidden="true">
  <path d="M6 30 C 10 18, 16 10, 30 6 C 33 5, 35 8, 33 10 C 22 15, 17 22, 13 33 C 12 36, 7 35, 6 30 Z" fill="#c4813f" stroke="#3b2716" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M28 7 C 31 6, 34 8, 33 10 L 30 11.5 Z" fill="#d13b33"/>
  <path d="M7 31 C 7 34, 11 36, 13 33 L 11.5 30 Z" fill="#d13b33"/>
</svg>`,
  hands: `
<svg viewBox="0 0 40 40" aria-hidden="true">
  <path d="M12 36 C 9 30, 7 25, 6 20 C 5.5 17.5, 8.5 16.5, 10 19 L12 23 L12 9 C 12 6.5, 15.5 6.5, 15.5 9 L15.5 19 L15.5 6 C 15.5 3.5, 19 3.5, 19 6 L19 19 L19 7 C 19 4.5, 22.5 4.5, 22.5 7 L22.5 19 L22.5 10 C 22.5 7.5, 26 7.5, 26 10 L26 25 C 26 30, 24 33, 22 36 Z" fill="#f0c9a0" stroke="#3b2716" stroke-width="2.2" stroke-linejoin="round"/>
</svg>`,
  bow: `
<svg viewBox="0 0 40 40" aria-hidden="true">
  <path d="M10 4 C 30 8, 32 32, 10 36" fill="none" stroke="#3b2716" stroke-width="6" stroke-linecap="round"/>
  <path d="M10 4 C 30 8, 32 32, 10 36" fill="none" stroke="#a96a35" stroke-width="3" stroke-linecap="round"/>
  <path d="M10 4 L10 36" stroke="#f3ead8" stroke-width="1.6"/>
  <path d="M4 20 L34 20" stroke="#3b2716" stroke-width="2.2"/>
  <path d="M34 20 L29 17 L29 23 Z" fill="#dfe6ee" stroke="#3b2716" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M4 20 L8 17 M4 20 L8 23" stroke="#d13b33" stroke-width="2.2" stroke-linecap="round"/>
</svg>`,
};

export const ROCK_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 26 L12 13 L22 8 L32 13 L35 25 L27 33 L13 33 Z" fill="#a9acb8" stroke="#3b2716" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 13 L20 19 L22 8 M20 19 L27 33 M20 19 L8 26" fill="none" stroke="#6e7180" stroke-width="1.6"/></svg>`;

const COIN = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="#f6c544" stroke="#3b2716" stroke-width="2.6"/><circle cx="20" cy="20" r="9" fill="none" stroke="#c9952a" stroke-width="2"/></svg>`;
const WRENCH = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 3.2a5 5 0 0 0-6 6.4L3.3 15a2 2 0 0 0 2.8 2.8l5.4-5.4a5 5 0 0 0 6.4-6l-3 3-2.6-.6-.6-2.6z" fill="currentColor"/></svg>`;
const GEAR = `
<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 2h4l.6 2.6a8 8 0 0 1 1.9 1.1l2.5-.9 2 3.4-2 1.8a8 8 0 0 1 0 2.2l2 1.8-2 3.4-2.5-.9a8 8 0 0 1-1.9 1.1L14 22h-4l-.6-2.6a8 8 0 0 1-1.9-1.1l-2.5.9-2-3.4 2-1.8a8 8 0 0 1 0-2.2l-2-1.8 2-3.4 2.5.9a8 8 0 0 1 1.9-1.1zm2 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>`;

const KEY_SVG = `
<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="12" cy="20" r="8" fill="none" stroke="#3b2716" stroke-width="7"/><circle cx="12" cy="20" r="8" fill="none" stroke="#f4c542" stroke-width="3.5"/><path d="M20 20 L36 20 M30 20 L30 27 M35 20 L35 25" stroke="#3b2716" stroke-width="7" stroke-linecap="round"/><path d="M20 20 L36 20 M30 20 L30 27 M35 20 L35 25" stroke="#f4c542" stroke-width="3.5" stroke-linecap="round"/></svg>`;

const WEAPON_NAMES: Record<WeaponId, string> = { sword: 'Sword', boomerang: 'Boomerang', bow: 'Bow', hands: 'Empty hands' };

/* ---------- HUD ---------- */

export class Hud {
  readonly root: HTMLDivElement;
  private heartsEl: HTMLDivElement;
  private prompt: HTMLDivElement;
  private toast: HTMLDivElement;
  private toastTimer = 0;
  private hint: HTMLDivElement;
  private banner: HTMLDivElement;
  private waveEl: HTMLDivElement;
  private bigEl: HTMLDivElement;
  private bigTimer = 0;
  private flashEl: HTMLDivElement;
  private slots: Record<WeaponId, HTMLButtonElement>;
  private arrowCount: HTMLSpanElement;
  private dashBtn: HTMLButtonElement | null = null;
  private weaponBtn: HTMLButtonElement | null = null;
  private numbers: { el: HTMLDivElement; life: number; x: number; y: number }[] = [];
  private lastHearts = '';
  readonly touch = matchMedia('(pointer: coarse)').matches;

  onPromptTap: (() => void) | null = null;
  onSelectWeapon: ((w: WeaponId) => void) | null = null;
  onCycleWeapon: (() => void) | null = null;
  onDash: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onSandbox: (() => void) | null = null;
  onJump: (() => void) | null = null;
  private lastGold = -1;
  onAction: (() => void) | null = null;
  private actionBtn: HTMLButtonElement | null = null;

  constructor() {
    const root = document.createElement('div');
    root.className = 'hud';
    root.innerHTML = `
      <div class="top-left">
        <div class="hearts"></div>
        <div class="key-icon" hidden>${KEY_SVG}</div>
        <div class="adv-keys" hidden><span class="sk">${KEY_SVG}<b>0</b></span><span class="bk" hidden>${KEY_SVG}<b>BIG</b></span></div>
        <button class="pause-btn" aria-label="Pause and settings">${GEAR}</button>
        <div class="gold-hud" hidden>${COIN}<b>0</b></div>
        <button class="sandbox-btn" hidden aria-label="Sandbox controls">${WRENCH}<span>Sandbox</span></button>
      </div>
      <div class="boss-bar" hidden><span class="boss-name"></span><div class="boss-track"><div class="boss-fill"></div></div></div>
      <div class="weapons">
        ${(['sword', 'boomerang', 'bow', 'hands'] as WeaponId[]).map((w, i) => `
          <button class="slot" data-w="${w}" aria-label="${WEAPON_NAMES[w]}">
            ${ICONS[w]}<span class="key">${i + 1}</span>${w === 'bow' ? '<span class="count">12</span>' : ''}
          </button>`).join('')}
        <div class="slot-name">Sword</div>
      </div>
      <div class="banner"><h1>Herman's Quest</h1><p>Phase 4 · Oakhollow</p></div>
      <div class="wave"></div>
      <div class="minimap" hidden></div>
      <div class="fade"></div>
      <div class="big"></div>
      <div class="hint">${this.touch
        ? 'Drag to walk · DASH to dodge · JUMP over things · Stop to shoot'
        : '<kbd>WASD</kbd> walk · <kbd>Space</kbd> dash · <kbd>Shift</kbd> jump · <kbd>1</kbd>-<kbd>4</kbd> or <kbd>Q</kbd> switch · <kbd>E</kbd> talk / open · <kbd>Esc</kbd> pause'}</div>
      <div class="prompt"></div>
      <div class="toast"></div>
      <div class="hurt-flash"></div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.heartsEl = root.querySelector('.hearts')!;
    this.prompt = root.querySelector('.prompt')!;
    this.toast = root.querySelector('.toast')!;
    this.hint = root.querySelector('.hint')!;
    this.banner = root.querySelector('.banner')!;
    this.waveEl = root.querySelector('.wave')!;
    this.bigEl = root.querySelector('.big')!;
    this.flashEl = root.querySelector('.hurt-flash')!;
    this.arrowCount = root.querySelector('.count')!;
    this.slots = {
      sword: root.querySelector('[data-w=sword]')!,
      boomerang: root.querySelector('[data-w=boomerang]')!,
      bow: root.querySelector('[data-w=bow]')!,
      hands: root.querySelector('[data-w=hands]')!,
    };
    const stop = (el: HTMLElement) => el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.prompt.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onPromptTap?.();
    });
    for (const [w, el] of Object.entries(this.slots)) {
      stop(el);
      el.addEventListener('click', () => this.onSelectWeapon?.(w as WeaponId));
    }
    const pause = root.querySelector<HTMLButtonElement>('.pause-btn')!;
    stop(pause);
    pause.addEventListener('click', () => this.onPause?.());
    const sb = root.querySelector<HTMLButtonElement>('.sandbox-btn')!;
    stop(sb);
    sb.addEventListener('click', () => this.onSandbox?.());

    if (this.touch) {
      const pad = document.createElement('div');
      pad.className = 'touch-pad';
      pad.innerHTML = `<button class="action-btn" hidden></button><button class="weapon-btn" aria-label="Switch weapon">${ICONS.sword}</button><button class="jump-btn">JUMP</button><button class="dash-btn">DASH</button>`;
      root.appendChild(pad);
      this.actionBtn = pad.querySelector('.action-btn');
      this.actionBtn!.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.onAction?.();
      });
      const jumpBtn = pad.querySelector<HTMLButtonElement>('.jump-btn')!;
      jumpBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.onJump?.();
      });
      this.dashBtn = pad.querySelector('.dash-btn');
      this.weaponBtn = pad.querySelector('.weapon-btn');
      this.dashBtn!.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.onDash?.();
      });
      this.weaponBtn!.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.onCycleWeapon?.();
      });
    }
  }

  dismissIntro() {
    this.hint.style.opacity = '0';
    setTimeout(() => (this.banner.style.opacity = '0'), 1500);
  }

  setHearts(halves: number, maxHalves: number) {
    const key = `${halves}/${maxHalves}`;
    if (key === this.lastHearts) return;
    const lost = this.lastHearts && halves < Number(this.lastHearts.split('/')[0]);
    this.lastHearts = key;
    let html = '';
    for (let i = 0; i < maxHalves / 2; i++) {
      const v = Math.max(0, Math.min(2, halves - i * 2)) as 0 | 1 | 2;
      html += heartSvg(v);
    }
    this.heartsEl.innerHTML = html;
    if (lost) {
      this.heartsEl.classList.remove('shake');
      void this.heartsEl.offsetWidth;
      this.heartsEl.classList.add('shake');
    }
  }

  setWeapon(w: WeaponId, arrows: number, quiverMax: number, carrying = false, aiming = false) {
    for (const [k, el] of Object.entries(this.slots)) el.classList.toggle('on', k === w);
    const name = w === 'hands' && carrying ? (aiming ? 'Aiming rock' : 'Holding rock') : WEAPON_NAMES[w];
    const nameEl = this.root.querySelector('.slot-name')!;
    if (nameEl.textContent !== name) nameEl.textContent = name;
    const handsIcon = carrying ? 'rock' : 'hand';
    if (this.slots.hands.dataset.icon !== handsIcon) {
      this.slots.hands.dataset.icon = handsIcon;
      this.slots.hands.querySelector('svg')!.outerHTML = carrying ? ROCK_ICON : ICONS.hands;
    }
    this.arrowCount.textContent = arrows === Infinity ? "∞" : String(arrows);
    this.arrowCount.classList.toggle('empty', arrows === 0);
    this.arrowCount.classList.toggle('full', arrows === quiverMax);
    if (this.weaponBtn && this.weaponBtn.dataset.w !== w) {
      this.weaponBtn.dataset.w = w;
      this.weaponBtn.innerHTML = ICONS[w];
    }
  }

  /** Touch only: a context button for rocks (LIFT / AIM / THROW). */
  setAction(label: string | null) {
    if (!this.actionBtn) return;
    this.actionBtn.hidden = !label;
    if (label && this.actionBtn.textContent !== label) this.actionBtn.textContent = label;
  }

  setDash(ready: number) {
    if (!this.dashBtn) return;
    this.dashBtn.style.setProperty('--ready', String(ready));
    this.dashBtn.classList.toggle('cooling', ready < 1);
  }

  setWave(text: string) {
    if (this.waveEl.innerHTML !== text) this.waveEl.innerHTML = text;
  }

  private bossShown = '';
  setBoss(name: string | null, frac = 0) {
    const bar = this.root.querySelector<HTMLDivElement>('.boss-bar')!;
    bar.hidden = !name;
    if (!name) return;
    if (this.bossShown !== name) {
      this.bossShown = name;
      bar.querySelector('.boss-name')!.textContent = name;
    }
    bar.querySelector<HTMLDivElement>('.boss-fill')!.style.width = `${Math.max(0, frac) * 100}%`;
  }

  /** No rocks in the dungeon, so the empty-hands slot goes away there. */
  setHandsAvailable(on: boolean) {
    this.slots.hands.hidden = !on;
  }

  /** Adventure: gold counter (bumps when it changes). */
  setGold(show: boolean, gold = 0) {
    const el = this.root.querySelector<HTMLDivElement>('.gold-hud')!;
    el.hidden = !show;
    if (!show || gold === this.lastGold) return;
    el.querySelector('b')!.textContent = String(gold);
    if (gold > this.lastGold && this.lastGold >= 0) {
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
    this.lastGold = gold;
  }

  setSandboxButton(show: boolean) {
    this.root.querySelector<HTMLButtonElement>('.sandbox-btn')!.hidden = !show;
  }

  /** Adventure: small keys and the Big Key. */
  setAdvKeys(show: boolean, small = 0, big = false) {
    const el = this.root.querySelector<HTMLDivElement>('.adv-keys')!;
    el.hidden = !show;
    if (!show) return;
    const b = el.querySelector('.sk b')!;
    if (b.textContent !== String(small)) b.textContent = String(small);
    el.querySelector<HTMLElement>('.sk')!.style.opacity = small ? '1' : '0.45';
    el.querySelector<HTMLElement>('.bk')!.hidden = !big;
  }

  /** Little map of the current region: rooms you've been in, where you are, where the boss is. */
  setMinimap(html: string | null) {
    const el = this.root.querySelector<HTMLDivElement>('.minimap')!;
    el.hidden = !html;
    if (html && el.innerHTML !== html) el.innerHTML = html;
  }

  /** Fade the screen to black (0) and back (1) for room changes. */
  setFade(k: number) {
    this.root.querySelector<HTMLDivElement>('.fade')!.style.opacity = String(k);
  }

  setKey(has: boolean) {
    const el = this.root.querySelector<HTMLDivElement>('.key-icon')!;
    if (el.hidden === !has) return;
    el.hidden = !has;
  }

  big(text: string, sub = '', ms = 1600) {
    this.bigEl.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.bigEl.classList.remove('on');
    void this.bigEl.offsetWidth;
    this.bigEl.classList.add('on');
    clearTimeout(this.bigTimer);
    this.bigTimer = window.setTimeout(() => this.bigEl.classList.remove('on'), ms);
  }

  hurtFlash() {
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  /** A damage number that floats up from a point on screen. */
  number(text: string, x: number, y: number, kind: 'hit' | 'kill' | 'heal' | 'hurt' | 'poison' | 'fire' | 'acid' = 'hit') {
    const el = document.createElement('div');
    el.className = `num ${kind}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.root.appendChild(el);
    this.numbers.push({ el, life: 0.8, x, y });
  }

  update(dt: number) {
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life -= dt;
      if (n.life <= 0) {
        n.el.remove();
        this.numbers.splice(i, 1);
        continue;
      }
      const k = 1 - n.life / 0.8;
      n.el.style.transform = `translate(-50%, calc(-50% - ${k * 46}px)) scale(${k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.3})`;
      n.el.style.opacity = String(Math.min(1, n.life * 3));
    }
  }

  showPrompt(text: string | null, x = 0, y = 0, withKey = true) {
    if (!text) {
      this.prompt.classList.remove('on');
      return;
    }
    const html = this.touch || !withKey ? text : `<kbd>E</kbd>${text}`;
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    this.prompt.style.left = `${x}px`;
    this.prompt.style.top = `${y}px`;
    this.prompt.classList.add('on');
  }

  showToast(title: string, detail = '', ms = 2600) {
    this.toast.innerHTML = `${title}${detail ? `<small>${detail}</small>` : ''}`;
    this.toast.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('on'), ms);
  }
}

/* ---------- Pause menu with settings ---------- */

export class PauseMenu {
  private el: HTMLDivElement;
  private settings: Settings;
  open = false;
  onResume: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onJump: ((wave: number) => void) | null = null;

  constructor(private onChange: (s: Settings) => void) {
    this.settings = loadSettings();
    const el = document.createElement('div');
    el.className = 'overlay pause';
    el.hidden = true;
    el.innerHTML = `
      <div class="card">
        <h2>Paused</h2>
        <div class="row"><span>Game mode</span><div class="seg" data-k="mode">
          <button data-v="adventure">Adventure</button><button data-v="arena">Arena</button><button data-v="sandbox">Sandbox</button>
        </div><p class="note">Switching modes starts a new run.</p></div>
        <div class="row"><span>Herman's shirt</span><div class="swatches" data-k="tabard">
          <button data-v="${0x2f6fd6}" style="background:#2f6fd6" aria-label="Blue"></button>
          <button data-v="${0xc8362f}" style="background:#c8362f" aria-label="Red"></button>
          <button data-v="${0x2e9e4f}" style="background:#2e9e4f" aria-label="Green"></button>
          <button data-v="${0x7b4cc4}" style="background:#7b4cc4" aria-label="Purple"></button>
          <button data-v="${0xf2a531}" style="background:#f2a531" aria-label="Orange"></button>
          <button data-v="${0x2b2b36}" style="background:#2b2b36" aria-label="Black"></button>
          <button data-v="${0xf1ece0}" style="background:#f1ece0" aria-label="White"></button>
        </div></div>
        <div class="row"><span>Herman's pants</span><div class="swatches" data-k="pants">
          <button data-v="${0x3a5a8c}" style="background:#3a5a8c" aria-label="Blue jeans"></button>
          <button data-v="${0x6b4a2e}" style="background:#6b4a2e" aria-label="Brown"></button>
          <button data-v="${0x2b2b36}" style="background:#2b2b36" aria-label="Black"></button>
          <button data-v="${0x3f6b3a}" style="background:#3f6b3a" aria-label="Green"></button>
          <button data-v="${0x8a8c96}" style="background:#8a8c96" aria-label="Grey"></button>
          <button data-v="${0xc8362f}" style="background:#c8362f" aria-label="Red"></button>
          <button data-v="${0xd9c9a3}" style="background:#d9c9a3" aria-label="Tan"></button>
        </div></div>
        <div class="row arena-only"><span>Arena map</span><div class="seg map" data-k="map">
          <button data-v="meadow">Greenmeadow</button><button data-v="dungeon">The Dungeon</button>
        </div><p class="note">Switching maps restarts the run at wave 1.</p></div>
        <div class="row"><span>Camera angle</span><div class="seg" data-k="tilt">
          <button data-v="40">40°</button><button data-v="45">45°</button><button data-v="50">50°</button><button data-v="60">60°</button><button data-v="70">70°</button>
        </div></div>
        <div class="row"><span>Time of day</span><div class="seg" data-k="time">
          <button data-v="morning">Morning</button><button data-v="noon">Noon</button><button data-v="night">Night</button>
        </div><p class="note time-note" hidden>The dungeon is always dark and torch-lit.</p></div>
        <div class="row"><span>Ink outlines</span><div class="seg" data-k="outlines">
          <button data-v="true">On</button><button data-v="false">Off</button>
        </div></div>
        <div class="row"><span>Glow effects</span><div class="seg" data-k="glow">
          <button data-v="true">On</button><button data-v="false">Off</button>
        </div></div>
        <div class="row"><span>Sound effects</span><div class="seg" data-k="sound">
          <button data-v="true">On</button><button data-v="false">Off</button>
        </div></div>
        <div class="row"><span>Your power-ups this run</span><div class="owned-wrap"></div></div>
        <div class="row adventure-only"><span>Saved progress</span><p class="note save-note"></p><button class="btn secondary erase-btn" type="button">Erase saved progress</button></div>
        <div class="row arena-only"><span>Practice: jump to a wave</span><div class="seg jump">
          <button data-w="1">1 Slimes</button><button data-w="10">10 Slime boss</button>
          <button data-w="11">11 Skeletons</button><button data-w="20">20 Bone King</button>
          <button data-w="21">21 Ogres</button><button data-w="30">30 Ogre King</button>
        </div><p class="note">Jumping restarts the run, so power-ups reset.</p></div>
        <div class="row controls"><span>Controls</span>
          <dl>
            <dt>Walk</dt><dd>WASD / arrows · drag on touch</dd>
            <dt>Dash</dt><dd>Space · DASH button</dd>
            <dt>Jump</dt><dd>Shift · JUMP button. Hop over rocks, bushes, signs, chests and monsters</dd>
            <dt>Water</dt><dd>Wade through rivers and ponds (slower)</dd>
            <dt>Shops</dt><dd>Walk up to Bob, Jerry or the Training Yard board and press E (or tap)</dd>
            <dt>Switch weapon</dt><dd>1 2 3 4 or Q · weapon button</dd>
            <dt>Rocks</dt><dd>Pick Empty hands (4). Walk to a rock, press E to lift it, E again to aim. WASD moves the gold circle. E throws. On touch: LIFT, AIM, THROW button.</dd>
            <dt>Attack</dt><dd>Automatic. Sword swings while walking. Boomerang and bow fire when you stop.</dd>
          </dl>
        </div>
        <div class="actions">
          <button class="btn secondary" data-a="restart">Restart</button>
          <button class="btn" data-a="resume">Resume</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.querySelectorAll<HTMLElement>('[data-k]').forEach((group) => {
      const key = group.dataset.k as keyof Settings;
      group.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.addEventListener('click', () => {
          const raw = b.dataset.v!;
          const cur = this.settings as unknown as Record<string, unknown>;
          cur[key] = key === 'tabard' || key === 'pants' || key === 'tilt' ? Number(raw) : key === 'time' || key === 'map' || key === 'mode' ? raw : raw === 'true';
          this.sync();
        });
      });
    });
    el.querySelector('[data-a=resume]')!.addEventListener('click', () => this.onResume?.());
    el.querySelectorAll<HTMLButtonElement>('.jump button').forEach((b) =>
      b.addEventListener('click', () => this.onJump?.(Number(b.dataset.w))));
    el.querySelector('[data-a=restart]')!.addEventListener('click', () => this.onRestart?.());
    const erase = el.querySelector<HTMLButtonElement>('.erase-btn')!;
    erase.addEventListener('click', () => {
      if (erase.dataset.armed === '1') {
        erase.dataset.armed = '';
        erase.textContent = 'Erase saved progress';
        this.onErase?.();
      } else {
        erase.dataset.armed = '1';
        erase.textContent = 'Tap again to erase everything';
        setTimeout(() => { erase.dataset.armed = ''; erase.textContent = 'Erase saved progress'; }, 3500);
      }
    });
    this.sync();
  }

  show(open: boolean) {
    this.open = open;
    this.el.hidden = !open;
  }

  setMode(mode: GameMode) {
    this.el.dataset.mode = mode;
  }

  /** Change one setting from code (e.g. picking a mode on the title screen). */
  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    (this.settings as Settings)[key] = value;
    this.sync();
  }

  setDungeonNote(inDungeon: boolean) {
    this.el.querySelector<HTMLElement>('.time-note')!.hidden = !inDungeon;
  }

  onErase: (() => void) | null = null;

  setSaveNote(text: string) {
    this.el.querySelector('.save-note')!.textContent = text;
  }

  setOwned(html: string) {
    this.el.querySelector('.owned-wrap')!.innerHTML = html;
  }

  private sync() {
    this.el.querySelectorAll<HTMLElement>('[data-k]').forEach((group) => {
      const key = group.dataset.k as keyof Settings;
      group.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.classList.toggle('on', String(this.settings[key]) === b.dataset.v);
      });
    });
    saveSettings(this.settings);
    this.onChange({ ...this.settings });
  }
}

/* ---------- "Herman fell" screen ---------- */

export class DeathScreen {
  private el: HTMLDivElement;
  onRetry: (() => void) | null = null;

  constructor() {
    const el = document.createElement('div');
    el.className = 'overlay death';
    el.hidden = true;
    el.innerHTML = `<div class="card"><h2>Herman fell!</h2><p class="stat"></p><div class="actions"><button class="btn" data-a="retry">Try again</button></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.querySelector('[data-a=retry]')!.addEventListener('click', () => this.onRetry?.());
    this.el = el;
  }

  show(open: boolean, wavesCleared = 0, text?: string) {
    this.el.hidden = !open;
    if (open) {
      this.el.querySelector('.stat')!.textContent = text ??
        (wavesCleared === 0 ? 'The slimes got you on the first wave.' : `You cleared ${wavesCleared} wave${wavesCleared === 1 ? '' : 's'}.`);
    }
  }

  get open() {
    return !this.el.hidden;
  }
}

/* ---------- Title screen: pick Adventure or Arena ---------- */

export class TitleScreen {
  private el: HTMLDivElement;
  onPick: ((mode: GameMode) => void) | null = null;

  constructor(lastMode: GameMode) {
    const el = document.createElement('div');
    el.className = 'overlay title';
    el.innerHTML = `
      <div class="title-inner">
        <h1>Herman's Quest</h1>
        <p class="tag">Phase 4 · Oakhollow</p>
        <div class="modes">
          <button class="mode-card" data-m="adventure">
            <b>Adventure</b>
            <span>Start in Oakhollow, explore Greenmeadow and defeat Grumbok in Ogre Keep. Your gold, upgrades and gear are saved.</span>
          </button>
          <button class="mode-card" data-m="arena">
            <b>Arena</b>
            <span>Wave after wave of monsters with a boss every 10th wave. Greenmeadow or the Dungeon.</span>
          </button>
          <button class="mode-card" data-m="sandbox">
            <b>Sandbox</b>
            <span>You're in charge. Pick how many monsters, which wave, and any power-ups you want.</span>
          </button>
        </div>
        <p class="hint-line">You can switch modes any time from the pause menu.</p>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.querySelectorAll<HTMLButtonElement>('.mode-card').forEach((b) => {
      if (b.dataset.m === lastMode) b.classList.add('last');
      b.addEventListener('click', () => {
        el.hidden = true;
        this.onPick?.(b.dataset.m as GameMode);
      });
    });
    this.el = el;
  }

  get open() {
    return !this.el.hidden;
  }
}

/* ---------- Victory screen ---------- */

export class VictoryScreen {
  private el: HTMLDivElement;
  onContinue: (() => void) | null = null;
  onNew: (() => void) | null = null;

  constructor() {
    const el = document.createElement('div');
    el.className = 'overlay victory';
    el.hidden = true;
    el.innerHTML = `<div class="card"><h2>Ogre Keep cleared!</h2><p class="stat"></p>
      <div class="actions"><button class="btn secondary" data-a="new">New adventure</button><button class="btn" data-a="go">Keep exploring</button></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.querySelector('[data-a=go]')!.addEventListener('click', () => this.onContinue?.());
    el.querySelector('[data-a=new]')!.addEventListener('click', () => this.onNew?.());
    this.el = el;
  }

  show(open: boolean, text = '') {
    this.el.hidden = !open;
    if (open) this.el.querySelector('.stat')!.textContent = text;
  }

  get open() {
    return !this.el.hidden;
  }
}

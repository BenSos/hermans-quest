import type { EnemyKind } from '../game/enemy';
import { POWERS, Owned, Rarity, rarityInfo } from '../game/powerups';
import { ACTS, waveSpec } from '../game/waves';
import { POWER_ICONS } from './powerUi';

/**
 * Sandbox controls: pick monsters and how many, jump to any wave, give Herman any power-ups.
 * Opens from the Sandbox button (or B) while playing Sandbox mode. The game waits while it's open.
 */

const INK = '#3b2716';
const slime = (c: string) => `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 32 C 5 16, 12 8, 20 8 C 28 8, 35 16, 35 32 Z" fill="${c}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="15" cy="22" r="2.6" fill="${INK}"/><circle cx="25" cy="22" r="2.6" fill="${INK}"/><path d="M11 14 C 12 12, 14 11, 16 11" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".7"/></svg>`;
const skull = (extra = '') => `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 18 C 8 9, 14 5, 20 5 C 26 5, 32 9, 32 18 C 32 23, 29 25, 28 27 L 28 33 L 12 33 L 12 27 C 11 25, 8 23, 8 18 Z" fill="#ece3cc" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="15" cy="18" r="3.4" fill="${INK}"/><circle cx="25" cy="18" r="3.4" fill="${INK}"/><path d="M16 29 L16 33 M20 29 L20 33 M24 29 L24 33" stroke="${INK}" stroke-width="2"/>${extra}</svg>`;
const ogre = (extra = '') => `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 20 C 7 10, 13 6, 20 6 C 27 6, 33 10, 33 20 C 33 30, 27 35, 20 35 C 13 35, 7 30, 7 20 Z" fill="#9bb35b" stroke="${INK}" stroke-width="2.4"/><circle cx="15" cy="18" r="2.6" fill="${INK}"/><circle cx="25" cy="18" r="2.6" fill="${INK}"/><path d="M13 27 L15 24 M27 27 L25 24" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M13 27 C 17 29, 23 29, 27 27" stroke="${INK}" stroke-width="2.2" fill="none"/>${extra}</svg>`;
const CROWN = `<path d="M12 7 L14 1 L18 5 L20 0 L22 5 L26 1 L28 7 Z" fill="#f4c542" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
const BOW = `<path d="M33 8 C 39 16, 39 26, 33 34" stroke="#8a5530" stroke-width="2.6" fill="none"/>`;

export const SANDBOX_MONSTERS: { kind: EnemyKind; name: string; icon: string; max: number; boss?: boolean }[] = [
  { kind: 'green', name: 'Green Slime', icon: slime('#6fd35a'), max: 30 },
  { kind: 'blue', name: 'Blue Slime', icon: slime('#4fb8e6'), max: 30 },
  { kind: 'mini', name: 'Mini Slime', icon: slime('#86e3cf'), max: 30 },
  { kind: 'skelWarrior', name: 'Skeleton', icon: skull(), max: 30 },
  { kind: 'skelArcher', name: 'Skeleton Archer', icon: skull(BOW), max: 30 },
  { kind: 'ogre', name: 'Ogre', icon: ogre(), max: 20 },
  { kind: 'kingSlime', name: ACTS[0].bossName, icon: slime('#5fcf4a').replace('</svg>', `${CROWN}</svg>`), max: 5, boss: true },
  { kind: 'skelKing', name: ACTS[1].bossName, icon: skull(CROWN), max: 5, boss: true },
  { kind: 'ogreKing', name: ACTS[2].bossName, icon: ogre(CROWN), max: 5, boss: true },
];

export interface SandboxState {
  wavesOn: boolean;
  wave: number;
  invincible: boolean;
  owned: Owned[];
  map: 'meadow' | 'dungeon';
}

export class SandboxPanel {
  private el: HTMLDivElement;
  private counts: Partial<Record<EnemyKind, number>> = { green: 5 };
  private wave = 1;
  open = false;

  onSpawn: ((counts: Partial<Record<EnemyKind, number>>) => void) | null = null;
  onClearMonsters: (() => void) | null = null;
  onStartWaves: ((wave: number) => void) | null = null;
  onStopWaves: (() => void) | null = null;
  onAddPower: ((id: string, rarity: Rarity) => void) | null = null;
  onRemovePower: ((index: number) => void) | null = null;
  onClearPowers: (() => void) | null = null;
  onInvincible: ((on: boolean) => void) | null = null;
  onHeal: (() => void) | null = null;
  onMap: ((map: 'meadow' | 'dungeon') => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(private getState: () => SandboxState) {
    const el = document.createElement('div');
    el.className = 'overlay sandbox';
    el.hidden = true;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    this.el = el;
    el.innerHTML = `
      <div class="sb-card">
        <header>
          <h2>Sandbox</h2>
          <p>Set things up, then press Play. Open this again any time with the Sandbox button or <kbd>B</kbd>.</p>
        </header>
        <section>
          <h3>Monsters</h3>
          <div class="sb-monsters">
            ${SANDBOX_MONSTERS.map((m) => `
              <div class="sb-mon${m.boss ? ' boss' : ''}" data-k="${m.kind}">
                <span class="sb-icon">${m.icon}</span>
                <span class="sb-name">${m.name}</span>
                <span class="sb-step">
                  <button data-d="-1" aria-label="Fewer">−</button><b>0</b><button data-d="1" aria-label="More">+</button>
                </span>
              </div>`).join('')}
          </div>
          <div class="sb-actions">
            <button class="sb-btn ghost" data-a="zero">Set all to 0</button>
            <button class="sb-btn ghost" data-a="clear">Remove monsters on the map</button>
            <button class="sb-btn" data-a="spawn">Spawn <span class="sb-total">0</span> monsters</button>
          </div>
        </section>
        <section>
          <h3>Waves</h3>
          <div class="sb-wave">
            <span class="sb-step wide"><button data-w="-10">−10</button><button data-w="-1">−</button><b class="sb-wnum">1</b><button data-w="1">+</button><button data-w="10">+10</button></span>
            <span class="sb-wdesc"></span>
          </div>
          <div class="sb-quick">${[1, 10, 11, 20, 21, 30, 31, 40].map((w) => `<button data-q="${w}">${w}</button>`).join('')}</div>
          <div class="sb-actions">
            <button class="sb-btn ghost" data-a="stopwaves" hidden>Stop waves</button>
            <button class="sb-btn" data-a="waves">Start at wave <span class="sb-wnum">1</span></button>
          </div>
        </section>
        <section>
          <h3>Power-ups <small>tap a rarity to add it</small></h3>
          <div class="sb-powers">
            ${POWERS.map((p) => `
              <div class="sb-pow">
                <span class="sb-picon">${POWER_ICONS[p.icon]}</span>
                <span class="sb-pname">${p.name}</span>
                <span class="sb-rars">${p.rarities.map((r) => `<button data-p="${p.id}" data-r="${r}" style="--c:${rarityInfo(r).color}" title="${p.describe(r).replace(/"/g, '&quot;')}">${rarityInfo(r).name}</button>`).join('')}</span>
              </div>`).join('')}
          </div>
          <div class="sb-owned-head"><b>Herman has</b><button class="sb-btn ghost small" data-a="clearpow">Remove all</button></div>
          <div class="sb-owned"></div>
        </section>
        <section>
          <h3>Herman and map</h3>
          <div class="sb-row"><span>Can't lose hearts</span><div class="seg" data-t="inv"><button data-v="false">Off</button><button data-v="true">On</button></div></div>
          <div class="sb-row"><span>Map</span><div class="seg" data-t="map"><button data-v="meadow">Greenmeadow</button><button data-v="dungeon">Dungeon</button></div></div>
          <div class="sb-row"><span>Hearts</span><button class="sb-btn ghost small" data-a="heal">Heal to full</button></div>
        </section>
        <footer><button class="sb-btn play" data-a="close">Play!</button></footer>
      </div>`;

    // Monster steppers
    el.querySelectorAll<HTMLDivElement>('.sb-mon').forEach((row) => {
      const kind = row.dataset.k as EnemyKind;
      const max = SANDBOX_MONSTERS.find((m) => m.kind === kind)!.max;
      row.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => {
        const n = Math.max(0, Math.min(max, (this.counts[kind] ?? 0) + Number(b.dataset.d)));
        this.counts[kind] = n;
        this.renderCounts();
      }));
    });
    // Waves
    el.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => b.addEventListener('click', () => this.setWave(this.wave + Number(b.dataset.w))));
    el.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.addEventListener('click', () => this.setWave(Number(b.dataset.q))));
    // Power-ups
    el.querySelectorAll<HTMLButtonElement>('[data-p]').forEach((b) => b.addEventListener('click', () => {
      this.onAddPower?.(b.dataset.p!, b.dataset.r as Rarity);
      this.refresh();
    }));
    el.querySelector('.sb-owned')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-i]');
      if (!b) return;
      this.onRemovePower?.(Number(b.dataset.i));
      this.refresh();
    });
    // Toggles
    el.querySelectorAll<HTMLButtonElement>('[data-t=inv] button').forEach((b) => b.addEventListener('click', () => {
      this.onInvincible?.(b.dataset.v === 'true');
      this.refresh();
    }));
    el.querySelectorAll<HTMLButtonElement>('[data-t=map] button').forEach((b) => b.addEventListener('click', () => {
      this.onMap?.(b.dataset.v as 'meadow' | 'dungeon');
      this.refresh();
    }));
    // Action buttons
    el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', () => {
      switch (b.dataset.a) {
        case 'zero': this.counts = {}; this.renderCounts(); break;
        case 'clear': this.onClearMonsters?.(); break;
        case 'spawn': if (this.total() > 0) { this.onSpawn?.({ ...this.counts }); this.onClose?.(); } break;
        case 'waves': this.onStartWaves?.(this.wave); this.onClose?.(); break;
        case 'stopwaves': this.onStopWaves?.(); this.refresh(); break;
        case 'clearpow': this.onClearPowers?.(); this.refresh(); break;
        case 'heal': this.onHeal?.(); break;
        case 'close': this.onClose?.(); break;
      }
    }));
    window.addEventListener('keydown', (e) => {
      if (this.open && (e.code === 'Escape' || e.code === 'KeyB')) {
        e.stopImmediatePropagation();
        e.preventDefault();
        this.onClose?.();
      }
    }, true);
    this.renderCounts();
    this.setWave(1);
  }

  /** Give the panel the latest game state, then show or hide it. */
  show(open: boolean) {
    this.open = open;
    this.el.hidden = !open;
    if (open) {
      const st = this.getState();
      if (st.wavesOn) this.setWave(st.wave);
      this.refresh();
      this.el.querySelector('.sb-card')!.scrollTop = 0;
    }
  }

  private total() {
    return Object.values(this.counts).reduce((a, b) => a + (b ?? 0), 0);
  }

  private renderCounts() {
    this.el.querySelectorAll<HTMLDivElement>('.sb-mon').forEach((row) => {
      const n = this.counts[row.dataset.k as EnemyKind] ?? 0;
      row.querySelector('b')!.textContent = String(n);
      row.classList.toggle('on', n > 0);
    });
    const t = this.total();
    this.el.querySelector('.sb-total')!.textContent = String(t);
    this.el.querySelector<HTMLButtonElement>('[data-a=spawn]')!.disabled = t === 0;
  }

  private setWave(w: number) {
    this.wave = Math.max(1, Math.min(60, Math.round(w)));
    this.el.querySelectorAll('.sb-wnum').forEach((n) => (n.textContent = String(this.wave)));
    const spec = waveSpec(this.wave);
    const act = Math.floor((this.wave - 1) / 10);
    const bossName = spec.boss ? (act < 3 ? ACTS[act].bossName : ACTS[(act - 3) % 3].bossName) : '';
    this.el.querySelector('.sb-wdesc')!.textContent = spec.boss
      ? `Boss wave: ${bossName}`
      : `${spec.theme}: ${spec.list.length} monsters${spec.hpMul > 1.05 ? `, ${Math.round((spec.hpMul - 1) * 100)}% tougher` : ''}`;
    this.el.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.classList.toggle('on', Number(b.dataset.q) === this.wave));
  }

  /** Redraw the parts that depend on the game: owned power-ups and the toggles. */
  refresh() {
    const st = this.getState();
    const owned = this.el.querySelector('.sb-owned')!;
    owned.innerHTML = st.owned.length
      ? st.owned.map((o, i) => {
        const r = rarityInfo(o.rarity);
        return `<button class="sb-chip" data-i="${i}" style="--c:${r.color}" title="Remove"><span class="sb-cicon">${POWER_ICONS[o.def.icon]}</span>${o.def.name} <em>${r.name}</em><i>×</i></button>`;
      }).join('')
      : '<p class="none">Nothing yet. Tap a rarity above to add a power-up.</p>';
    this.el.querySelectorAll<HTMLButtonElement>('[data-t=inv] button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(st.invincible)));
    this.el.querySelectorAll<HTMLButtonElement>('[data-t=map] button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.map));
    this.el.querySelector<HTMLButtonElement>('[data-a=stopwaves]')!.hidden = !st.wavesOn;
  }
}


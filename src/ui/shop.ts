import {
  save, UPGRADES, GEAR, GEAR_SLOTS, TIER_COLOR, TIER_NAME, level, upgradeCost, buyUpgrade, buyGear, equipGear,
  UpgradeDef, GearDef, GearSlot,
} from '../game/save';
import { POWER_ICONS } from './powerUi';
import { sfx } from '../core/sfx';

export type ShopKind = 'smith' | 'yard' | 'armor';

const INK = '#3b2716';
const S = (body: string) => `<svg viewBox="0 0 40 40" aria-hidden="true">${body}</svg>`;
export const COIN_SVG = S(`<circle cx="20" cy="20" r="14" fill="#f6c544" stroke="${INK}" stroke-width="2.6"/><circle cx="20" cy="20" r="9" fill="none" stroke="#c9952a" stroke-width="2"/><path d="M14 13 C 16 11, 18 11, 19 12" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`);
const GEAR_ICON: Record<GearSlot, string> = {
  helmet: S(`<path d="M8 26 C 8 14, 14 7, 20 7 C 26 7, 32 14, 32 26 Z" fill="#b8c0cc" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 26 L32 26 L32 30 L8 30 Z" fill="#8a929e" stroke="${INK}" stroke-width="2.2"/><path d="M19 9 L19 26 M21 9 L21 26" stroke="${INK}" stroke-width="1.6"/>`),
  armor: S(`<path d="M10 9 L16 6 C 18 9, 22 9, 24 6 L30 9 L33 17 L28 19 L28 34 L12 34 L12 19 L7 17 Z" fill="#b8c0cc" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M14 22 L26 22 M14 27 L26 27" stroke="${INK}" stroke-width="1.6"/>`),
  boots: S(`<path d="M12 6 L22 6 L22 22 C 28 23, 34 26, 34 31 L34 35 L9 35 L9 30 L12 28 Z" fill="#8a5530" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M9 31 L34 31" stroke="${INK}" stroke-width="2"/>`),
  charm: S(`<path d="M20 4 L20 12" stroke="${INK}" stroke-width="2"/><circle cx="20" cy="23" r="11" fill="#9fe0ff" stroke="${INK}" stroke-width="2.4"/><path d="M20 15 L22.5 21 L29 21 L24 25 L26 31 L20 27.5 L14 31 L16 25 L11 21 L17.5 21 Z" fill="#f4c542" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`),
};

const INFO: Record<ShopKind, { title: string; who: string; hello: string }> = {
  smith: { title: "Bob's Smithy", who: 'Bob the Blacksmith', hello: '"Bring me gold and I\'ll make every swing count, lad."' },
  yard: { title: 'Training Yard', who: 'The notice board', hello: 'Train hard. These upgrades last forever, even when you fall.' },
  armor: { title: "Jerry's Armory", who: 'Jerry the Armorer', hello: '"Good gear keeps a knight standing. Buy once, wear it every run!"' },
};

/** The shop window: buy upgrades (Bob, Training Yard) or buy and wear gear (Jerry). */
export class ShopPanel {
  private el: HTMLDivElement;
  private kind: ShopKind = 'smith';
  open = false;
  onClose: (() => void) | null = null;
  /** Something was bought or equipped: the game re-applies upgrades. */
  onChange: (() => void) | null = null;

  constructor() {
    const el = document.createElement('div');
    el.className = 'overlay shop';
    el.hidden = true;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!b || b.disabled) return;
      const id = b.dataset.id!;
      switch (b.dataset.act) {
        case 'up':
          if (buyUpgrade(id as UpgradeDef['id'])) this.bought();
          else sfx.nope();
          break;
        case 'buy':
          if (buyGear(id)) this.bought();
          else sfx.nope();
          break;
        case 'equip':
          equipGear(id, b.dataset.slot as GearSlot);
          sfx.pick();
          this.onChange?.();
          this.render();
          break;
        case 'unequip':
          equipGear(null, b.dataset.slot as GearSlot);
          sfx.pick();
          this.onChange?.();
          this.render();
          break;
        case 'close':
          this.onClose?.();
          break;
      }
    });
    window.addEventListener('keydown', (e) => {
      if (this.open && (e.code === 'Escape' || e.code === 'KeyE')) {
        e.stopImmediatePropagation();
        e.preventDefault();
        this.onClose?.();
      }
    }, true);
  }

  private bought() {
    sfx.buy();
    this.onChange?.();
    this.render();
    const card = this.el.querySelector('.shop-gold');
    card?.classList.remove('pop');
    void (card as HTMLElement | null)?.offsetWidth;
    card?.classList.add('pop');
  }

  show(open: boolean, kind?: ShopKind) {
    if (kind) this.kind = kind;
    this.open = open;
    this.el.hidden = !open;
    if (open) this.render();
  }

  private render() {
    const info = INFO[this.kind];
    const body = this.kind === 'armor' ? this.gearHtml() : this.upgradesHtml();
    this.el.innerHTML = `
      <div class="shop-card">
        <header>
          <div><h2>${info.title}</h2><p class="who">${info.who}</p></div>
          <div class="shop-gold">${COIN_SVG}<b>${save.gold}</b></div>
        </header>
        <p class="hello">${info.hello}</p>
        ${body}
        <footer><button class="sb-btn play" data-act="close">Done</button></footer>
      </div>`;
  }

  private upgradesHtml() {
    return `<div class="shop-list">${UPGRADES.filter((u) => u.shop === this.kind).map((u) => {
      const l = level(u.id);
      const cost = upgradeCost(u.id);
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
      const icon = POWER_ICONS[u.icon];
      const can = cost !== null && save.gold >= cost;
      const btn = cost === null
        ? '<button class="sb-btn ghost" disabled>Maxed out</button>'
        : `<button class="sb-btn${can ? '' : ' ghost'}" data-act="up" data-id="${u.id}" ${can ? '' : 'disabled'}>${COIN_SVG}${cost}</button>`;
      return `
        <div class="shop-item">
          <span class="shop-icon">${icon}</span>
          <div class="shop-text">
            <b>${u.name}</b>
            <span>${u.per}. Now: ${u.total(l)}${cost !== null ? ` → ${u.total(l + 1)}` : ''}</span>
            <span class="pips">${pips}</span>
          </div>
          ${btn}
        </div>`;
    }).join('')}</div>`;
  }

  private gearHtml() {
    return GEAR_SLOTS.map(({ slot, name }) => {
      const items = GEAR.filter((g) => g.slot === slot);
      return `
        <h3 class="shop-slot">${GEAR_ICON[slot]}${name}</h3>
        <div class="shop-list">${items.map((g) => this.gearItem(g)).join('')}</div>`;
    }).join('');
  }

  private gearItem(g: GearDef) {
    const owned = save.gearOwned.includes(g.id);
    const worn = save.equipped[g.slot] === g.id;
    const can = save.gold >= g.cost;
    let btn: string;
    if (worn) btn = `<button class="sb-btn ghost" data-act="unequip" data-id="${g.id}" data-slot="${g.slot}">Wearing ✓</button>`;
    else if (owned) btn = `<button class="sb-btn" data-act="equip" data-id="${g.id}" data-slot="${g.slot}">Wear</button>`;
    else btn = `<button class="sb-btn${can ? '' : ' ghost'}" data-act="buy" data-id="${g.id}" ${can ? '' : 'disabled'}>${COIN_SVG}${g.cost}</button>`;
    return `
      <div class="shop-item${worn ? ' worn' : ''}" style="--c:${TIER_COLOR[g.tier]}">
        <span class="shop-icon tier">${GEAR_ICON[g.slot]}</span>
        <div class="shop-text"><b>${g.name} <em>${TIER_NAME[g.tier]}</em></b><span>${g.desc}</span></div>
        ${btn}
      </div>`;
  }
}

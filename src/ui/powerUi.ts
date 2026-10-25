import { ICONS } from './hud';
import { Offer, Owned, PowerIcon, RARITIES, rarityInfo } from '../game/powerups';

const S = (body: string) => `<svg viewBox="0 0 40 40" aria-hidden="true">${body}</svg>`;
const INK = '#3b2716';

export const POWER_ICONS: Record<PowerIcon, string> = {
  sword: ICONS.sword,
  boomerang: ICONS.boomerang,
  bow: ICONS.bow,
  heart: S(`<path d="M20 34 C 9 26, 4 20, 4 13 C 4 8, 8 5, 12.5 5 C 16 5, 18.5 7, 20 9.5 C 21.5 7, 24 5, 27.5 5 C 32 5, 36 8, 36 13 C 36 20, 31 26, 20 34 Z" fill="#e8383d" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M10 12 C 10.5 10, 12 9, 14 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>`),
  boot: S(`<path d="M12 5 L24 5 L24 22 C 30 23, 35 26, 35 31 L35 35 L8 35 L8 30 L12 28 Z" fill="#8a5530" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 31 L35 31" stroke="${INK}" stroke-width="2"/><path d="M14 11 L22 11 M14 16 L22 16" stroke="#f4c542" stroke-width="2.2" stroke-linecap="round"/>`),
  dash: S(`<path d="M4 12 L16 12 M2 20 L14 20 M4 28 L16 28" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M18 8 L36 20 L18 32 L22 20 Z" fill="#f4c542" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`),
  poison: S(`<path d="M20 4 C 26 13, 32 19, 32 25 C 32 32, 26 36, 20 36 C 14 36, 8 32, 8 25 C 8 19, 14 13, 20 4 Z" fill="#5ccf3a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="16" cy="25" r="2.6" fill="${INK}"/><circle cx="24" cy="25" r="2.6" fill="${INK}"/><path d="M16 31 L24 31" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`),
  fire: S(`<path d="M20 3 C 22 10, 31 14, 31 24 C 31 31, 26 36, 20 36 C 14 36, 9 31, 9 24 C 9 18, 13 15, 14 10 C 17 13, 17 16, 18 18 C 20 13, 19 8, 20 3 Z" fill="#ff8a1e" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 20 C 22 24, 25 26, 25 29 C 25 32, 23 34, 20 34 C 17 34, 15 32, 15 29 C 15 26, 18 24, 20 20 Z" fill="#ffd34a"/>`),
  acid: S(`<path d="M20 6 C 25 14, 30 19, 30 25 C 30 31, 25 35, 20 35 C 15 35, 10 31, 10 25 C 10 19, 15 14, 20 6 Z" fill="#c6e83a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="17" cy="24" r="3" fill="#fff" opacity=".6"/><circle cx="31" cy="9" r="3" fill="#c6e83a" stroke="${INK}" stroke-width="1.8"/><circle cx="9" cy="12" r="2.2" fill="#c6e83a" stroke="${INK}" stroke-width="1.6"/>`),
  star: S(`<path d="M20 3 L25 15 L37 15 L27 23 L31 36 L20 28 L9 36 L13 23 L3 15 L15 15 Z" fill="#9fe0ff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`),
  wave: S(`<path d="M6 30 C 10 14, 22 6, 36 8 C 26 12, 18 20, 14 34 Z" fill="#8fd2ff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`),
  quiver: S(`<path d="M12 14 L28 14 L26 37 L14 37 Z" fill="#8a5530" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 14 L14 4 M20 14 L20 3 M24 14 L26 4" stroke="${INK}" stroke-width="2.2"/><path d="M12 6 L16 4 L14 9 Z M18 4 L22 4 L20 8 Z M24 6 L28 4 L26 9 Z" fill="#d13b33"/>`),
  feather: S(`<path d="M32 4 C 18 6, 8 18, 8 32 L10 34 C 24 34, 34 20, 32 4 Z" fill="#ff7a3a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M30 8 L6 36" stroke="${INK}" stroke-width="2"/><path d="M26 12 L18 14 M22 18 L14 19 M18 24 L11 24" stroke="#ffd34a" stroke-width="2" stroke-linecap="round"/>`),
  dragon: S(`<path d="M8 34 C 4 26, 8 20, 12 16 C 12 22, 15 24, 16 24 C 15 18, 17 12, 22 6 C 22 14, 30 16, 32 24 C 34 30, 30 36, 22 36 Z" fill="#ff8a1e" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="16" cy="30" r="4" fill="#5ccf3a"/><circle cx="25" cy="29" r="4" fill="#c6e83a"/>`),
};

/** Full-screen "choose a power-up" moment after opening a chest. */
export class PowerChooser {
  private el: HTMLDivElement;
  private onPick: ((o: Offer) => void) | null = null;
  private offers: Offer[] = [];
  open = false;

  constructor() {
    const el = document.createElement('div');
    el.className = 'overlay chooser';
    el.hidden = true;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    this.el = el;
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0 && this.offers[i]) this.pick(this.offers[i]);
    });
  }

  show(offers: Offer[], owned: Owned[], onPick: (o: Offer) => void, weights?: number[], title = 'Choose a power-up') {
    this.offers = offers;
    this.onPick = onPick;
    this.open = true;
    const odds = RARITIES.map((r, i) => ({ r, w: weights ? weights[i] : r.weight }))
      .filter((x) => x.w > 0)
      .map(({ r, w }) => `<span style="--c:${r.color}">${r.name} ${w}%</span>`).join('');
    this.el.innerHTML = `
      <div class="chooser-inner">
        <h2>${title}</h2>
        <div class="cards">
          ${offers.map((o, i) => {
            const r = rarityInfo(o.rarity);
            const have = owned.filter((x) => x.def.id === o.def.id).length;
            return `
            <button class="pcard r-${o.rarity}" style="--c:${r.color}; --i:${i}" data-i="${i}">
              <span class="ribbon">${r.name}</span>
              <span class="picon">${POWER_ICONS[o.def.icon]}</span>
              <span class="pname">${o.def.name}</span>
              <span class="pdesc">${o.def.describe(o.rarity)}</span>
              ${have ? `<span class="have">You have ${have}. This stacks.</span>` : ''}
              <span class="pkey">${i + 1}</span>
            </button>`;
          }).join('')}
        </div>
        <p class="odds">Odds for each card: ${odds}</p>
      </div>`;
    this.el.querySelectorAll<HTMLButtonElement>('.pcard').forEach((b) => {
      b.addEventListener('click', () => this.pick(this.offers[Number(b.dataset.i)]));
    });
    this.el.hidden = false;
  }

  private pick(o: Offer) {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.onPick?.(o);
  }
}

/** Small list of what you've collected this run (shown in the pause menu). */
export function ownedListHtml(owned: Owned[]): string {
  if (!owned.length) return '<p class="none">None yet. Beat a boss, grab the key and open the chest.</p>';
  return `<ul class="owned">${owned.map((o) => {
    const r = rarityInfo(o.rarity);
    return `<li style="--c:${r.color}"><span class="mini-icon">${POWER_ICONS[o.def.icon]}</span><b>${o.def.name}</b><em>${r.name}</em></li>`;
  }).join('')}</ul>`;
}

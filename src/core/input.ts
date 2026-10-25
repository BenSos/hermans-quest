/**
 * Keyboard + touch joystick. The game only asks "which way does the player want to move?"
 * so both inputs feed the same vector.
 */
export class Input {
  private keys = new Set<string>();
  private touchId: number | null = null;
  private touchOrigin = { x: 0, y: 0 };
  private touchVec = { x: 0, y: 0 };
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private readonly radius = 56;
  enabled = true;
  /** Fires once per key press (not repeat). */
  onPress: ((code: string) => void) | null = null;
  /** Used by automated tests to drive Herman without a keyboard. */
  forced: { x: number; y: number } | null = null;

  constructor(surface: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat && !this.keys.has(e.code)) this.onPress?.(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    document.body.appendChild(this.base);

    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || this.touchId !== null || !this.enabled) return;
      this.touchId = e.pointerId;
      this.touchOrigin = { x: e.clientX, y: e.clientY };
      this.touchVec = { x: 0, y: 0 };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.knob.style.transform = 'translate(-50%, -50%)';
      this.base.classList.add('on');
      surface.setPointerCapture(e.pointerId);
    });
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.touchId) return;
      let dx = e.clientX - this.touchOrigin.x;
      let dy = e.clientY - this.touchOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > this.radius) {
        dx = (dx / len) * this.radius;
        dy = (dy / len) * this.radius;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const m = Math.min(len, this.radius) / this.radius;
      this.touchVec = m < 0.18 ? { x: 0, y: 0 } : { x: (dx / this.radius), y: (dy / this.radius) };
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.touchId) return;
      this.touchId = null;
      this.touchVec = { x: 0, y: 0 };
      this.base.classList.remove('on');
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
  }

  /** Drop any held keys and joystick (used when pausing). */
  release() {
    this.keys.clear();
    this.touchId = null;
    this.touchVec = { x: 0, y: 0 };
    this.base.classList.remove('on');
  }

  /** Movement intent: x = right, y = toward the camera (down the screen). Length 0..1. */
  move(): { x: number; y: number } {
    if (this.forced) return { ...this.forced };
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (x || y) {
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l };
    }
    return { ...this.touchVec };
  }
}

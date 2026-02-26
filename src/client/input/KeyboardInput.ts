export class KeyboardInput {
  private keys = new Set<string>();
  private _attackPressed = false;
  private _dashPressed = false;
  private _barrierPressed = false;
  private _mouseX = 0;
  private _mouseY = 0;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === ' ' || e.key === 'Shift') {
        this._dashPressed = true;
        e.preventDefault();
      }
      if (e.key.toLowerCase() === 'e') {
        this._barrierPressed = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    canvas.addEventListener('mousedown', (e) => {
      this._attackPressed = true;
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
    });

    canvas.addEventListener('mousemove', (e) => {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
    });

    // Prevent context menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get dx(): number {
    let x = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    return x;
  }

  get dy(): number {
    let y = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    return y;
  }

  get mouseX() { return this._mouseX; }
  get mouseY() { return this._mouseY; }

  consumeAttack(): boolean {
    const v = this._attackPressed;
    this._attackPressed = false;
    return v;
  }

  consumeDash(): boolean {
    const v = this._dashPressed;
    this._dashPressed = false;
    return v;
  }

  consumeBarrier(): boolean {
    const v = this._barrierPressed;
    this._barrierPressed = false;
    return v;
  }
}

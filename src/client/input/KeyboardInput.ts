export class KeyboardInput {
  private keys = new Set<string>();
  private _usePressed = false;
  private _killPressed = false;
  private _reportPressed = false;
  private _mouseX = 0;
  private _mouseY = 0;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === 'e') {
        this._usePressed = true;
        e.preventDefault();
      }
      if (e.key.toLowerCase() === 'q') {
        this._killPressed = true;
        e.preventDefault();
      }
      if (e.key.toLowerCase() === 'r') {
        this._reportPressed = true;
        e.preventDefault();
      }
      // Prevent space scroll
      if (e.key === ' ') e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    canvas.addEventListener('mousemove', (e) => {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
    });

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

  /** E key — interact with task / vent */
  consumeUse(): boolean {
    const v = this._usePressed;
    this._usePressed = false;
    return v;
  }

  /** Q key — impostor kill */
  consumeKill(): boolean {
    const v = this._killPressed;
    this._killPressed = false;
    return v;
  }

  /** R key — report body */
  consumeReport(): boolean {
    const v = this._reportPressed;
    this._reportPressed = false;
    return v;
  }
}

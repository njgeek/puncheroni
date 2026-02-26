export class TouchInput {
  private _dx = 0;
  private _dy = 0;
  private _attackPressed = false;
  private _dashPressed = false;
  private _barrierPressed = false;
  private _attackAngle = 0;
  private _lastMoveAngle = 0;

  private joystickCenter = { x: 0, y: 0 };
  private joystickActive = false;
  private joystickId: number | null = null;

  private container: HTMLElement;
  private isMobile: boolean;

  constructor(container: HTMLElement) {
    this.container = container;
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (!this.isMobile) return;

    this.setupControls();
  }

  get active() { return this.isMobile; }

  private setupControls() {
    this.container.classList.remove('hidden');
    this.container.style.pointerEvents = 'auto';

    this.container.innerHTML = `
      <div id="joystick-zone" style="
        position: absolute; left: 0; bottom: 0;
        width: 50%; height: 100%;
        pointer-events: auto;
        touch-action: none;
      ">
        <div id="joystick-base" style="
          display: none; position: fixed;
          width: 150px; height: 150px;
          border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.35);
          background: rgba(255,255,255,0.08);
          transform: translate(-50%, -50%);
          box-shadow: 0 0 30px rgba(255,255,255,0.05);
          pointer-events: none;
        ">
          <div id="joystick-knob" style="
            position: absolute; width: 64px; height: 64px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255,255,255,0.7), rgba(255,255,255,0.3));
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 2px 10px rgba(0,0,0,0.4);
          "></div>
        </div>
      </div>
      <div id="action-buttons" style="
        position: absolute; right: 20px; bottom: 20px;
        pointer-events: auto;
        touch-action: none;
        padding-bottom: env(safe-area-inset-bottom, 0);
        padding-right: env(safe-area-inset-right, 0);
      ">
        <button id="btn-barrier" style="
          position: absolute; right: 90px; bottom: 110px;
          width: 60px; height: 60px; border-radius: 50%;
          background: rgba(74,158,255,0.3);
          border: 2.5px solid rgba(74,158,255,0.7);
          color: #fff; font-size: 11px; font-weight: 800;
          letter-spacing: 0.5px;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        ">WALL</button>
        <button id="btn-dash" style="
          position: absolute; right: 100px; bottom: 20px;
          width: 66px; height: 66px; border-radius: 50%;
          background: rgba(255,165,0,0.3);
          border: 2.5px solid rgba(255,165,0,0.7);
          color: #fff; font-size: 12px; font-weight: 800;
          letter-spacing: 0.5px;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        ">DASH</button>
        <button id="btn-attack" style="
          position: absolute; right: 0; bottom: 30px;
          width: 90px; height: 90px; border-radius: 50%;
          background: rgba(255,74,74,0.35);
          border: 3px solid rgba(255,74,74,0.8);
          color: #fff; font-size: 15px; font-weight: 900;
          letter-spacing: 1px;
          box-shadow: 0 0 25px rgba(255,74,74,0.2);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        ">ATK</button>
      </div>
    `;

    const joystickZone = this.container.querySelector('#joystick-zone') as HTMLElement;
    const joystickBase = this.container.querySelector('#joystick-base') as HTMLElement;
    const joystickKnob = this.container.querySelector('#joystick-knob') as HTMLElement;

    // Joystick — use position:fixed so clientX/clientY work directly
    joystickZone.addEventListener('touchstart', (e) => {
      if (this.joystickId !== null) return;
      const touch = e.changedTouches[0];
      this.joystickId = touch.identifier;
      this.joystickActive = true;
      this.joystickCenter = { x: touch.clientX, y: touch.clientY };
      joystickBase.style.display = 'block';
      joystickBase.style.left = touch.clientX + 'px';
      joystickBase.style.top = touch.clientY + 'px';
      e.preventDefault();
    }, { passive: false });

    joystickZone.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.joystickId) {
          const dx = touch.clientX - this.joystickCenter.x;
          const dy = touch.clientY - this.joystickCenter.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 60;
          const clampedDist = Math.min(dist, maxDist);
          const angle = Math.atan2(dy, dx);

          this._dx = (clampedDist / maxDist) * Math.cos(angle);
          this._dy = (clampedDist / maxDist) * Math.sin(angle);
          this._lastMoveAngle = angle;

          const knobX = Math.cos(angle) * clampedDist;
          const knobY = Math.sin(angle) * clampedDist;
          joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
        }
      }
      e.preventDefault();
    }, { passive: false });

    const endJoystick = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystickId) {
          this.joystickActive = false;
          this.joystickId = null;
          this._dx = 0;
          this._dy = 0;
          joystickBase.style.display = 'none';
          joystickKnob.style.transform = 'translate(-50%, -50%)';
        }
      }
    };

    joystickZone.addEventListener('touchend', endJoystick, { passive: false });
    joystickZone.addEventListener('touchcancel', endJoystick, { passive: false });

    // Action buttons — touchstart for zero-latency response
    const btnAttack = this.container.querySelector('#btn-attack') as HTMLElement;
    const btnDash = this.container.querySelector('#btn-dash') as HTMLElement;
    const btnBarrier = this.container.querySelector('#btn-barrier') as HTMLElement;

    const flashButton = (btn: HTMLElement) => {
      btn.style.filter = 'brightness(2)';
      btn.style.transform = 'scale(0.92)';
      setTimeout(() => {
        btn.style.filter = '';
        btn.style.transform = '';
      }, 120);
    };

    btnAttack.addEventListener('touchstart', (e) => {
      this._attackPressed = true;
      flashButton(btnAttack);
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    btnDash.addEventListener('touchstart', (e) => {
      this._dashPressed = true;
      flashButton(btnDash);
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    btnBarrier.addEventListener('touchstart', (e) => {
      this._barrierPressed = true;
      flashButton(btnBarrier);
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
  }

  get dx() { return this._dx; }
  get dy() { return this._dy; }

  get attackAngle() {
    if (this._dx !== 0 || this._dy !== 0) {
      this._lastMoveAngle = Math.atan2(this._dy, this._dx);
    }
    return this._lastMoveAngle;
  }

  set attackAngleOverride(angle: number) {
    this._attackAngle = angle;
  }

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

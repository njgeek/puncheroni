export class TouchInput {
  private _dx = 0;
  private _dy = 0;
  private _attackPressed = false;
  private _dashPressed = false;
  private _attackAngle = 0;
  private _lastMoveAngle = 0;

  private joystickCenter = { x: 0, y: 0 };
  private joystickActive = false;
  private joystickId: number | null = null;

  private container: HTMLElement;
  private isMobile: boolean;
  private cooldowns = new Map<string, number>();

  constructor(container: HTMLElement) {
    this.container = container;
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (!this.isMobile) return;

    this.setupControls();
  }

  get active() { return this.isMobile; }

  private setupControls() {
    this.container.classList.remove('hidden');

    this.container.innerHTML = `
      <div id="joystick-zone" style="
        position: fixed; left: 0; bottom: 0;
        width: 50%; height: 50%;
        pointer-events: auto;
        touch-action: none;
      ">
        <div id="joystick-idle" style="
          position: absolute; left: 50px; bottom: 50px;
          width: 100px; height: 100px;
          pointer-events: none;
        ">
          <div style="
            width: 100%; height: 100%;
            border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.04);
            display: flex; align-items: center; justify-content: center;
            flex-direction: column; gap: 2px;
          ">
            <div style="
              font-size: 18px; line-height: 1; opacity: 0.4; margin-top: -2px;
              color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.5);
            ">&#9650;</div>
            <div style="display: flex; gap: 18px; opacity: 0.4; color: #fff;">
              <span style="font-size: 18px;">&#9664;</span>
              <span style="font-size: 18px;">&#9654;</span>
            </div>
            <div style="
              color: rgba(255,255,255,0.4);
              font-size: 10px; font-weight: 700;
              letter-spacing: 1px;
              text-shadow: 0 1px 3px rgba(0,0,0,0.5);
            ">MOVE</div>
            <div style="
              font-size: 18px; line-height: 1; opacity: 0.4; margin-bottom: -2px;
              color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.5);
            ">&#9660;</div>
          </div>
        </div>
        <div id="joystick-base" style="
          display: none; position: fixed;
          width: 130px; height: 130px;
          border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.25);
          background: rgba(255,255,255,0.06);
          transform: translate(-50%, -50%);
          pointer-events: none;
        ">
          <div id="joystick-knob" style="
            position: absolute; width: 56px; height: 56px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255,255,255,0.6), rgba(255,255,255,0.2));
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          "></div>
        </div>
      </div>
      <div id="action-buttons" style="
        position: fixed; right: 16px; bottom: 16px;
        pointer-events: auto;
        touch-action: none;
        padding-bottom: env(safe-area-inset-bottom, 0);
        padding-right: env(safe-area-inset-right, 0);
      ">
        <button id="btn-dash" style="
          position: absolute; right: 92px; bottom: 12px;
          width: 62px; height: 62px; border-radius: 50%;
          background: rgba(255,165,0,0.25);
          border: 2px solid rgba(255,165,0,0.5);
          color: #fff; font-size: 11px; font-weight: 800;
          letter-spacing: 0.5px; opacity: 0.7;
          text-shadow: 0 1px 3px rgba(0,0,0,0.5);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: opacity 0.1s;
        ">DASH</button>
        <button id="btn-attack" style="
          position: absolute; right: 0; bottom: 20px;
          width: 82px; height: 82px; border-radius: 50%;
          background: rgba(255,74,74,0.3);
          border: 2.5px solid rgba(255,74,74,0.6);
          color: #fff; font-size: 14px; font-weight: 900;
          letter-spacing: 1px; opacity: 0.7;
          box-shadow: 0 0 15px rgba(255,74,74,0.15);
          text-shadow: 0 1px 3px rgba(0,0,0,0.5);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: opacity 0.1s;
        ">ATK</button>
      </div>
    `;

    const joystickZone = this.container.querySelector('#joystick-zone') as HTMLElement;
    const joystickBase = this.container.querySelector('#joystick-base') as HTMLElement;
    const joystickKnob = this.container.querySelector('#joystick-knob') as HTMLElement;
    const joystickIdle = this.container.querySelector('#joystick-idle') as HTMLElement;

    joystickZone.addEventListener('touchstart', (e) => {
      if (this.joystickId !== null) return;
      const touch = e.changedTouches[0];
      this.joystickId = touch.identifier;
      this.joystickActive = true;
      this.joystickCenter = { x: touch.clientX, y: touch.clientY };
      joystickIdle.style.display = 'none';
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
          joystickIdle.style.display = '';
        }
      }
    };

    joystickZone.addEventListener('touchend', endJoystick, { passive: false });
    joystickZone.addEventListener('touchcancel', endJoystick, { passive: false });

    // Action buttons
    const btnAttack = this.container.querySelector('#btn-attack') as HTMLElement;
    const btnDash = this.container.querySelector('#btn-dash') as HTMLElement;

    const flashButton = (btn: HTMLElement) => {
      btn.style.opacity = '0.95';
      btn.style.filter = 'brightness(1.5)';
      btn.style.transform = 'scale(0.92)';
      setTimeout(() => {
        btn.style.opacity = '0.7';
        btn.style.filter = '';
        btn.style.transform = '';
      }, 120);
    };

    btnAttack.addEventListener('touchstart', (e) => {
      if (this.isOnCooldown('attack')) return;
      this._attackPressed = true;
      flashButton(btnAttack);
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    btnDash.addEventListener('touchstart', (e) => {
      if (this.isOnCooldown('dash')) return;
      this._dashPressed = true;
      flashButton(btnDash);
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

  setCooldown(buttonId: string, durationMs: number) {
    this.cooldowns.set(buttonId, Date.now() + durationMs);

    const btnMap: Record<string, string> = {
      attack: '#btn-attack',
      dash: '#btn-dash',
    };

    const btnEl = this.container.querySelector(btnMap[buttonId]) as HTMLElement | null;
    if (btnEl) {
      btnEl.style.opacity = '0.3';
      btnEl.style.filter = 'grayscale(0.8)';
      setTimeout(() => {
        btnEl.style.opacity = '0.7';
        btnEl.style.filter = '';
      }, durationMs);
    }
  }

  private isOnCooldown(buttonId: string): boolean {
    const until = this.cooldowns.get(buttonId);
    if (!until) return false;
    return Date.now() < until;
  }

  setRole(team: string) {
    if (!this.isMobile) return;
    const btnAttack = this.container.querySelector('#btn-attack') as HTMLElement | null;
    const btnDash = this.container.querySelector('#btn-dash') as HTMLElement | null;

    if (btnAttack) {
      if (team === 'attacker') {
        btnAttack.textContent = 'KICK';
        btnAttack.style.background = 'rgba(255,74,74,0.3)';
        btnAttack.style.borderColor = 'rgba(255,74,74,0.6)';
      } else {
        btnAttack.textContent = 'PUNCH';
        btnAttack.style.background = 'rgba(74,158,255,0.3)';
        btnAttack.style.borderColor = 'rgba(74,158,255,0.6)';
      }
    }
    if (btnDash) {
      btnDash.textContent = 'DASH';
    }
  }
}

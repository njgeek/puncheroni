export class TouchInput {
  private _dx = 0;
  private _dy = 0;
  private _usePressed = false;
  private _killPressed = false;
  private _reportPressed = false;
  private _lastMoveAngle = 0;

  private joystickCenter = { x: 0, y: 0 };
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
            <div style="font-size:18px;opacity:0.4;color:#fff;">&#9650;</div>
            <div style="display:flex;gap:18px;opacity:0.4;color:#fff;">
              <span style="font-size:18px;">&#9664;</span>
              <span style="font-size:18px;">&#9654;</span>
            </div>
            <div style="color:rgba(255,255,255,0.4);font-size:10px;font-weight:700;letter-spacing:1px;">MOVE</div>
            <div style="font-size:18px;opacity:0.4;color:#fff;">&#9660;</div>
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
        <button id="btn-report" style="
          display: none;
          position: absolute; right: 186px; bottom: 12px;
          width: 68px; height: 68px; border-radius: 50%;
          background: rgba(255,140,0,0.3);
          border: 2.5px solid rgba(255,140,0,0.7);
          color: #fff; font-size: 10px; font-weight: 800;
          letter-spacing: 0.5px; opacity: 0.9;
          text-shadow: 0 1px 3px rgba(0,0,0,0.5);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        ">REPORT</button>
        <button id="btn-kill" style="
          display: none;
          position: absolute; right: 96px; bottom: 12px;
          width: 68px; height: 68px; border-radius: 50%;
          background: rgba(255,40,40,0.35);
          border: 2.5px solid rgba(255,40,40,0.7);
          color: #fff; font-size: 11px; font-weight: 900;
          letter-spacing: 1px; opacity: 0.9;
          box-shadow: 0 0 15px rgba(255,40,40,0.2);
          text-shadow: 0 1px 3px rgba(0,0,0,0.5);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        ">KILL</button>
        <button id="btn-use" style="
          position: absolute; right: 0; bottom: 20px;
          width: 82px; height: 82px; border-radius: 50%;
          background: rgba(44,200,80,0.3);
          border: 2.5px solid rgba(44,200,80,0.7);
          color: #fff; font-size: 14px; font-weight: 900;
          letter-spacing: 1px; opacity: 0.7;
          box-shadow: 0 0 15px rgba(44,200,80,0.15);
          text-shadow: 0 1px 3px rgba(0,0,0,0.5);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: opacity 0.1s;
        ">USE</button>
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
        if (touch.identifier !== this.joystickId) continue;
        const dx = touch.clientX - this.joystickCenter.x;
        const dy = touch.clientY - this.joystickCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 60;
        const clamped = Math.min(dist, maxDist);
        const angle = Math.atan2(dy, dx);
        this._dx = (clamped / maxDist) * Math.cos(angle);
        this._dy = (clamped / maxDist) * Math.sin(angle);
        this._lastMoveAngle = angle;
        const kx = Math.cos(angle) * clamped;
        const ky = Math.sin(angle) * clamped;
        joystickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      }
      e.preventDefault();
    }, { passive: false });

    const endJoystick = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystickId) {
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
    const btnUse    = this.container.querySelector('#btn-use')    as HTMLElement;
    const btnKill   = this.container.querySelector('#btn-kill')   as HTMLElement;
    const btnReport = this.container.querySelector('#btn-report') as HTMLElement;

    const flash = (btn: HTMLElement) => {
      btn.style.opacity = '0.95';
      btn.style.filter = 'brightness(1.5)';
      btn.style.transform = 'scale(0.92)';
      setTimeout(() => {
        btn.style.opacity = '';
        btn.style.filter = '';
        btn.style.transform = '';
      }, 120);
    };

    btnUse.addEventListener('touchstart', (e) => {
      this._usePressed = true;
      flash(btnUse);
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    btnKill.addEventListener('touchstart', (e) => {
      this._killPressed = true;
      flash(btnKill);
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    btnReport.addEventListener('touchstart', (e) => {
      this._reportPressed = true;
      flash(btnReport);
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

  consumeUse(): boolean    { const v = this._usePressed;    this._usePressed = false;    return v; }
  consumeKill(): boolean   { const v = this._killPressed;   this._killPressed = false;   return v; }
  consumeReport(): boolean { const v = this._reportPressed; this._reportPressed = false; return v; }

  /** Show/hide KILL button based on role. */
  setRole(role: string) {
    if (!this.isMobile) return;
    const btnKill = this.container.querySelector('#btn-kill') as HTMLElement | null;
    if (btnKill) btnKill.style.display = role === 'impostor' ? 'block' : 'none';
  }

  /** Show/hide REPORT button when near a body. */
  setReportVisible(visible: boolean) {
    const btn = this.container.querySelector('#btn-report') as HTMLElement | null;
    if (btn) btn.style.display = visible ? 'block' : 'none';
  }

  /** Gray out KILL button during cooldown. */
  setKillOnCooldown(onCooldown: boolean) {
    const btn = this.container.querySelector('#btn-kill') as HTMLElement | null;
    if (btn) {
      btn.style.opacity = onCooldown ? '0.3' : '0.9';
      btn.style.filter = onCooldown ? 'grayscale(0.8)' : '';
    }
  }
}

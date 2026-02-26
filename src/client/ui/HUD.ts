import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { ARENA_WIDTH, ARENA_HEIGHT, PUNCH_HP } from '@shared/constants';

export class HUD {
  container = new Container();
  private punchHpBar!: Graphics;
  private punchHpBarBg!: Graphics;
  private punchHpText!: Text;
  private timerText!: Text;
  private teamCountText!: Text;
  private phaseText!: Text;
  private minimapContainer!: Container;
  private minimapBg!: Graphics;
  private minimapDots!: Graphics;

  private screenWidth = 800;
  private screenHeight = 600;

  private get isMobile() {
    return this.screenWidth < 600 || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  }

  private get scale() {
    // Scale HUD elements on small screens
    if (this.screenWidth < 400) return 0.7;
    if (this.screenWidth < 600) return 0.85;
    return 1;
  }

  init(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    const s = this.scale;
    const barW = Math.min(300, screenWidth * 0.6);
    const barH = 20 * s;

    // Punch HP bar (top center)
    this.punchHpBarBg = new Graphics();
    this.punchHpBarBg.roundRect(screenWidth / 2 - barW / 2, 12, barW, barH, 6);
    this.punchHpBarBg.fill(0x222222);
    this.container.addChild(this.punchHpBarBg);

    this.punchHpBar = new Graphics();
    this.container.addChild(this.punchHpBar);

    const labelStyle = new TextStyle({
      fontSize: Math.round(13 * s),
      fontWeight: 'bold',
      fill: '#ffcc00',
      stroke: { color: '#000000', width: 3 },
    });

    this.punchHpText = new Text({ text: 'PUNCH: 100/100', style: labelStyle });
    this.punchHpText.anchor.set(0.5);
    this.punchHpText.x = screenWidth / 2;
    this.punchHpText.y = 12 + barH / 2;
    this.container.addChild(this.punchHpText);

    // Timer (top right)
    this.timerText = new Text({
      text: '1:30',
      style: new TextStyle({
        fontSize: Math.round(22 * s),
        fontWeight: 'bold',
        fill: '#ffffff',
        stroke: { color: '#000000', width: 3 },
      }),
    });
    this.timerText.anchor.set(1, 0);
    this.timerText.x = screenWidth - 16;
    this.timerText.y = 12;
    this.container.addChild(this.timerText);

    // Team count (top left)
    this.teamCountText = new Text({
      text: '',
      style: new TextStyle({
        fontSize: Math.round(14 * s),
        fill: '#aabbcc',
        stroke: { color: '#000000', width: 2 },
      }),
    });
    this.teamCountText.x = 12;
    this.teamCountText.y = 12;
    this.container.addChild(this.teamCountText);

    // Phase text (below HP bar)
    this.phaseText = new Text({
      text: '',
      style: new TextStyle({
        fontSize: Math.round(16 * s),
        fontWeight: 'bold',
        fill: '#ffffff',
        stroke: { color: '#000000', width: 3 },
      }),
    });
    this.phaseText.anchor.set(0.5);
    this.phaseText.x = screenWidth / 2;
    this.phaseText.y = 12 + barH + 14;
    this.container.addChild(this.phaseText);

    // Minimap (top-left below team count on mobile, bottom-right on desktop)
    const mmSize = this.isMobile ? 70 : 100;
    this.minimapContainer = new Container();
    this.positionMinimap(mmSize);

    this.minimapBg = new Graphics();
    this.minimapBg.roundRect(0, 0, mmSize, mmSize, 4);
    this.minimapBg.fill({ color: 0x000000, alpha: 0.5 });
    this.minimapBg.roundRect(0, 0, mmSize, mmSize, 4);
    this.minimapBg.stroke({ width: 1, color: 0x555555 });
    this.minimapContainer.addChild(this.minimapBg);

    this.minimapDots = new Graphics();
    this.minimapContainer.addChild(this.minimapDots);

    this.container.addChild(this.minimapContainer);
  }

  private positionMinimap(size: number) {
    if (this.isMobile) {
      // Top-left, below team count, to avoid overlapping right-side action buttons
      this.minimapContainer.x = 10;
      this.minimapContainer.y = 34;
    } else {
      this.minimapContainer.x = this.screenWidth - size - 10;
      this.minimapContainer.y = this.screenHeight - size - 10;
    }
  }

  resize(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    const s = this.scale;
    const barW = Math.min(300, screenWidth * 0.6);
    const barH = 20 * s;

    this.punchHpBarBg.clear();
    this.punchHpBarBg.roundRect(screenWidth / 2 - barW / 2, 12, barW, barH, 6);
    this.punchHpBarBg.fill(0x222222);

    this.punchHpText.x = screenWidth / 2;
    this.punchHpText.y = 12 + barH / 2;
    this.timerText.x = screenWidth - 16;
    this.phaseText.x = screenWidth / 2;
    this.phaseText.y = 12 + barH + 14;

    const mmSize = this.isMobile ? 70 : 100;
    this.positionMinimap(mmSize);
  }

  update(
    punchHp: number,
    punchMaxHp: number,
    roundTimer: number,
    defenders: number,
    attackers: number,
    phase: string,
    players: Array<{ x: number; y: number; team: string; alive: boolean }>,
    punchIsKidnapped: boolean = false,
    carriedBy: string = '',
  ) {
    const s = this.scale;
    const barW = Math.min(300, this.screenWidth * 0.6);
    const barH = 20 * s;

    // Punch status bar
    const ratio = Math.max(0, punchHp / punchMaxHp);
    const innerBarW = (barW - 4) * ratio;
    const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xccaa22 : 0xcc3333;
    this.punchHpBar.clear();
    this.punchHpBar.roundRect(this.screenWidth / 2 - barW / 2 + 2, 14, innerBarW, barH - 4, 5);
    this.punchHpBar.fill(color);

    if (punchIsKidnapped && carriedBy) {
      this.punchHpText.text = 'PUNCH KIDNAPPED!';
      this.punchHpText.style.fill = '#ff4444';
    } else if (punchIsKidnapped && !carriedBy) {
      this.punchHpText.text = 'PUNCH DROPPED — RESCUE HIM!';
      this.punchHpText.style.fill = '#ffaa44';
    } else {
      this.punchHpText.text = `PUNCH: ${Math.ceil(punchHp)}/${punchMaxHp}`;
      this.punchHpText.style.fill = '#ffcc00';
    }

    // Timer
    const secs = Math.max(0, Math.ceil(roundTimer));
    const min = Math.floor(secs / 60);
    const sec = secs % 60;
    this.timerText.text = `${min}:${sec.toString().padStart(2, '0')}`;
    if (secs <= 30) {
      this.timerText.style.fill = '#ff6644';
    } else {
      this.timerText.style.fill = '#ffffff';
    }

    // Team count — shorter on mobile
    if (this.isMobile) {
      this.teamCountText.text = `D:${defenders} A:${attackers}`;
    } else {
      this.teamCountText.text = `Defenders: ${defenders}  |  Attackers: ${attackers}`;
    }

    // Phase
    if (phase === 'lobby') {
      this.phaseText.text = 'Waiting for players...';
    } else if (phase === 'results') {
      this.phaseText.text = '';
    } else if (punchIsKidnapped) {
      this.phaseText.text = '';
    } else {
      this.phaseText.text = '';
    }

    // Minimap
    const mmSize = this.isMobile ? 70 : 100;
    const mmScale = mmSize / ARENA_WIDTH;

    this.minimapDots.clear();
    // Punch center
    this.minimapDots.circle(ARENA_WIDTH / 2 * mmScale, ARENA_HEIGHT / 2 * mmScale, this.isMobile ? 2 : 3);
    this.minimapDots.fill(0xffcc00);

    for (const p of players) {
      if (!p.alive) continue;
      const mx = p.x * mmScale;
      const my = p.y * mmScale;
      const c = p.team === 'defender' ? 0x4a9eff : 0xff4a4a;
      this.minimapDots.circle(mx, my, this.isMobile ? 1.5 : 2);
      this.minimapDots.fill(c);
    }
  }
}

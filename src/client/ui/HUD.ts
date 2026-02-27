import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { ARENA_WIDTH, ARENA_HEIGHT, MAP_ROOMS, MAP_WALLS } from '@shared/constants';

export class HUD {
  container = new Container();
  private taskBarBg!: Graphics;
  private taskBar!: Graphics;
  private taskBarText!: Text;
  private timerText!: Text;
  private phaseText!: Text;
  private minimapContainer!: Container;
  private minimapBg!: Graphics;
  private minimapDots!: Graphics;

  private roleHint: Text | null = null;
  private roleHintTimer = 0;

  private screenWidth = 800;
  private screenHeight = 600;

  private get isMobile() {
    return this.screenWidth < 600 || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  }
  private get scale() {
    if (this.screenWidth < 400) return 0.7;
    if (this.screenWidth < 600) return 0.85;
    return 1;
  }

  init(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    const s = this.scale;
    const barW = Math.min(340, screenWidth * 0.6);
    const barH = 18 * s;

    // Task progress bar background (top center)
    this.taskBarBg = new Graphics();
    this.taskBarBg.roundRect(screenWidth / 2 - barW / 2, 12, barW, barH, 6);
    this.taskBarBg.fill(0x1a2030);
    this.taskBarBg.roundRect(screenWidth / 2 - barW / 2, 12, barW, barH, 6);
    this.taskBarBg.stroke({ width: 1, color: 0x2a4060, alpha: 0.8 });
    this.container.addChild(this.taskBarBg);

    this.taskBar = new Graphics();
    this.container.addChild(this.taskBar);

    this.taskBarText = new Text({
      text: 'TASKS: 0/0',
      style: new TextStyle({
        fontSize: Math.round(11 * s),
        fontWeight: 'bold',
        fill: '#aaffaa',
        stroke: { color: '#000000', width: 2 },
      }),
    });
    this.taskBarText.anchor.set(0.5);
    this.taskBarText.x = screenWidth / 2;
    this.taskBarText.y = 12 + barH / 2;
    this.container.addChild(this.taskBarText);

    // Timer (top right)
    this.timerText = new Text({
      text: '5:00',
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

    // Phase text (lobby message)
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
    this.phaseText.y = 12 + barH + 16;
    this.container.addChild(this.phaseText);

    // Minimap
    const mmSize = this.isMobile ? 70 : 100;
    this.minimapContainer = new Container();
    this.positionMinimap(mmSize);

    this.minimapBg = new Graphics();
    this.drawMinimapBg(mmSize);
    this.minimapContainer.addChild(this.minimapBg);

    this.minimapDots = new Graphics();
    this.minimapContainer.addChild(this.minimapDots);

    this.container.addChild(this.minimapContainer);
  }

  private drawMinimapBg(size: number) {
    this.minimapBg.clear();
    const s = size / ARENA_WIDTH;

    this.minimapBg.rect(0, 0, size, size);
    this.minimapBg.fill({ color: 0x0d1018, alpha: 0.9 });

    const floorColor = 0x1e2535;
    this.minimapBg.rect(40 * s, 40 * s, 260 * s, 260 * s);   this.minimapBg.fill({ color: floorColor, alpha: 1 });
    this.minimapBg.rect(900 * s, 40 * s, 260 * s, 260 * s);  this.minimapBg.fill({ color: floorColor, alpha: 1 });
    this.minimapBg.rect(40 * s, 900 * s, 260 * s, 260 * s);  this.minimapBg.fill({ color: floorColor, alpha: 1 });
    this.minimapBg.rect(900 * s, 900 * s, 260 * s, 260 * s); this.minimapBg.fill({ color: floorColor, alpha: 1 });
    this.minimapBg.rect(40 * s, 300 * s, 1120 * s, 600 * s); this.minimapBg.fill({ color: floorColor, alpha: 1 });
    this.minimapBg.rect(300 * s, 40 * s, 600 * s, 1120 * s); this.minimapBg.fill({ color: floorColor, alpha: 1 });

    for (const room of MAP_ROOMS) {
      this.minimapBg.rect(room.x * s, room.y * s, room.w * s, room.h * s);
      this.minimapBg.fill({ color: room.color, alpha: 0.6 });
    }

    for (const wall of MAP_WALLS) {
      this.minimapBg.rect(wall.x * s, wall.y * s, Math.max(2, wall.w * s), Math.max(2, wall.h * s));
      this.minimapBg.fill({ color: 0x4a6080, alpha: 0.8 });
    }

    this.minimapBg.rect(0, 0, size, size);
    this.minimapBg.stroke({ width: 1, color: 0x445566 });
  }

  private positionMinimap(size: number) {
    if (this.isMobile) {
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
    const barW = Math.min(340, screenWidth * 0.6);
    const barH = 18 * s;

    this.taskBarBg.clear();
    this.taskBarBg.roundRect(screenWidth / 2 - barW / 2, 12, barW, barH, 6);
    this.taskBarBg.fill(0x1a2030);
    this.taskBarBg.roundRect(screenWidth / 2 - barW / 2, 12, barW, barH, 6);
    this.taskBarBg.stroke({ width: 1, color: 0x2a4060, alpha: 0.8 });

    this.taskBarText.x = screenWidth / 2;
    this.taskBarText.y = 12 + barH / 2;
    this.timerText.x = screenWidth - 16;
    this.phaseText.x = screenWidth / 2;
    this.phaseText.y = 12 + barH + 16;

    const mmSize = this.isMobile ? 70 : 100;
    this.positionMinimap(mmSize);
    this.drawMinimapBg(mmSize);
  }

  update(
    tasksDone: number,
    tasksTotal: number,
    roundTimer: number,
    phase: string,
    players: Array<{ x: number; y: number; role: string; alive: boolean; isGhost: boolean }>,
    localRole: string,
  ) {
    const s = this.scale;
    const barW = Math.min(340, this.screenWidth * 0.6);
    const barH = 18 * s;

    // Task progress bar
    const ratio = tasksTotal > 0 ? Math.min(1, tasksDone / tasksTotal) : 0;
    const innerW = (barW - 4) * ratio;
    const barColor = ratio < 0.5 ? 0x44aa44 : ratio < 0.8 ? 0x88cc44 : 0x44ff88;
    this.taskBar.clear();
    if (innerW > 0) {
      this.taskBar.roundRect(
        this.screenWidth / 2 - barW / 2 + 2, 14,
        innerW, barH - 4, 4,
      );
      this.taskBar.fill(barColor);
    }
    this.taskBarText.text = tasksTotal > 0
      ? `TASKS: ${tasksDone}/${tasksTotal}`
      : 'TASKS';

    // Timer
    const secs = Math.max(0, Math.ceil(roundTimer));
    const min = Math.floor(secs / 60);
    const sec = secs % 60;
    this.timerText.text = `${min}:${sec.toString().padStart(2, '0')}`;
    this.timerText.style.fill = secs <= 30 ? '#ff6644' : '#ffffff';

    // Phase text
    this.phaseText.text = phase === 'lobby' ? 'Waiting for players...' : '';

    // Minimap dots
    const mmSize = this.isMobile ? 70 : 100;
    this.minimapDots.clear();
    for (const p of players) {
      if (p.isGhost && localRole !== 'impostor') continue; // ghosts invisible on minimap for crewmates
      const mx = (p.x / ARENA_WIDTH) * mmSize;
      const my = (p.y / ARENA_HEIGHT) * mmSize;
      const c = p.role === 'impostor'
        ? (localRole === 'impostor' ? 0xff4a4a : 0x4a9eff)
        : 0x4a9eff;
      this.minimapDots.circle(mx, my, this.isMobile ? 1.5 : 2);
      this.minimapDots.fill(c);
    }

    // Role hint fade
    if (this.roleHint && this.roleHintTimer > 0) {
      this.roleHintTimer -= 1 / 60;
      if (this.roleHintTimer <= 1) this.roleHint.alpha = Math.max(0, this.roleHintTimer);
      if (this.roleHintTimer <= 0) {
        this.container.removeChild(this.roleHint);
        this.roleHint = null;
      }
    }
  }

  showRoleHint(role: string) {
    if (this.roleHint) this.container.removeChild(this.roleHint);

    const hint = role === 'impostor'
      ? 'Kill crewmates! Avoid suspicion!'
      : 'Complete tasks! Find the impostors!';
    const color = role === 'impostor' ? '#ff8888' : '#88ffbb';

    this.roleHint = new Text({
      text: hint,
      style: new TextStyle({
        fontSize: Math.round(16 * this.scale),
        fontWeight: 'bold',
        fill: color,
        stroke: { color: '#000000', width: 3 },
      }),
    });
    this.roleHint.anchor.set(0.5);
    this.roleHint.x = this.screenWidth / 2;
    this.roleHint.y = this.screenHeight * 0.2;
    this.roleHintTimer = 5;
    this.container.addChild(this.roleHint);
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

export function showToast(text: string, color = '#ffffff') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const pill = document.createElement('div');
  pill.className = 'toast-pill';
  pill.textContent = text;
  pill.style.borderLeft = `3px solid ${color}`;
  container.appendChild(pill);
  setTimeout(() => pill.remove(), 3000);
}

export function showRoleBanner(role: string) {
  const banner = document.getElementById('role-banner');
  if (!banner) return;
  if (role === 'impostor') {
    banner.className = 'impostor';
    banner.textContent = 'IMPOSTOR';
  } else {
    banner.className = 'crewmate';
    banner.textContent = 'CREWMATE';
  }
  banner.style.display = 'block';
}

export function hideRoleBanner() {
  const el = document.getElementById('role-banner');
  if (el) el.style.display = 'none';
}

export function showRespawnTimer(_seconds: number) {
  // Not used in Among Us — ghosts don't respawn
}

export function hideRespawnTimer() {
  // no-op
}

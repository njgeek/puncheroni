import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import {
  ARENA_WIDTH, ARENA_HEIGHT, PUNCH_HP, EXTRACTION_ZONES,
  EXTRACTION_ZONE_RADIUS, MAP_WALLS, MAP_ROOMS, PUNCH_X, PUNCH_Y, PUNCH_ZONE_RADIUS,
} from '@shared/constants';

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
  private objectiveArrow!: Graphics;

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

    // Phase text
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

    // Square minimap
    const mmSize = this.isMobile ? 70 : 100;
    this.minimapContainer = new Container();
    this.positionMinimap(mmSize);

    this.minimapBg = new Graphics();
    this.drawMinimapBg(mmSize);
    this.minimapContainer.addChild(this.minimapBg);

    this.minimapDots = new Graphics();
    this.minimapContainer.addChild(this.minimapDots);

    this.container.addChild(this.minimapContainer);

    // Objective arrow
    this.objectiveArrow = new Graphics();
    this.container.addChild(this.objectiveArrow);
  }

  private drawMinimapBg(size: number) {
    this.minimapBg.clear();
    const s = size / ARENA_WIDTH;

    // Outer hull (very dark)
    this.minimapBg.rect(0, 0, size, size);
    this.minimapBg.fill({ color: 0x0d1018, alpha: 0.9 });

    // Interior walkable floor — cross shape + corner rooms
    const floorColor = 0x1e2535;
    // 4 corner rooms
    this.minimapBg.rect(40 * s, 40 * s, 260 * s, 260 * s);   this.minimapBg.fill({ color: floorColor, alpha: 1 });
    this.minimapBg.rect(900 * s, 40 * s, 260 * s, 260 * s);  this.minimapBg.fill({ color: floorColor, alpha: 1 });
    this.minimapBg.rect(40 * s, 900 * s, 260 * s, 260 * s);  this.minimapBg.fill({ color: floorColor, alpha: 1 });
    this.minimapBg.rect(900 * s, 900 * s, 260 * s, 260 * s); this.minimapBg.fill({ color: floorColor, alpha: 1 });
    // Horizontal + vertical corridors
    this.minimapBg.rect(40 * s, 300 * s, 1120 * s, 600 * s); this.minimapBg.fill({ color: floorColor, alpha: 1 });
    this.minimapBg.rect(300 * s, 40 * s, 600 * s, 1120 * s); this.minimapBg.fill({ color: floorColor, alpha: 1 });

    // Colored room floors
    for (const room of MAP_ROOMS) {
      this.minimapBg.rect(room.x * s, room.y * s, room.w * s, room.h * s);
      this.minimapBg.fill({ color: room.color, alpha: 0.6 });
    }

    // Table obstacles (tiny white rectangles)
    for (const wall of MAP_WALLS) {
      const ww = Math.max(2, wall.w * s);
      const wh = Math.max(2, wall.h * s);
      this.minimapBg.rect(wall.x * s, wall.y * s, ww, wh);
      this.minimapBg.fill({ color: 0x4a6080, alpha: 0.8 });
    }

    // Home zone center
    this.minimapBg.circle(PUNCH_X * s, PUNCH_Y * s, PUNCH_ZONE_RADIUS * s);
    this.minimapBg.fill({ color: 0x1a3355, alpha: 0.5 });
    this.minimapBg.circle(PUNCH_X * s, PUNCH_Y * s, PUNCH_ZONE_RADIUS * s);
    this.minimapBg.stroke({ width: 1, color: 0x4488aa, alpha: 0.5 });

    // Extraction zones (red dots at corridor exits)
    for (const zone of EXTRACTION_ZONES) {
      const r = Math.max(3, EXTRACTION_ZONE_RADIUS * s);
      this.minimapBg.circle(zone.x * s, zone.y * s, r);
      this.minimapBg.fill({ color: 0xff2222, alpha: 0.4 });
      this.minimapBg.circle(zone.x * s, zone.y * s, r);
      this.minimapBg.stroke({ width: 1, color: 0xff4444, alpha: 0.7 });
    }

    // Border
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
    this.drawMinimapBg(mmSize);
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

    // Punch HP bar
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
    this.timerText.style.fill = secs <= 30 ? '#ff6644' : '#ffffff';

    // Team count
    if (this.isMobile) {
      this.teamCountText.text = `Friends:${defenders} Foes:${attackers}`;
    } else {
      this.teamCountText.text = `Friends: ${defenders}  |  Foes: ${attackers}`;
    }

    // Phase text
    if (phase === 'lobby') {
      this.phaseText.text = 'Waiting for players...';
    } else {
      this.phaseText.text = '';
    }

    // Minimap (square, top-down)
    const mmSize = this.isMobile ? 70 : 100;

    this.minimapDots.clear();
    // Punch dot
    const pxMM = (ARENA_WIDTH / 2 / ARENA_WIDTH) * mmSize;
    const pyMM = (ARENA_HEIGHT / 2 / ARENA_HEIGHT) * mmSize;
    this.minimapDots.circle(pxMM, pyMM, this.isMobile ? 2 : 3);
    this.minimapDots.fill(0xffcc00);

    for (const p of players) {
      if (!p.alive) continue;
      const mx = (p.x / ARENA_WIDTH) * mmSize;
      const my = (p.y / ARENA_HEIGHT) * mmSize;
      const c = p.team === 'defender' ? 0x4a9eff : 0xff4a4a;
      this.minimapDots.circle(mx, my, this.isMobile ? 1.5 : 2);
      this.minimapDots.fill(c);
    }

    // Role hint fade
    if (this.roleHint && this.roleHintTimer > 0) {
      this.roleHintTimer -= 1 / 60;
      if (this.roleHintTimer <= 1) {
        this.roleHint.alpha = Math.max(0, this.roleHintTimer);
      }
      if (this.roleHintTimer <= 0) {
        this.container.removeChild(this.roleHint);
        this.roleHint = null;
      }
    }
  }

  updateObjectiveArrow(
    localTeam: string,
    localX: number,
    localY: number,
    punchX: number,
    punchY: number,
    punchIsKidnapped: boolean,
    isCarrying: boolean,
  ) {
    this.objectiveArrow.clear();

    let targetX: number | null = null;
    let targetY: number | null = null;
    let arrowColor = 0xffcc00;

    if (localTeam === 'attacker') {
      if (isCarrying) {
        let nearestDist = Infinity;
        for (const zone of EXTRACTION_ZONES) {
          const dx = zone.x - localX;
          const dy = zone.y - localY;
          const dist = dx * dx + dy * dy;
          if (dist < nearestDist) {
            nearestDist = dist;
            targetX = zone.x;
            targetY = zone.y;
          }
        }
        arrowColor = 0xff4444;
      } else {
        targetX = punchX;
        targetY = punchY;
        arrowColor = 0xffcc00;
      }
    } else {
      if (punchIsKidnapped) {
        targetX = punchX;
        targetY = punchY;
        arrowColor = 0x44aaff;
      }
    }

    if (targetX === null || targetY === null) return;

    const dx = targetX - localX;
    const dy = targetY - localY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 80) return;

    const angle = Math.atan2(dy, dx);
    const edgeDist = Math.min(this.screenWidth, this.screenHeight) * 0.4;
    const ax = this.screenWidth / 2 + Math.cos(angle) * edgeDist;
    const ay = this.screenHeight / 2 + Math.sin(angle) * edgeDist;

    const arrowSize = 12;
    this.objectiveArrow.moveTo(ax + Math.cos(angle) * arrowSize, ay + Math.sin(angle) * arrowSize);
    this.objectiveArrow.lineTo(
      ax + Math.cos(angle + 2.5) * arrowSize,
      ay + Math.sin(angle + 2.5) * arrowSize,
    );
    this.objectiveArrow.lineTo(
      ax + Math.cos(angle - 2.5) * arrowSize,
      ay + Math.sin(angle - 2.5) * arrowSize,
    );
    this.objectiveArrow.closePath();
    this.objectiveArrow.fill({ color: arrowColor, alpha: 0.8 });
  }

  showRoleHint(team: string) {
    if (this.roleHint) {
      this.container.removeChild(this.roleHint);
    }

    const hint = team === 'attacker'
      ? 'Kick enemies & grab Punch!'
      : 'Punch enemies & protect Punch!';
    const color = team === 'attacker' ? '#ff8888' : '#88bbff';

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

// DOM-based toast system
export function showToast(text: string, color: string = '#ffffff') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const pill = document.createElement('div');
  pill.className = 'toast-pill';
  pill.textContent = text;
  pill.style.borderLeft = `3px solid ${color}`;
  container.appendChild(pill);

  setTimeout(() => {
    pill.remove();
  }, 3000);
}

export function showRoleBanner(team: string) {
  const banner = document.getElementById('role-banner');
  if (!banner) return;
  banner.className = team === 'defender' ? 'friend' : 'foe';
  banner.textContent = team === 'defender' ? "PUNCH'S FRIEND" : "PUNCH'S FOE";
  banner.style.display = 'block';
}

export function hideRoleBanner() {
  const banner = document.getElementById('role-banner');
  if (banner) banner.style.display = 'none';
}

export function showRespawnTimer(seconds: number) {
  const overlay = document.getElementById('respawn-overlay')!;
  const text = document.getElementById('respawn-text')!;
  overlay.style.display = 'flex';
  text.textContent = `Respawning in ${Math.ceil(seconds)}...`;
}

export function hideRespawnTimer() {
  const overlay = document.getElementById('respawn-overlay')!;
  overlay.style.display = 'none';
}

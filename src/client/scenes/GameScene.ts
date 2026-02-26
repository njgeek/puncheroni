import { Application, Container, Graphics } from 'pixi.js';
import { ArenaRenderer } from '../renderer/ArenaRenderer';
import { PlayerRenderer } from '../renderer/PlayerRenderer';
import { PunchRenderer } from '../renderer/PunchRenderer';
import { ProjectileRenderer } from '../renderer/ProjectileRenderer';
import { EffectsRenderer } from '../renderer/EffectsRenderer';
import { Interpolation } from '../network/Interpolation';
import { HUD } from '../ui/HUD';
import { ARENA_WIDTH, ARENA_HEIGHT, DEFENDER_HEAL_RANGE, PUNCH_X, PUNCH_Y } from '@shared/constants';

export class GameScene {
  private world = new Container();
  private arena: ArenaRenderer;
  private playerRenderer: PlayerRenderer;
  private punchRenderer: PunchRenderer;
  private projectileRenderer: ProjectileRenderer;
  private effects: EffectsRenderer;
  private interpolation: Interpolation;
  private barrierGfx = new Container();

  hud: HUD;

  private app: Application;
  private localPlayerId = '';
  private screenWidth = 800;
  private screenHeight = 600;

  private prevBarrierIds = new Set<string>();
  private wasKnockbackActive = false;
  private prevPhase = '';
  private cameraZoom = 1;

  onHit: (() => void) | null = null;
  onKnockback: (() => void) | null = null;
  onBarrierBreak: ((x: number, y: number) => void) | null = null;
  onPhaseChange: ((phase: string) => void) | null = null;

  constructor(app: Application) {
    this.app = app;
    this.arena = new ArenaRenderer();
    this.playerRenderer = new PlayerRenderer();
    this.punchRenderer = new PunchRenderer();
    this.projectileRenderer = new ProjectileRenderer();
    this.effects = new EffectsRenderer();
    this.interpolation = new Interpolation();
    this.hud = new HUD();
  }

  init(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    this.arena.init();
    this.world.addChild(this.arena.container);
    this.world.addChild(this.barrierGfx);
    this.punchRenderer.init();
    // Buddy at center (separate from Punch so it stays when Punch is kidnapped)
    this.world.addChild(this.punchRenderer.buddyAtCenter);
    this.world.addChild(this.punchRenderer.container);
    this.world.addChild(this.playerRenderer.container);
    this.world.addChild(this.projectileRenderer.container);
    this.world.addChild(this.effects.container);

    this.app.stage.addChild(this.world);
    this.updateCameraZoom();

    this.hud.init(screenWidth, screenHeight);
    this.app.stage.addChild(this.hud.container);
  }

  setLocalPlayer(id: string) {
    this.localPlayerId = id;
  }

  resize(width: number, height: number) {
    this.screenWidth = width;
    this.screenHeight = height;
    this.hud.resize(width, height);
    this.updateCameraZoom();
  }

  private updateCameraZoom() {
    // Controls now float over game, so full screen is available — less aggressive zoom
    const minDim = Math.min(this.screenWidth, this.screenHeight);
    if (minDim < 500) {
      this.cameraZoom = 0.75;
    } else if (minDim < 700) {
      this.cameraZoom = 0.85;
    } else {
      this.cameraZoom = 1;
    }
    this.world.scale.set(this.cameraZoom);
  }

  update(state: any, dt: number) {
    if (!state) return;

    const phase = state.phase;

    if (phase !== this.prevPhase) {
      this.onPhaseChange?.(phase);
      this.prevPhase = phase;
    }

    // Camera follow local player (accounts for zoom)
    const localPlayer = state.players?.get(this.localPlayerId);
    if (localPlayer) {
      const z = this.cameraZoom;
      const targetX = -localPlayer.x * z + this.screenWidth / 2;
      const targetY = -localPlayer.y * z + this.screenHeight / 2;
      const clampedX = Math.min(0, Math.max(-ARENA_WIDTH * z + this.screenWidth, targetX));
      const clampedY = Math.min(0, Math.max(-ARENA_HEIGHT * z + this.screenHeight, targetY));
      this.world.x += (clampedX - this.world.x) * 0.1;
      this.world.y += (clampedY - this.world.y) * 0.1;
    }

    const punchIsKidnapped = state.punch ? (!state.punch.isHome) : false;

    // Update arena (extraction zones animation)
    this.arena.update(dt, punchIsKidnapped);

    // Update players
    const playerList: Array<{ x: number; y: number; team: string; alive: boolean }> = [];

    if (state.players) {
      state.players.forEach((p: any, id: string) => {
        this.interpolation.updateTarget(id, p.x, p.y);
        const pos = this.interpolation.getPosition(id);
        const x = pos?.x ?? p.x;
        const y = pos?.y ?? p.y;

        this.playerRenderer.getOrCreate(id, p.name, p.team, id === this.localPlayerId);
        this.playerRenderer.update(
          id, x, y, p.hp, p.maxHp, p.alive, p.attackAngle, p.isAttacking,
          p.isCarryingPunch, p.isCarryingPunchHome,
        );

        playerList.push({ x: p.x, y: p.y, team: p.team, alive: p.alive });

        // Heal glow for defenders near home Punch
        if (p.team === 'defender' && p.alive && state.punch?.isHome) {
          const punchX = state.punch?.x ?? PUNCH_X;
          const punchY = state.punch?.y ?? PUNCH_Y;
          const dist = Math.sqrt((p.x - punchX) ** 2 + (p.y - punchY) ** 2);
          if (dist < DEFENDER_HEAL_RANGE && Math.random() < 0.1) {
            this.effects.spawnHealGlow(punchX, punchY);
          }
        }
      });

      this.interpolation.interpolate(this.localPlayerId);
    }

    // Update Punch
    if (state.punch) {
      this.punchRenderer.update(
        state.punch.x,
        state.punch.y,
        state.punch.hp,
        state.punch.maxHp,
        state.punch.isKnockbackActive,
        state.punch.isKidnapped,
        state.punch.isHome,
        state.punch.carriedBy,
        dt,
      );

      if (state.punch.isKnockbackActive && !this.wasKnockbackActive) {
        this.onKnockback?.();
      }
      this.wasKnockbackActive = state.punch.isKnockbackActive;
    }

    // Update projectiles
    if (state.projectiles) {
      const projList: Array<{ id: string; x: number; y: number; dx: number; dy: number }> = [];
      for (const p of state.projectiles) {
        projList.push({ id: p.id, x: p.x, y: p.y, dx: p.dx, dy: p.dy });
      }
      this.projectileRenderer.update(projList);
    }

    // Update barriers
    this.renderBarriers(state.barriers);

    // Update effects
    this.effects.update(dt);

    // Update HUD
    let defenders = 0;
    let attackers = 0;
    if (state.players) {
      state.players.forEach((p: any) => {
        if (p.team === 'defender') defenders++;
        else attackers++;
      });
    }

    this.hud.update(
      state.punch?.hp ?? 100,
      state.punch?.maxHp ?? 100,
      state.roundTimer ?? 90,
      defenders,
      attackers,
      phase,
      playerList,
      punchIsKidnapped,
      state.punch?.carriedBy ?? '',
    );
  }

  private renderBarriers(barriers: any) {
    this.barrierGfx.removeChildren();
    if (!barriers) return;

    const currentIds = new Set<string>();
    for (const b of barriers) {
      currentIds.add(b.id);
      const g = new Graphics();
      g.rect(-b.width / 2, -b.height / 2, b.width, b.height);
      const hpRatio = b.hp / b.maxHp;
      const color = hpRatio > 0.5 ? 0x8b7355 : 0x6b4030;
      g.fill(color);
      g.rect(-b.width / 2, -b.height / 2, b.width, b.height);
      g.stroke({ width: 1, color: 0xaa9070 });
      g.x = b.x;
      g.y = b.y;
      g.rotation = b.angle;
      this.barrierGfx.addChild(g);
    }
    this.prevBarrierIds = currentIds;
  }

  getAttackAngle(mouseX: number, mouseY: number): number {
    const z = this.cameraZoom;
    const worldX = (mouseX - this.world.x) / z;
    const worldY = (mouseY - this.world.y) / z;
    const localPlayer = this.getLocalPlayerPos();
    if (!localPlayer) return 0;
    return Math.atan2(worldY - localPlayer.y, worldX - localPlayer.x);
  }

  private getLocalPlayerPos(): { x: number; y: number } | null {
    const pos = this.interpolation.getPosition(this.localPlayerId);
    return pos ? { x: pos.x, y: pos.y } : null;
  }
}

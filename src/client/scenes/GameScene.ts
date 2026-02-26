import { Application, Container, Graphics } from 'pixi.js';
import { ArenaRenderer } from '../renderer/ArenaRenderer';
import { PlayerRenderer } from '../renderer/PlayerRenderer';
import { PunchRenderer } from '../renderer/PunchRenderer';
import { EffectsRenderer } from '../renderer/EffectsRenderer';
import { Interpolation } from '../network/Interpolation';
import { HUD } from '../ui/HUD';
import { ARENA_WIDTH, ARENA_HEIGHT, DEFENDER_HEAL_RANGE, PUNCH_X, PUNCH_Y } from '@shared/constants';

export class GameScene {
  private world = new Container();
  private arena: ArenaRenderer;
  private playerRenderer: PlayerRenderer;
  private punchRenderer: PunchRenderer;
  private effects: EffectsRenderer;
  private interpolation: Interpolation;
  private flashOverlay!: Graphics;

  hud: HUD;

  private app: Application;
  private localPlayerId = '';
  private screenWidth = 800;
  private screenHeight = 600;

  private wasKnockbackActive = false;
  private prevPhase = '';
  private cameraZoom = 1;

  onHit: (() => void) | null = null;
  onKnockback: (() => void) | null = null;
  onPhaseChange: ((phase: string) => void) | null = null;

  constructor(app: Application) {
    this.app = app;
    this.arena = new ArenaRenderer();
    this.playerRenderer = new PlayerRenderer();
    this.punchRenderer = new PunchRenderer();
    this.effects = new EffectsRenderer();
    this.interpolation = new Interpolation();
    this.hud = new HUD();
  }

  init(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    this.arena.init();
    this.world.addChild(this.arena.container);
    this.punchRenderer.init();
    this.world.addChild(this.punchRenderer.buddyAtCenter);
    this.world.addChild(this.punchRenderer.container);
    this.world.addChild(this.playerRenderer.container);
    this.world.addChild(this.effects.container);

    this.app.stage.addChild(this.world);
    this.updateCameraZoom();

    this.hud.init(screenWidth, screenHeight);
    this.app.stage.addChild(this.hud.container);

    // Screen flash overlay
    this.flashOverlay = new Graphics();
    this.flashOverlay.rect(0, 0, screenWidth, screenHeight);
    this.flashOverlay.fill(0xff0000);
    this.flashOverlay.alpha = 0;
    this.app.stage.addChild(this.flashOverlay);
  }

  setLocalPlayer(id: string) {
    this.localPlayerId = id;
  }

  resize(width: number, height: number) {
    this.screenWidth = width;
    this.screenHeight = height;
    this.hud.resize(width, height);
    this.updateCameraZoom();

    this.flashOverlay.clear();
    this.flashOverlay.rect(0, 0, width, height);
    this.flashOverlay.fill(0xff0000);
    this.flashOverlay.alpha = 0;
  }

  private updateCameraZoom() {
    // Top-down: zoom to fit arena nicely on screen
    const minDim = Math.min(this.screenWidth, this.screenHeight);
    if (minDim < 500) {
      this.cameraZoom = 0.45;
    } else if (minDim < 700) {
      this.cameraZoom = 0.55;
    } else {
      this.cameraZoom = 0.65;
    }
    this.world.scale.set(this.cameraZoom);
  }

  flashScreen(color: number, alpha: number, duration: number) {
    this.flashOverlay.clear();
    this.flashOverlay.rect(0, 0, this.screenWidth, this.screenHeight);
    this.flashOverlay.fill(color);
    this.flashOverlay.alpha = alpha;

    const startTime = performance.now();
    const fade = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(1, elapsed / duration);
      this.flashOverlay.alpha = alpha * (1 - progress);
      if (progress < 1) {
        requestAnimationFrame(fade);
      }
    };
    requestAnimationFrame(fade);
  }

  update(state: any, dt: number) {
    if (!state) return;

    const phase = state.phase;

    if (phase !== this.prevPhase) {
      this.onPhaseChange?.(phase);
      this.prevPhase = phase;
    }

    // Camera follow local player (flat 2D)
    const localPlayer = state.players?.get(this.localPlayerId);
    if (localPlayer) {
      const z = this.cameraZoom;
      const targetX = -localPlayer.x * z + this.screenWidth / 2;
      const targetY = -localPlayer.y * z + this.screenHeight / 2;

      const arenaScreenW = ARENA_WIDTH * z;
      const arenaScreenH = ARENA_HEIGHT * z;

      // If arena fits on screen, center it; otherwise clamp so edges don't show
      let clampedX: number;
      let clampedY: number;
      if (arenaScreenW <= this.screenWidth) {
        clampedX = (this.screenWidth - arenaScreenW) / 2;
      } else {
        clampedX = Math.min(0, Math.max(-arenaScreenW + this.screenWidth, targetX));
      }
      if (arenaScreenH <= this.screenHeight) {
        clampedY = (this.screenHeight - arenaScreenH) / 2;
      } else {
        clampedY = Math.min(0, Math.max(-arenaScreenH + this.screenHeight, targetY));
      }

      this.world.x += (clampedX - this.world.x) * 0.15;
      this.world.y += (clampedY - this.world.y) * 0.15;
    }

    const punchIsKidnapped = state.punch ? (!state.punch.isHome) : false;

    // Update arena
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

        // Heal glow
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

    // Update effects
    this.effects.update(dt);

    // Depth sort players by Y
    this.playerRenderer.container.children.sort((a, b) => a.y - b.y);

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
      state.roundTimer ?? 300,
      defenders,
      attackers,
      phase,
      playerList,
      punchIsKidnapped,
      state.punch?.carriedBy ?? '',
    );
  }

  getAttackAngle(mouseX: number, mouseY: number): number {
    const z = this.cameraZoom;
    // Convert screen position to world position (flat 2D)
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

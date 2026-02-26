import { Application, Container, Graphics } from 'pixi.js';
import { ArenaRenderer } from '../renderer/ArenaRenderer';
import { PlayerRenderer } from '../renderer/PlayerRenderer';
import { PunchRenderer } from '../renderer/PunchRenderer';
import { ProjectileRenderer } from '../renderer/ProjectileRenderer';
import { EffectsRenderer } from '../renderer/EffectsRenderer';
import { Interpolation } from '../network/Interpolation';
import { HUD } from '../ui/HUD';
import { toIso, fromIso } from '../utils/iso';
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
  private flashOverlay!: Graphics;

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
    this.world.addChild(this.punchRenderer.buddyAtCenter);
    this.world.addChild(this.punchRenderer.container);
    this.world.addChild(this.playerRenderer.container);
    this.world.addChild(this.projectileRenderer.container);
    this.world.addChild(this.effects.container);

    this.app.stage.addChild(this.world);
    this.updateCameraZoom();

    this.hud.init(screenWidth, screenHeight);
    this.app.stage.addChild(this.hud.container);

    // Screen flash overlay (screen-space, not iso-transformed)
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

    // Resize flash overlay
    this.flashOverlay.clear();
    this.flashOverlay.rect(0, 0, width, height);
    this.flashOverlay.fill(0xff0000);
    this.flashOverlay.alpha = 0;
  }

  private updateCameraZoom() {
    // Isometric diamond is wider (~2400px) so need lower zoom to fit
    const minDim = Math.min(this.screenWidth, this.screenHeight);
    if (minDim < 500) {
      this.cameraZoom = 0.4;
    } else if (minDim < 700) {
      this.cameraZoom = 0.5;
    } else {
      this.cameraZoom = 0.6;
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

    // Camera follow local player in iso space
    const localPlayer = state.players?.get(this.localPlayerId);
    if (localPlayer) {
      const z = this.cameraZoom;
      const isoPos = toIso(localPlayer.x, localPlayer.y);
      const targetX = -isoPos.x * z + this.screenWidth / 2;
      const targetY = -isoPos.y * z + this.screenHeight / 2;

      // Clamp to iso arena bounds (diamond is ~2400 wide x ~1200 tall)
      const isoW = ARENA_WIDTH * 2; // diamond width
      const isoH = ARENA_HEIGHT;    // diamond height
      const isoMinX = -ARENA_HEIGHT; // leftmost point of diamond (toIso(0, ARENA_HEIGHT).x)
      const isoMinY = 0;            // topmost point of diamond (toIso(0, 0).y)

      const clampedX = Math.min(
        -isoMinX * z + 50,
        Math.max(-(isoMinX + isoW) * z + this.screenWidth - 50, targetX)
      );
      const clampedY = Math.min(
        -isoMinY * z + 50,
        Math.max(-(isoMinY + isoH) * z + this.screenHeight - 50, targetY)
      );

      this.world.x += (clampedX - this.world.x) * 0.1;
      this.world.y += (clampedY - this.world.y) * 0.1;
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

    // Update barriers (iso-transformed)
    this.renderBarriers(state.barriers);

    // Update effects
    this.effects.update(dt);

    // Depth sort: sort all world children that are entity containers by game-Y
    // Higher game-Y = rendered later = in front (closer to camera)
    this.depthSort(state);

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

  private depthSort(state: any) {
    // Collect sortable containers with their game-Y values
    const sortables: { container: Container; gameY: number }[] = [];

    // Player containers
    if (state.players) {
      state.players.forEach((_p: any, id: string) => {
        const gameY = this.playerRenderer.getGameY(id);
        // Individual player containers are children of playerRenderer.container
        // We sort the playerRenderer.container's children
      });
    }

    // Sort player renderer children by game-Y
    const playerChildren = this.playerRenderer.container.children;
    playerChildren.sort((a, b) => {
      return (a.y) - (b.y); // iso Y increases with game Y, so this works
    });

    // Sort major world containers: barriers, punch, players by their effective game-Y
    // Punch, buddy, players, barriers, projectiles, effects
    const punchIsoY = this.punchRenderer.container.y;
    const buddyIsoY = this.punchRenderer.buddyAtCenter.y;

    // Ensure Punch and players are depth-sorted relative to each other
    // by reordering world children
    const worldOrder: { child: Container; sortY: number }[] = [];
    for (const child of this.world.children) {
      let sortY = 0;
      if (child === this.arena.container) {
        sortY = -99999; // always behind
      } else if (child === this.barrierGfx) {
        sortY = -50000; // behind entities but above arena
      } else if (child === this.punchRenderer.buddyAtCenter) {
        sortY = buddyIsoY;
      } else if (child === this.punchRenderer.container) {
        sortY = punchIsoY;
      } else if (child === this.playerRenderer.container) {
        sortY = -40000; // Player container manages its own children sorting
      } else if (child === this.projectileRenderer.container) {
        sortY = 50000; // projectiles above most things
      } else if (child === this.effects.container) {
        sortY = 60000; // effects on top
      } else {
        sortY = (child as any).y || 0;
      }
      worldOrder.push({ child: child as Container, sortY });
    }
    worldOrder.sort((a, b) => a.sortY - b.sortY);
    for (let i = 0; i < worldOrder.length; i++) {
      this.world.setChildIndex(worldOrder[i].child, i);
    }
  }

  private renderBarriers(barriers: any) {
    this.barrierGfx.removeChildren();
    if (!barriers) return;

    const currentIds = new Set<string>();
    for (const b of barriers) {
      currentIds.add(b.id);
      const g = new Graphics();

      // Shadow
      const isoB = toIso(b.x, b.y);
      g.ellipse(0, 4, b.width * 0.5, b.height * 0.3);
      g.fill({ color: 0x000000, alpha: 0.15 });

      // Barrier body (iso-perspective rectangle)
      g.rect(-b.width / 2, -b.height / 2 - 4, b.width, b.height);
      const hpRatio = b.hp / b.maxHp;
      const color = hpRatio > 0.5 ? 0x8b7355 : 0x6b4030;
      g.fill(color);
      g.rect(-b.width / 2, -b.height / 2 - 4, b.width, b.height);
      g.stroke({ width: 1, color: 0xaa9070 });

      g.x = isoB.x;
      g.y = isoB.y;
      g.rotation = b.angle;
      this.barrierGfx.addChild(g);
    }
    this.prevBarrierIds = currentIds;
  }

  getAttackAngle(mouseX: number, mouseY: number): number {
    const z = this.cameraZoom;
    // Convert screen position to iso world position
    const isoWorldX = (mouseX - this.world.x) / z;
    const isoWorldY = (mouseY - this.world.y) / z;
    // Convert iso screen position back to game coordinates
    const gamePos = fromIso(isoWorldX, isoWorldY);
    const localPlayer = this.getLocalPlayerPos();
    if (!localPlayer) return 0;
    return Math.atan2(gamePos.y - localPlayer.y, gamePos.x - localPlayer.x);
  }

  private getLocalPlayerPos(): { x: number; y: number } | null {
    const pos = this.interpolation.getPosition(this.localPlayerId);
    return pos ? { x: pos.x, y: pos.y } : null;
  }
}

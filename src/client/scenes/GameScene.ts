import { Application, Container, Graphics } from 'pixi.js';
import { ArenaRenderer } from '../renderer/ArenaRenderer';
import { PlayerRenderer } from '../renderer/PlayerRenderer';
import { VisionRenderer } from '../renderer/VisionRenderer';
import { EffectsRenderer } from '../renderer/EffectsRenderer';
import { Interpolation } from '../network/Interpolation';
import { HUD } from '../ui/HUD';
import { ARENA_WIDTH, ARENA_HEIGHT, VISION_RADIUS, IMPOSTOR_VISION_RADIUS } from '@shared/constants';

export class GameScene {
  private world = new Container();
  private arena: ArenaRenderer;
  private playerRenderer: PlayerRenderer;
  private vision: VisionRenderer;
  private effects: EffectsRenderer;
  private interpolation: Interpolation;
  private flashOverlay!: Graphics;

  hud: HUD;

  private app: Application;
  private localPlayerId = '';
  private localRole = '';
  private localIsGhost = false;
  private screenWidth = 800;
  private screenHeight = 600;
  private prevPhase = '';
  private cameraZoom = 1;

  onPhaseChange: ((phase: string) => void) | null = null;

  constructor(app: Application) {
    this.app = app;
    this.arena = new ArenaRenderer();
    this.playerRenderer = new PlayerRenderer();
    this.vision = new VisionRenderer();
    this.effects = new EffectsRenderer();
    this.interpolation = new Interpolation();
    this.hud = new HUD();
  }

  init(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    // World layer
    this.arena.init();
    this.world.addChild(this.arena.container);
    this.world.addChild(this.playerRenderer.container);
    this.world.addChild(this.effects.container);
    this.app.stage.addChild(this.world);
    this.updateCameraZoom();

    // Vision renderer (screen space — above world, below HUD)
    this.vision.init(screenWidth, screenHeight);
    this.app.stage.addChild(this.vision.container);

    // HUD
    this.hud.init(screenWidth, screenHeight);
    this.app.stage.addChild(this.hud.container);

    // Screen flash
    this.flashOverlay = new Graphics();
    this.flashOverlay.rect(0, 0, screenWidth, screenHeight);
    this.flashOverlay.fill(0xff0000);
    this.flashOverlay.alpha = 0;
    this.app.stage.addChild(this.flashOverlay);
  }

  setLocalPlayer(id: string) { this.localPlayerId = id; }

  setLocalRole(role: string, isGhost: boolean) {
    this.localRole = role;
    this.localIsGhost = isGhost;
  }

  get isLocalGhost() { return this.localIsGhost; }
  get localRoleValue() { return this.localRole; }

  resize(width: number, height: number) {
    this.screenWidth = width;
    this.screenHeight = height;
    this.hud.resize(width, height);
    this.vision.resize(width, height);
    this.updateCameraZoom();

    this.flashOverlay.clear();
    this.flashOverlay.rect(0, 0, width, height);
    this.flashOverlay.fill(0xff0000);
    this.flashOverlay.alpha = 0;
  }

  private updateCameraZoom() {
    const minDim = Math.min(this.screenWidth, this.screenHeight);
    if (minDim < 500) this.cameraZoom = 0.45;
    else if (minDim < 700) this.cameraZoom = 0.55;
    else this.cameraZoom = 0.65;
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
      if (progress < 1) requestAnimationFrame(fade);
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

    // Camera follows local player
    const localPlayer = state.players?.get(this.localPlayerId);
    if (localPlayer) {
      const z = this.cameraZoom;
      const targetX = -localPlayer.x * z + this.screenWidth / 2;
      const targetY = -localPlayer.y * z + this.screenHeight / 2;

      const arenaW = ARENA_WIDTH * z;
      const arenaH = ARENA_HEIGHT * z;

      const clampedX = arenaW <= this.screenWidth
        ? (this.screenWidth - arenaW) / 2
        : Math.min(0, Math.max(-arenaW + this.screenWidth, targetX));
      const clampedY = arenaH <= this.screenHeight
        ? (this.screenHeight - arenaH) / 2
        : Math.min(0, Math.max(-arenaH + this.screenHeight, targetY));

      this.world.x += (clampedX - this.world.x) * 0.15;
      this.world.y += (clampedY - this.world.y) * 0.15;
    }

    // Arena
    this.arena.update(dt);

    // Players
    if (state.players) {
      state.players.forEach((p: any, id: string) => {
        this.interpolation.updateTarget(id, p.x, p.y);
        const pos = this.interpolation.getPosition(id);
        const x = pos?.x ?? p.x;
        const y = pos?.y ?? p.y;

        this.playerRenderer.getOrCreate(id, p.name, p.role, id === this.localPlayerId);
        this.playerRenderer.update(
          id, x, y, p.alive, p.isGhost, p.inVent,
          id === this.localPlayerId, dt,
        );
      });

      this.interpolation.interpolate(this.localPlayerId);
    }

    // Effects
    this.effects.update(dt);

    // Depth sort by Y
    this.playerRenderer.container.children.sort((a, b) => a.y - b.y);

    // Update HUD
    let tasksDone = 0;
    let tasksTotal = 0;
    const playerList: Array<{ x: number; y: number; role: string; alive: boolean; isGhost: boolean }> = [];
    if (state.players) {
      state.players.forEach((p: any) => {
        playerList.push({ x: p.x, y: p.y, role: p.role, alive: p.alive, isGhost: p.isGhost });
      });
    }
    tasksDone = state.tasksDone ?? 0;
    tasksTotal = state.taskTotal ?? 0;

    this.hud.update(
      tasksDone,
      tasksTotal,
      state.roundTimer ?? 300,
      phase,
      playerList,
      this.localRole,
    );

    // Fog of war — disabled for ghosts and impostors
    const fogDisabled = this.localIsGhost || this.localRole === 'impostor';
    if (localPlayer && !fogDisabled && phase === 'active') {
      const z = this.cameraZoom;
      const screenX = localPlayer.x * z + this.world.x;
      const screenY = localPlayer.y * z + this.world.y;
      const screenRadius = VISION_RADIUS * z;
      this.vision.update(screenX, screenY, screenRadius, true);
    } else {
      this.vision.update(0, 0, 0, false);
    }
  }
}

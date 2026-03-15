import { Client, type Room } from "@colyseus/sdk";
import * as pc from "playcanvas";
import {
  EXTRACTION_POINT,
  EXTRACTION_RADIUS,
  PUNCH_HOME,
  ROLE_COLORS,
  ROOM_NAME,
  SERVER_PORT,
  TOY_HOME,
  WORLD_HALF_EXTENT,
  type Role,
} from "@puncheroni/shared";

interface GameOptions {
  canvas: HTMLCanvasElement;
  connectionStatus: HTMLElement;
  phaseValue: HTMLElement;
  timerValue: HTMLElement;
  roleValue: HTMLElement;
  objectiveText: HTMLElement;
  extractionFill: HTMLElement;
  punchStressValue: HTMLElement;
  punchMoodIcon: HTMLElement;
  touchControls: HTMLElement;
}

interface SceneActor {
  root: pc.Entity;
  ring: pc.Entity;
  label?: pc.Entity;
}

type RoomState = {
  players: Map<string, PlayerSnapshot> & {
    forEach(callback: (value: PlayerSnapshot, key: string) => void): void;
  };
  punch: {
    x: number;
    y: number;
    z: number;
    stress: number;
    bondedToSessionId: string;
    mood: string;
  };
  toy: {
    x: number;
    y: number;
    z: number;
    holderSessionId: string;
  };
  phase: string;
  phaseTimerMs: number;
  winner: string;
  objectiveText: string;
  extractionProgress: number;
};

type PlayerSnapshot = {
  sessionId: string;
  name: string;
  role: Role;
  isBot: boolean;
  x: number;
  y: number;
  z: number;
  facing: number;
};

export class PunchRescueGame {
  private readonly app: pc.Application;
  private readonly options: GameOptions;
  private readonly keyboardState = new Set<string>();
  private readonly touchState = new Set<string>();
  private readonly actors = new Map<string, SceneActor>();
  private readonly cameraPivot = new pc.Vec3();
  private readonly cameraPosition = new pc.Vec3();
  private room?: Room<RoomState>;
  private client?: Client;
  private localSessionId = "";
  private localRole: Role | "pending" = "pending";
  private lastInputSignature = "";
  private lastInputSentAt = 0;
  private readonly punchActor: pc.Entity;
  private readonly toyActor: pc.Entity;
  private readonly camera: pc.Entity;
  private readonly extractionActor: pc.Entity;

  constructor(options: GameOptions) {
    this.options = options;

    this.app = new pc.Application(options.canvas, {
      graphicsDeviceOptions: {
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: false,
      },
    });

    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);

    this.camera = this.createCamera();
    this.punchActor = this.createPunchActor();
    this.toyActor = this.createToyActor();
    this.extractionActor = this.createExtractionActor();
  }

  async start(): Promise<void> {
    this.app.start();
    this.installScene();
    this.installControls();
    window.addEventListener("resize", this.handleResize);
    this.app.on("update", this.handleUpdate);
    await this.connectToRoom();
  }

  private readonly handleResize = (): void => {
    this.app.resizeCanvas();
  };

  private readonly handleUpdate = (deltaTime: number): void => {
    this.updateLocalInput(deltaTime);
    this.syncSceneFromState();
    this.updateCamera(deltaTime);
    this.animatePunch(deltaTime);
  };

  // --- Scene setup ---

  private installScene(): void {
    this.app.scene.ambientLight = new pc.Color(0.22, 0.27, 0.33);
    this.app.scene.exposure = 1.15;

    // Main directional light (sun)
    const sun = new pc.Entity("sun");
    sun.addComponent("light", {
      type: "directional",
      color: new pc.Color(1, 0.93, 0.85),
      intensity: 1.6,
      castShadows: true,
      shadowDistance: 60,
      shadowResolution: 1024,
    });
    sun.setEulerAngles(45, 32, 0);
    this.app.root.addChild(sun);

    // Fill light (cool blue from above)
    const fill = new pc.Entity("fill-light");
    fill.addComponent("light", {
      type: "omni",
      color: new pc.Color(0.33, 0.54, 0.88),
      intensity: 1.4,
      range: 50,
    });
    fill.setPosition(0, 12, 0);
    this.app.root.addChild(fill);

    // Warm accent light near extraction
    const warmLight = new pc.Entity("warm-light");
    warmLight.addComponent("light", {
      type: "omni",
      color: new pc.Color(1, 0.75, 0.4),
      intensity: 0.8,
      range: 15,
    });
    warmLight.setPosition(EXTRACTION_POINT.x, 4, EXTRACTION_POINT.z);
    this.app.root.addChild(warmLight);

    this.app.root.addChild(this.camera);
    this.app.root.addChild(this.createGround());
    this.app.root.addChild(this.createEnclosure());
    this.app.root.addChild(this.createSafehouse());
    this.app.root.addChild(this.createTrees());
    this.app.root.addChild(this.createPaths());
    this.app.root.addChild(this.createRouteLights());
    this.app.root.addChild(this.createMaze());
    this.app.root.addChild(this.createObstacles());
    this.app.root.addChild(this.extractionActor);
    this.app.root.addChild(this.punchActor);
    this.app.root.addChild(this.toyActor);
  }

  // --- Controls ---

  private installControls(): void {
    window.addEventListener("keydown", (event) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space",
        ].includes(event.key)
      ) {
        event.preventDefault();
      }
      this.keyboardState.add(event.key.toLowerCase());
    });

    window.addEventListener("keyup", (event) => {
      this.keyboardState.delete(event.key.toLowerCase());
    });

    const buttons = Array.from(
      this.options.touchControls.querySelectorAll<HTMLButtonElement>(
        "button[data-dir]"
      )
    );

    for (const button of buttons) {
      const direction = button.dataset.dir;
      if (!direction) continue;

      const activate = (): void => {
        this.touchState.add(direction);
        button.dataset.active = "true";
      };
      const deactivate = (): void => {
        this.touchState.delete(direction);
        delete button.dataset.active;
      };

      button.addEventListener("pointerdown", activate);
      button.addEventListener("pointerup", deactivate);
      button.addEventListener("pointerleave", deactivate);
      button.addEventListener("pointercancel", deactivate);
    }
  }

  // --- Networking ---

  private async connectToRoom(): Promise<void> {
    const url = this.getServerUrl();
    const searchParams = new URLSearchParams(window.location.search);
    const preferredRole =
      searchParams.get("role") === "zookeeper" ? "zookeeper" : "monkey";

    this.options.connectionStatus.textContent = `Connecting to ${url.replace("ws://", "").replace("wss://", "")}...`;

    this.client = new Client(url);
    this.room = await this.client.joinOrCreate<RoomState>(ROOM_NAME, {
      name: preferredRole === "zookeeper" ? "Keeper" : "Bandit",
      preferredRole,
    });

    this.localSessionId = this.room.sessionId;
    this.options.connectionStatus.textContent = "Connected";
  }

  private getServerUrl(): string {
    const configuredUrl = import.meta.env.VITE_SERVER_URL;
    if (configuredUrl) return configuredUrl;

    const protocol =
      window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location.hostname || "localhost";
    return `${protocol}//${hostname}:${SERVER_PORT}`;
  }

  // --- Input handling ---

  private updateLocalInput(deltaTime: number): void {
    if (!this.room) return;

    let moveX = 0;
    let moveZ = 0;

    if (
      this.keyboardState.has("a") ||
      this.keyboardState.has("arrowleft") ||
      this.touchState.has("left")
    ) {
      moveX -= 1;
    }
    if (
      this.keyboardState.has("d") ||
      this.keyboardState.has("arrowright") ||
      this.touchState.has("right")
    ) {
      moveX += 1;
    }
    if (
      this.keyboardState.has("w") ||
      this.keyboardState.has("arrowup") ||
      this.touchState.has("up")
    ) {
      moveZ -= 1;
    }
    if (
      this.keyboardState.has("s") ||
      this.keyboardState.has("arrowdown") ||
      this.touchState.has("down")
    ) {
      moveZ += 1;
    }

    const length = Math.hypot(moveX, moveZ);
    if (length > 0.001) {
      moveX /= length;
      moveZ /= length;
    }

    this.lastInputSentAt += deltaTime;
    const signature = `${moveX.toFixed(2)}:${moveZ.toFixed(2)}`;
    if (signature === this.lastInputSignature && this.lastInputSentAt < 0.1) {
      return;
    }

    this.lastInputSentAt = 0;
    this.lastInputSignature = signature;
    this.room.send("input", { moveX, moveZ });
  }

  // --- Scene sync ---

  private syncSceneFromState(): void {
    const state = this.room?.state;
    if (!state) return;

    const activeIds = new Set<string>();

    state.players.forEach((player, sessionId) => {
      activeIds.add(sessionId);

      let actor = this.actors.get(sessionId);
      if (!actor) {
        actor = this.createPlayerActor(
          player.role,
          sessionId === this.localSessionId,
          player.isBot
        );
        this.actors.set(sessionId, actor);
        this.app.root.addChild(actor.root);
      }

      actor.root.setPosition(player.x, player.y, player.z);
      actor.root.setEulerAngles(0, player.facing * pc.math.RAD_TO_DEG, 0);

      if (sessionId === this.localSessionId) {
        this.localRole = player.role;
      }
    });

    for (const [sessionId, actor] of this.actors) {
      if (activeIds.has(sessionId)) continue;
      actor.root.destroy();
      this.actors.delete(sessionId);
    }

    // Punch
    this.punchActor.setPosition(state.punch.x, state.punch.y, state.punch.z);

    // Toy
    this.toyActor.setPosition(state.toy.x, state.toy.y, state.toy.z);

    // HUD updates
    this.options.phaseValue.textContent =
      state.phase === "operation" ? "OPERATION" : "SOCIAL";
    this.options.phaseValue.parentElement!.style.borderColor =
      state.phase === "operation"
        ? "rgba(255, 87, 121, 0.6)"
        : "rgba(74, 158, 74, 0.4)";

    const totalSeconds = Math.ceil(state.phaseTimerMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.options.timerValue.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;

    this.options.roleValue.textContent =
      this.localRole === "pending"
        ? "Pending"
        : this.localRole === "zookeeper"
          ? "Zookeeper"
          : "Monkey";
    this.options.roleValue.style.color =
      this.localRole === "pending"
        ? "#888"
        : ROLE_COLORS[this.localRole];

    this.options.objectiveText.textContent = state.objectiveText;
    this.options.extractionFill.style.width = `${Math.round(state.extractionProgress * 100)}%`;

    // Punch status
    this.options.punchStressValue.textContent = String(
      Math.round(state.punch.stress)
    );
    const moodIcons: Record<string, string> = {
      calm: "\u{1F435}",
      curious: "\u{1F440}",
      nervous: "\u{1F630}",
      panicked: "\u{1F631}",
    };
    this.options.punchMoodIcon.textContent =
      moodIcons[state.punch.mood] ?? "\u{1F435}";

    // Connection status
    this.options.connectionStatus.textContent = state.winner
      ? state.winner === "monkeys"
        ? "Monkeys kidnapped Puncheroni!"
        : "Zookeepers saved Puncheroni!"
      : state.toy.holderSessionId === this.localSessionId
        ? `You have the toy! Extraction ${Math.round(state.extractionProgress * 100)}%`
        : state.punch.bondedToSessionId === this.localSessionId
          ? `Punch trusts you! Extraction ${Math.round(state.extractionProgress * 100)}%`
          : "Connected";
  }

  // --- Camera ---

  private updateCamera(deltaTime: number): void {
    const localActor = this.actors.get(this.localSessionId);
    const fallback = new pc.Vec3(PUNCH_HOME.x, PUNCH_HOME.y, PUNCH_HOME.z);
    const focus = localActor?.root.getPosition() ?? fallback;

    this.cameraPivot.lerp(
      this.cameraPivot,
      focus,
      1 - Math.exp(-deltaTime * 5)
    );

    const desired = new pc.Vec3(
      this.cameraPivot.x,
      this.cameraPivot.y + 10,
      this.cameraPivot.z + 13
    );
    this.cameraPosition.lerp(
      this.cameraPosition,
      desired,
      1 - Math.exp(-deltaTime * 5)
    );
    this.camera.setPosition(this.cameraPosition);
    this.camera.lookAt(this.cameraPivot);
  }

  // --- Punch animation ---

  private punchBobPhase = 0;

  private animatePunch(deltaTime: number): void {
    const state = this.room?.state;
    if (!state) return;

    this.punchBobPhase += deltaTime * 3;
    const bob = Math.sin(this.punchBobPhase) * 0.08;
    const stress = state.punch.stress / 100;
    const wobble = Math.sin(this.punchBobPhase * 4) * stress * 0.15;

    this.punchActor.setPosition(
      state.punch.x + wobble,
      state.punch.y + bob,
      state.punch.z
    );

    // Scale the stress color on the body
    const punchBody = this.punchActor.findByName("punch-body") as pc.Entity | null;
    if (punchBody?.model?.material) {
      const mat = punchBody.model.material as pc.StandardMaterial;
      const r = 1.0;
      const g = 0.55 - stress * 0.2;
      const b = 0.0 - stress * 0.1;
      mat.diffuse.set(r, Math.max(0, g), Math.max(0, b));
      mat.update();
    }
  }

  // --- Entity creation ---

  private createCamera(): pc.Entity {
    const camera = new pc.Entity("camera");
    camera.addComponent("camera", {
      clearColor: new pc.Color(0.04, 0.07, 0.12),
      farClip: 100,
      fov: 52,
    });
    camera.setPosition(0, 10, 14);
    return camera;
  }

  private createGround(): pc.Entity {
    const ground = new pc.Entity("ground");
    ground.addComponent("model", { type: "box" });
    ground.setLocalScale(WORLD_HALF_EXTENT * 2 + 8, 0.2, WORLD_HALF_EXTENT * 2 + 8);
    ground.setPosition(0, -0.1, 0);
    ground.model!.material = this.createMaterial("#2d4a2f");
    return ground;
  }

  private createEnclosure(): pc.Entity {
    const enclosure = new pc.Entity("enclosure");

    // Enclosure floor (different color)
    const floor = new pc.Entity("enclosure-floor");
    floor.addComponent("model", { type: "box" });
    floor.setLocalScale(10, 0.22, 9);
    floor.setPosition(0, 0, -1);
    floor.model!.material = this.createMaterial("#4a6b47");
    enclosure.addChild(floor);

    // Fence posts and bars
    const fenceMaterial = this.createMaterial("#b8c8c9");
    const corners: [number, number, number][] = [
      [-5, 2, -5.5],
      [5, 2, -5.5],
      [-5, 2, 3.5],
      [5, 2, 3.5],
    ];

    for (const [x, y, z] of corners) {
      const post = new pc.Entity("fence-post");
      post.addComponent("model", { type: "box" });
      post.setLocalScale(0.2, 4, 0.2);
      post.setPosition(x, y, z);
      post.model!.material = fenceMaterial;
      enclosure.addChild(post);
    }

    // Horizontal fence bars
    for (let i = 0; i < 3; i++) {
      const height = 1 + i * 1.2;

      // Front bars
      const frontBar = new pc.Entity("fence-bar");
      frontBar.addComponent("model", { type: "box" });
      frontBar.setLocalScale(10, 0.08, 0.08);
      frontBar.setPosition(0, height, 3.5);
      frontBar.model!.material = fenceMaterial;
      enclosure.addChild(frontBar);

      // Back bars
      const backBar = new pc.Entity("fence-bar");
      backBar.addComponent("model", { type: "box" });
      backBar.setLocalScale(10, 0.08, 0.08);
      backBar.setPosition(0, height, -5.5);
      backBar.model!.material = fenceMaterial;
      enclosure.addChild(backBar);

      // Left bars
      const leftBar = new pc.Entity("fence-bar");
      leftBar.addComponent("model", { type: "box" });
      leftBar.setLocalScale(0.08, 0.08, 9);
      leftBar.setPosition(-5, height, -1);
      leftBar.model!.material = fenceMaterial;
      enclosure.addChild(leftBar);

      // Right bars
      const rightBar = new pc.Entity("fence-bar");
      rightBar.addComponent("model", { type: "box" });
      rightBar.setLocalScale(0.08, 0.08, 9);
      rightBar.setPosition(5, height, -1);
      rightBar.model!.material = fenceMaterial;
      enclosure.addChild(rightBar);
    }

    // Vertical bars
    for (let x = -4.5; x <= 4.5; x += 1) {
      for (const z of [3.5, -5.5]) {
        const bar = new pc.Entity("vert-bar");
        bar.addComponent("model", { type: "box" });
        bar.setLocalScale(0.06, 3.5, 0.06);
        bar.setPosition(x, 1.8, z);
        bar.model!.material = fenceMaterial;
        enclosure.addChild(bar);
      }
    }
    for (let z = -5; z <= 3; z += 1) {
      for (const x of [-5, 5]) {
        const bar = new pc.Entity("vert-bar");
        bar.addComponent("model", { type: "box" });
        bar.setLocalScale(0.06, 3.5, 0.06);
        bar.setPosition(x, 1.8, z);
        bar.model!.material = fenceMaterial;
        enclosure.addChild(bar);
      }
    }

    // Zookeeper walkway
    const walkway = new pc.Entity("walkway");
    walkway.addComponent("model", { type: "box" });
    walkway.setLocalScale(10, 0.14, 2.5);
    walkway.setPosition(0, 0.1, 6);
    walkway.model!.material = this.createMaterial("#6f5b43");
    enclosure.addChild(walkway);

    return enclosure;
  }

  private createSafehouse(): pc.Entity {
    const safehouse = new pc.Entity("safehouse");

    // Main building
    const body = new pc.Entity("safehouse-body");
    body.addComponent("model", { type: "box" });
    body.setLocalScale(6, 3.5, 5);
    body.setPosition(EXTRACTION_POINT.x, 1.75, EXTRACTION_POINT.z);
    body.model!.material = this.createMaterial("#8f5236");
    safehouse.addChild(body);

    // Roof
    const roof = new pc.Entity("safehouse-roof");
    roof.addComponent("model", { type: "box" });
    roof.setLocalScale(6.8, 0.5, 5.8);
    roof.setPosition(EXTRACTION_POINT.x, 3.75, EXTRACTION_POINT.z);
    roof.model!.material = this.createMaterial("#d58d48");
    safehouse.addChild(roof);

    // Door frame
    const door = new pc.Entity("safehouse-door");
    door.addComponent("model", { type: "box" });
    door.setLocalScale(1.2, 2.4, 0.15);
    door.setPosition(EXTRACTION_POINT.x + 2, 1.2, EXTRACTION_POINT.z + 2.5);
    door.model!.material = this.createMaterial("#3d2812");
    safehouse.addChild(door);

    return safehouse;
  }

  private createTrees(): pc.Entity {
    const group = new pc.Entity("trees");
    const trunkMat = this.createMaterial("#5a3d1e");
    const leafMat = this.createMaterial("#2f6b2f");

    const positions: [number, number][] = [
      [-10, -8],
      [12, -6],
      [-8, 12],
      [15, 10],
      [-18, 0],
      [18, -4],
      [0, -14],
      [-14, -12],
      [10, 16],
      [-6, 18],
    ];

    for (const [x, z] of positions) {
      const tree = new pc.Entity("tree");

      const trunk = new pc.Entity("trunk");
      trunk.addComponent("model", { type: "cylinder" });
      trunk.setLocalScale(0.5, 3, 0.5);
      trunk.setPosition(x, 1.5, z);
      trunk.model!.material = trunkMat;
      tree.addChild(trunk);

      const canopy = new pc.Entity("canopy");
      canopy.addComponent("model", { type: "sphere" });
      const size = 2.5 + Math.random() * 1.5;
      canopy.setLocalScale(size, size * 0.8, size);
      canopy.setPosition(x, 3.5 + Math.random() * 0.5, z);
      canopy.model!.material = leafMat;
      tree.addChild(canopy);

      group.addChild(tree);
    }

    return group;
  }

  private createPaths(): pc.Entity {
    const group = new pc.Entity("paths");
    const pathMat = this.createMaterial("#7a6b54");

    // Main path from enclosure to extraction
    const mainPath = new pc.Entity("main-path");
    mainPath.addComponent("model", { type: "box" });
    mainPath.setLocalScale(2.5, 0.05, 20);
    mainPath.setPosition(-8, 0.02, 8);
    mainPath.model!.material = pathMat;
    group.addChild(mainPath);

    // Cross path
    const crossPath = new pc.Entity("cross-path");
    crossPath.addComponent("model", { type: "box" });
    crossPath.setLocalScale(20, 0.05, 2.5);
    crossPath.setPosition(0, 0.02, 6);
    crossPath.model!.material = pathMat;
    group.addChild(crossPath);

    return group;
  }

  private createRouteLights(): pc.Entity {
    const group = new pc.Entity("route-lights");
    const lampMat = this.createMaterial("#ffd089", "#ffe8b5");

    const points: [number, number, number][] = [
      [-8, 0.6, 6],
      [-4, 0.6, 8],
      [4, 0.6, 6],
      [9, 0.6, 1],
      [-12, 0.6, 12],
      [-16, 0.6, 14],
    ];

    for (const [x, y, z] of points) {
      // Lamp post
      const post = new pc.Entity("lamp-post");
      post.addComponent("model", { type: "cylinder" });
      post.setLocalScale(0.12, 2.5, 0.12);
      post.setPosition(x, 1.25, z);
      post.model!.material = this.createMaterial("#555555");
      group.addChild(post);

      // Lamp globe
      const lamp = new pc.Entity("lamp");
      lamp.addComponent("model", { type: "sphere" });
      lamp.setLocalScale(0.45, 0.45, 0.45);
      lamp.setPosition(x, 2.6, z);
      lamp.model!.material = lampMat;
      group.addChild(lamp);
    }

    return group;
  }

  // --- Maze ---

  private createMaze(): pc.Entity {
    const maze = new pc.Entity("maze");
    const hedgeMat = this.createMaterial("#1e5a1e");
    const hedgeDarkMat = this.createMaterial("#164a16");

    // Hedge wall helper: x, z, lengthX, lengthZ
    // The maze sits between the enclosure (around z=3.5..6) and extraction (x=-16, z=16)
    // Roughly in the area x: -14 to 2, z: 6 to 15
    const walls: [number, number, number, number][] = [
      // Outer boundary walls (with gaps for entry/exit)
      // Bottom edge (near enclosure) - two segments with gap in middle
      [-10, 6.5, 6, 0.5],
      [-2, 6.5, 4, 0.5],

      // Top edge (near extraction) - two segments with gap
      [-13, 14.5, 4, 0.5],
      [-5, 14.5, 6, 0.5],

      // Left edge - two segments with gap
      [-14.5, 8, 0.5, 3],
      [-14.5, 13, 0.5, 3],

      // Right edge - two segments with gap
      [1.5, 8, 0.5, 3],
      [1.5, 13, 0.5, 3],

      // Interior walls - creating multiple paths and dead ends

      // Row 1 (bottom area)
      [-11, 8.5, 3, 0.5],
      [-5, 8.5, 4, 0.5],

      // Vertical dividers in bottom section
      [-7, 7.5, 0.5, 2],
      [-3, 7.8, 0.5, 2.5],

      // Row 2 (middle area)
      [-13, 10.5, 3, 0.5],
      [-7, 10.5, 2, 0.5],
      [-2, 10.5, 3, 0.5],

      // Vertical dividers in middle section
      [-10, 9.5, 0.5, 2],
      [-4, 9.8, 0.5, 1.5],
      [0, 9.5, 0.5, 2],

      // Row 3 (upper area)
      [-12, 12.5, 2, 0.5],
      [-6, 12.5, 4, 0.5],
      [0, 12.5, 2, 0.5],

      // Vertical dividers in upper section
      [-9, 11.5, 0.5, 2],
      [-2, 11.8, 0.5, 1.5],

      // Dead end traps
      [-12.5, 9, 0.5, 1.5],
      [-1, 13, 0.5, 1.5],
      [-11, 13, 2, 0.5],
    ];

    for (const [x, z, lx, lz] of walls) {
      const wall = new pc.Entity("hedge-wall");
      wall.addComponent("model", { type: "box" });
      wall.setLocalScale(lx, 3, lz);
      wall.setPosition(x, 1.5, z);
      wall.model!.material = hedgeMat;
      maze.addChild(wall);

      // Add a slightly darker top trim for visual depth
      const trim = new pc.Entity("hedge-trim");
      trim.addComponent("model", { type: "box" });
      trim.setLocalScale(lx + 0.1, 0.3, lz + 0.1);
      trim.setPosition(x, 3.05, z);
      trim.model!.material = hedgeDarkMat;
      maze.addChild(trim);
    }

    // Add small hedge "peek holes" - thin walls with gaps
    const peekWalls: [number, number, number, number][] = [
      [-8, 9.5, 1.5, 0.3],
      [-6, 11.5, 1.5, 0.3],
      [-11, 11.5, 1, 0.3],
    ];

    const peekMat = this.createMaterial("#1a5218");
    for (const [x, z, lx, lz] of peekWalls) {
      const wall = new pc.Entity("peek-wall");
      wall.addComponent("model", { type: "box" });
      wall.setLocalScale(lx, 1.5, lz); // Only half height - can see over
      wall.setPosition(x, 0.75, z);
      wall.model!.material = peekMat;
      maze.addChild(wall);
    }

    return maze;
  }

  // --- Obstacles ---

  private createObstacles(): pc.Entity {
    const group = new pc.Entity("obstacles");

    // --- Rocks/boulders scattered around ---
    const rockMat = this.createMaterial("#808080");
    const rockDarkMat = this.createMaterial("#606060");
    const rockLightMat = this.createMaterial("#999999");

    const rocks: [number, number, number, number][] = [
      // x, z, scale, variant (0=grey, 1=dark, 2=light)
      [6, 8, 0.8, 0],
      [8, 5, 0.5, 1],
      [-3, 15, 0.6, 2],
      [3, 12, 1.0, 0],
      [-15, 5, 0.7, 1],
      [10, -3, 0.9, 2],
      [-12, -8, 0.5, 0],
      [14, 12, 0.6, 1],
      [-18, 10, 0.8, 2],
      [7, -10, 0.7, 0],
      [-5, -10, 0.4, 1],
      [16, 4, 0.55, 2],
    ];

    const rockMats = [rockMat, rockDarkMat, rockLightMat];
    for (const [x, z, scale, variant] of rocks) {
      const rock = new pc.Entity("rock");
      rock.addComponent("model", { type: "sphere" });
      rock.setLocalScale(scale * 1.2, scale * 0.7, scale);
      rock.setPosition(x, scale * 0.3, z);
      rock.model!.material = rockMats[variant];
      group.addChild(rock);
    }

    // --- Benches along paths ---
    const benchSeatMat = this.createMaterial("#8B6914");
    const benchLegMat = this.createMaterial("#444444");

    const benches: [number, number, number][] = [
      // x, z, rotation (degrees)
      [-6, 6, 0],
      [3, 6, 0],
      [-8, 12, 90],
      [5, 10, 90],
      [-10, 4, 45],
    ];

    for (const [x, z, rot] of benches) {
      const bench = new pc.Entity("bench");

      // Seat
      const seat = new pc.Entity("bench-seat");
      seat.addComponent("model", { type: "box" });
      seat.setLocalScale(2, 0.12, 0.6);
      seat.setLocalPosition(0, 0.5, 0);
      seat.model!.material = benchSeatMat;
      bench.addChild(seat);

      // Backrest
      const back = new pc.Entity("bench-back");
      back.addComponent("model", { type: "box" });
      back.setLocalScale(2, 0.6, 0.1);
      back.setLocalPosition(0, 0.8, -0.25);
      back.model!.material = benchSeatMat;
      bench.addChild(back);

      // Four legs
      const legPositions: [number, number][] = [
        [-0.8, -0.2],
        [0.8, -0.2],
        [-0.8, 0.2],
        [0.8, 0.2],
      ];
      for (const [lx, lz] of legPositions) {
        const leg = new pc.Entity("bench-leg");
        leg.addComponent("model", { type: "box" });
        leg.setLocalScale(0.08, 0.5, 0.08);
        leg.setLocalPosition(lx, 0.25, lz);
        leg.model!.material = benchLegMat;
        bench.addChild(leg);
      }

      bench.setPosition(x, 0, z);
      bench.setEulerAngles(0, rot, 0);
      group.addChild(bench);
    }

    // --- Water fountain in center of zoo ---
    const fountain = new pc.Entity("fountain");

    // Base pool (octagonal approximated as cylinder)
    const pool = new pc.Entity("fountain-pool");
    pool.addComponent("model", { type: "cylinder" });
    pool.setLocalScale(4, 0.4, 4);
    pool.setLocalPosition(0, 0.2, 0);
    pool.model!.material = this.createMaterial("#8899aa");
    fountain.addChild(pool);

    // Water surface
    const water = new pc.Entity("fountain-water");
    water.addComponent("model", { type: "cylinder" });
    water.setLocalScale(3.6, 0.05, 3.6);
    water.setLocalPosition(0, 0.38, 0);
    water.model!.material = this.createMaterial("#4488cc", "#5599dd");
    fountain.addChild(water);

    // Inner pedestal
    const pedestal = new pc.Entity("fountain-pedestal");
    pedestal.addComponent("model", { type: "cylinder" });
    pedestal.setLocalScale(0.8, 1.5, 0.8);
    pedestal.setLocalPosition(0, 0.75, 0);
    pedestal.model!.material = this.createMaterial("#9aaabb");
    fountain.addChild(pedestal);

    // Top bowl
    const bowl = new pc.Entity("fountain-bowl");
    bowl.addComponent("model", { type: "cylinder" });
    bowl.setLocalScale(1.8, 0.25, 1.8);
    bowl.setLocalPosition(0, 1.5, 0);
    bowl.model!.material = this.createMaterial("#8899aa");
    fountain.addChild(bowl);

    // Water spout sphere on top
    const spout = new pc.Entity("fountain-spout");
    spout.addComponent("model", { type: "sphere" });
    spout.setLocalScale(0.5, 0.5, 0.5);
    spout.setLocalPosition(0, 1.85, 0);
    spout.model!.material = this.createMaterial("#66aadd", "#88ccff");
    fountain.addChild(spout);

    fountain.setPosition(-6, 0, 10);
    group.addChild(fountain);

    // --- Flower beds along paths ---
    const flowerColors = ["#ff4466", "#ffaa22", "#dd44ff", "#44aaff", "#ffff44"];
    const flowerBeds: [number, number, number, number, number][] = [
      // x, z, scaleX, scaleZ, colorIndex
      [-5, 5, 2, 0.8, 0],
      [2, 5, 1.5, 0.8, 1],
      [-10, 7, 1.5, 0.8, 2],
      [6, 7, 2, 0.8, 3],
      [-14, 14, 1.5, 0.8, 4],
      [-4, 14, 2, 0.8, 0],
      [8, 9, 1, 0.6, 1],
      [-16, 8, 1.2, 0.6, 3],
    ];

    for (const [x, z, sx, sz, ci] of flowerBeds) {
      const bed = new pc.Entity("flower-bed");

      // Soil base
      const soil = new pc.Entity("soil");
      soil.addComponent("model", { type: "box" });
      soil.setLocalScale(sx, 0.1, sz);
      soil.setLocalPosition(0, 0.05, 0);
      soil.model!.material = this.createMaterial("#4a3520");
      bed.addChild(soil);

      // Flower tops (small colored spheres scattered)
      const flowerMat = this.createMaterial(flowerColors[ci], flowerColors[ci]);
      const greenMat = this.createMaterial("#228822");
      const flowerCount = Math.floor(sx * 3);
      for (let f = 0; f < flowerCount; f++) {
        const fx = (f / (flowerCount - 1) - 0.5) * (sx * 0.8);
        const fz = (Math.random() - 0.5) * (sz * 0.6);

        // Stem
        const stem = new pc.Entity("stem");
        stem.addComponent("model", { type: "cylinder" });
        stem.setLocalScale(0.04, 0.25, 0.04);
        stem.setLocalPosition(fx, 0.2, fz);
        stem.model!.material = greenMat;
        bed.addChild(stem);

        // Bloom
        const bloom = new pc.Entity("bloom");
        bloom.addComponent("model", { type: "sphere" });
        bloom.setLocalScale(0.15, 0.12, 0.15);
        bloom.setLocalPosition(fx, 0.35, fz);
        bloom.model!.material = flowerMat;
        bed.addChild(bloom);
      }

      bed.setPosition(x, 0, z);
      group.addChild(bed);
    }

    return group;
  }

  // --- Character creation: Puncheroni (baby monkey hero) ---

  private createPunchActor(): pc.Entity {
    const punch = new pc.Entity("punch");
    const bodyMat = this.createMaterial("#FF8C00");
    const faceMat = this.createMaterial("#FFDAB9");
    const eyeMat = this.createMaterial("#1a1a1a");
    const earMat = this.createMaterial("#FF8C00");
    const noseMat = this.createMaterial("#ff6699");

    // Small body (capsule, orange-brown)
    const body = new pc.Entity("punch-body");
    body.addComponent("model", { type: "capsule" });
    body.setLocalScale(0.6, 0.8, 0.55);
    body.setLocalPosition(0, 0.4, 0);
    body.model!.material = bodyMat;
    punch.addChild(body);

    // BIG round head (oversized for cuteness)
    const head = new pc.Entity("punch-head");
    head.addComponent("model", { type: "sphere" });
    head.setLocalScale(0.7, 0.65, 0.65);
    head.setLocalPosition(0, 1.0, 0);
    head.model!.material = bodyMat;
    punch.addChild(head);

    // Face area (front of head, lighter peach)
    const face = new pc.Entity("punch-face");
    face.addComponent("model", { type: "sphere" });
    face.setLocalScale(0.5, 0.45, 0.2);
    face.setLocalPosition(0, 0.97, 0.25);
    face.model!.material = faceMat;
    punch.addChild(face);

    // Big round dark eyes (two)
    const leftEye = new pc.Entity("punch-eye-l");
    leftEye.addComponent("model", { type: "sphere" });
    leftEye.setLocalScale(0.12, 0.13, 0.08);
    leftEye.setLocalPosition(-0.13, 1.05, 0.35);
    leftEye.model!.material = eyeMat;
    punch.addChild(leftEye);

    const rightEye = new pc.Entity("punch-eye-r");
    rightEye.addComponent("model", { type: "sphere" });
    rightEye.setLocalScale(0.12, 0.13, 0.08);
    rightEye.setLocalPosition(0.13, 1.05, 0.35);
    rightEye.model!.material = eyeMat;
    punch.addChild(rightEye);

    // Eye highlights (tiny white dots)
    const eyeHighlightMat = this.createMaterial("#ffffff", "#ffffff");
    const leftHighlight = new pc.Entity("punch-eye-hl-l");
    leftHighlight.addComponent("model", { type: "sphere" });
    leftHighlight.setLocalScale(0.04, 0.04, 0.03);
    leftHighlight.setLocalPosition(-0.1, 1.08, 0.38);
    leftHighlight.model!.material = eyeHighlightMat;
    punch.addChild(leftHighlight);

    const rightHighlight = new pc.Entity("punch-eye-hl-r");
    rightHighlight.addComponent("model", { type: "sphere" });
    rightHighlight.setLocalScale(0.04, 0.04, 0.03);
    rightHighlight.setLocalPosition(0.16, 1.08, 0.38);
    rightHighlight.model!.material = eyeHighlightMat;
    punch.addChild(rightHighlight);

    // Pink nose dot
    const nose = new pc.Entity("punch-nose");
    nose.addComponent("model", { type: "sphere" });
    nose.setLocalScale(0.07, 0.06, 0.05);
    nose.setLocalPosition(0, 0.95, 0.38);
    nose.model!.material = noseMat;
    punch.addChild(nose);

    // Little round ears
    const leftEar = new pc.Entity("punch-ear-l");
    leftEar.addComponent("model", { type: "sphere" });
    leftEar.setLocalScale(0.18, 0.18, 0.08);
    leftEar.setLocalPosition(-0.32, 1.12, 0);
    leftEar.model!.material = earMat;
    punch.addChild(leftEar);

    const rightEar = new pc.Entity("punch-ear-r");
    rightEar.addComponent("model", { type: "sphere" });
    rightEar.setLocalScale(0.18, 0.18, 0.08);
    rightEar.setLocalPosition(0.32, 1.12, 0);
    rightEar.model!.material = earMat;
    punch.addChild(rightEar);

    // Inner ear (lighter)
    const innerEarMat = this.createMaterial("#FFDAB9");
    const leftInnerEar = new pc.Entity("punch-inner-ear-l");
    leftInnerEar.addComponent("model", { type: "sphere" });
    leftInnerEar.setLocalScale(0.1, 0.1, 0.05);
    leftInnerEar.setLocalPosition(-0.32, 1.12, 0.03);
    leftInnerEar.model!.material = innerEarMat;
    punch.addChild(leftInnerEar);

    const rightInnerEar = new pc.Entity("punch-inner-ear-r");
    rightInnerEar.addComponent("model", { type: "sphere" });
    rightInnerEar.setLocalScale(0.1, 0.1, 0.05);
    rightInnerEar.setLocalPosition(0.32, 1.12, 0.03);
    rightInnerEar.model!.material = innerEarMat;
    punch.addChild(rightInnerEar);

    // Short stubby tail
    const tailMat = this.createMaterial("#e07800");
    const tail = new pc.Entity("punch-tail");
    tail.addComponent("model", { type: "cylinder" });
    tail.setLocalScale(0.08, 0.25, 0.08);
    tail.setLocalPosition(0, 0.35, -0.3);
    tail.setLocalEulerAngles(30, 0, 0);
    tail.model!.material = tailMat;
    punch.addChild(tail);

    // Arms (tiny stubs)
    const armMat = this.createMaterial("#FF8C00");
    const leftArm = new pc.Entity("punch-arm-l");
    leftArm.addComponent("model", { type: "cylinder" });
    leftArm.setLocalScale(0.1, 0.25, 0.1);
    leftArm.setLocalPosition(-0.3, 0.45, 0);
    leftArm.setLocalEulerAngles(0, 0, 20);
    leftArm.model!.material = armMat;
    punch.addChild(leftArm);

    const rightArm = new pc.Entity("punch-arm-r");
    rightArm.addComponent("model", { type: "capsule" });
    rightArm.setLocalScale(0.1, 0.25, 0.1);
    rightArm.setLocalPosition(0.3, 0.45, 0);
    rightArm.setLocalEulerAngles(0, 0, -20);
    rightArm.model!.material = armMat;
    punch.addChild(rightArm);

    // Legs (tiny stubs)
    const leftLeg = new pc.Entity("punch-leg-l");
    leftLeg.addComponent("model", { type: "cylinder" });
    leftLeg.setLocalScale(0.1, 0.2, 0.1);
    leftLeg.setLocalPosition(-0.12, 0.1, 0);
    leftLeg.model!.material = armMat;
    punch.addChild(leftLeg);

    const rightLeg = new pc.Entity("punch-leg-r");
    rightLeg.addComponent("model", { type: "cylinder" });
    rightLeg.setLocalScale(0.1, 0.2, 0.1);
    rightLeg.setLocalPosition(0.12, 0.1, 0);
    rightLeg.model!.material = armMat;
    punch.addChild(rightLeg);

    punch.setPosition(PUNCH_HOME.x, PUNCH_HOME.y, PUNCH_HOME.z);
    return punch;
  }

  // --- Character creation: Toy (IKEA Djungelskog orangutan plushie) ---

  private createToyActor(): pc.Entity {
    const toy = new pc.Entity("toy");
    const bodyMat = this.createMaterial("#D2691E");
    const headMat = this.createMaterial("#DA8040");
    const faceMat = this.createMaterial("#E8A060");
    const eyeMat = this.createMaterial("#111111");

    // Rounded plushie body (capsule, dark orange)
    const body = new pc.Entity("toy-body");
    body.addComponent("model", { type: "capsule" });
    body.setLocalScale(0.5, 0.6, 0.45);
    body.setLocalPosition(0, 0.3, 0);
    body.model!.material = bodyMat;
    toy.addChild(body);

    // Round head (sphere, slightly lighter)
    const head = new pc.Entity("toy-head");
    head.addComponent("model", { type: "sphere" });
    head.setLocalScale(0.45, 0.42, 0.4);
    head.setLocalPosition(0, 0.7, 0);
    head.model!.material = headMat;
    toy.addChild(head);

    // Face area
    const face = new pc.Entity("toy-face");
    face.addComponent("model", { type: "sphere" });
    face.setLocalScale(0.3, 0.28, 0.12);
    face.setLocalPosition(0, 0.68, 0.17);
    face.model!.material = faceMat;
    toy.addChild(face);

    // Eyes (small dark beads)
    const leftEye = new pc.Entity("toy-eye-l");
    leftEye.addComponent("model", { type: "sphere" });
    leftEye.setLocalScale(0.06, 0.06, 0.04);
    leftEye.setLocalPosition(-0.08, 0.73, 0.2);
    leftEye.model!.material = eyeMat;
    toy.addChild(leftEye);

    const rightEye = new pc.Entity("toy-eye-r");
    rightEye.addComponent("model", { type: "sphere" });
    rightEye.setLocalScale(0.06, 0.06, 0.04);
    rightEye.setLocalPosition(0.08, 0.73, 0.2);
    rightEye.model!.material = eyeMat;
    toy.addChild(rightEye);

    // Two floppy arms (thin cylinders hanging down)
    const armMat = this.createMaterial("#C46020");

    const leftArm = new pc.Entity("toy-arm-l");
    leftArm.addComponent("model", { type: "cylinder" });
    leftArm.setLocalScale(0.08, 0.35, 0.08);
    leftArm.setLocalPosition(-0.25, 0.22, 0.02);
    leftArm.setLocalEulerAngles(0, 0, 15);
    leftArm.model!.material = armMat;
    toy.addChild(leftArm);

    const rightArm = new pc.Entity("toy-arm-r");
    rightArm.addComponent("model", { type: "cylinder" });
    rightArm.setLocalScale(0.08, 0.35, 0.08);
    rightArm.setLocalPosition(0.25, 0.22, 0.02);
    rightArm.setLocalEulerAngles(0, 0, -15);
    rightArm.model!.material = armMat;
    toy.addChild(rightArm);

    // Small floppy hands at end of arms
    const handMat = this.createMaterial("#B85518");
    const leftHand = new pc.Entity("toy-hand-l");
    leftHand.addComponent("model", { type: "sphere" });
    leftHand.setLocalScale(0.1, 0.08, 0.1);
    leftHand.setLocalPosition(-0.28, 0.04, 0.02);
    leftHand.model!.material = handMat;
    toy.addChild(leftHand);

    const rightHand = new pc.Entity("toy-hand-r");
    rightHand.addComponent("model", { type: "sphere" });
    rightHand.setLocalScale(0.1, 0.08, 0.1);
    rightHand.setLocalPosition(0.28, 0.04, 0.02);
    rightHand.model!.material = handMat;
    toy.addChild(rightHand);

    // Stubby legs
    const leftLeg = new pc.Entity("toy-leg-l");
    leftLeg.addComponent("model", { type: "cylinder" });
    leftLeg.setLocalScale(0.09, 0.15, 0.09);
    leftLeg.setLocalPosition(-0.1, 0.05, 0);
    leftLeg.model!.material = bodyMat;
    toy.addChild(leftLeg);

    const rightLeg = new pc.Entity("toy-leg-r");
    rightLeg.addComponent("model", { type: "cylinder" });
    rightLeg.setLocalScale(0.09, 0.15, 0.09);
    rightLeg.setLocalPosition(0.1, 0.05, 0);
    rightLeg.model!.material = bodyMat;
    toy.addChild(rightLeg);

    // Nose (small dark dot)
    const nose = new pc.Entity("toy-nose");
    nose.addComponent("model", { type: "sphere" });
    nose.setLocalScale(0.04, 0.035, 0.03);
    nose.setLocalPosition(0, 0.67, 0.22);
    nose.model!.material = eyeMat;
    toy.addChild(nose);

    // Ears (small round)
    const earMat = this.createMaterial("#C46020");
    const leftEar = new pc.Entity("toy-ear-l");
    leftEar.addComponent("model", { type: "sphere" });
    leftEar.setLocalScale(0.1, 0.1, 0.05);
    leftEar.setLocalPosition(-0.2, 0.78, 0);
    leftEar.model!.material = earMat;
    toy.addChild(leftEar);

    const rightEar = new pc.Entity("toy-ear-r");
    rightEar.addComponent("model", { type: "sphere" });
    rightEar.setLocalScale(0.1, 0.1, 0.05);
    rightEar.setLocalPosition(0.2, 0.78, 0);
    rightEar.model!.material = earMat;
    toy.addChild(rightEar);

    toy.setPosition(TOY_HOME.x, TOY_HOME.y, TOY_HOME.z);
    return toy;
  }

  private createExtractionActor(): pc.Entity {
    const extraction = new pc.Entity("extraction-zone");

    // Glowing pad
    const pad = new pc.Entity("extraction-pad");
    pad.addComponent("model", { type: "cylinder" });
    pad.setLocalScale(
      EXTRACTION_RADIUS * 2,
      0.08,
      EXTRACTION_RADIUS * 2
    );
    pad.setPosition(
      EXTRACTION_POINT.x,
      EXTRACTION_POINT.y,
      EXTRACTION_POINT.z
    );
    pad.model!.material = this.createMaterial("#ff5779", "#ff8899");
    extraction.addChild(pad);

    // Danger beacon
    const beacon = new pc.Entity("extraction-beacon");
    beacon.addComponent("model", { type: "box" });
    beacon.setLocalScale(0.35, 3, 0.35);
    beacon.setPosition(
      EXTRACTION_POINT.x + EXTRACTION_RADIUS,
      1.5,
      EXTRACTION_POINT.z
    );
    beacon.model!.material = this.createMaterial("#ff3355", "#ff6677");
    extraction.addChild(beacon);

    return extraction;
  }

  // --- Character creation: Enemy Monkey (attacker) ---

  private createMonkeyActor(isBot: boolean): pc.Entity {
    const scale = isBot ? 0.85 : 1.0;
    const root = new pc.Entity("monkey-player");
    const bodyMat = this.createMaterial("#8B4513");
    const faceMat = this.createMaterial("#e8a088");
    const earMat = this.createMaterial("#7a3b10");
    const eyeMat = this.createMaterial("#111111");
    const limbMat = this.createMaterial("#7a3b10");
    const snoutMat = this.createMaterial("#6b3510");
    const tailMat = this.createMaterial("#6b3510");

    // Hunched body (capsule, brown)
    const body = new pc.Entity("monkey-body");
    body.addComponent("model", { type: "capsule" });
    body.setLocalScale(0.55 * scale, 0.8 * scale, 0.5 * scale);
    body.setLocalPosition(0, 0.45 * scale, 0.05);
    body.setLocalEulerAngles(15, 0, 0); // Slight forward hunch
    body.model!.material = bodyMat;
    root.addChild(body);

    // Round head
    const head = new pc.Entity("monkey-head");
    head.addComponent("model", { type: "sphere" });
    head.setLocalScale(0.42 * scale, 0.38 * scale, 0.4 * scale);
    head.setLocalPosition(0, 0.9 * scale, 0.1);
    head.model!.material = bodyMat;
    root.addChild(head);

    // Protruding snout (small cylinder)
    const snout = new pc.Entity("monkey-snout");
    snout.addComponent("model", { type: "cylinder" });
    snout.setLocalScale(0.15 * scale, 0.1 * scale, 0.12 * scale);
    snout.setLocalPosition(0, 0.85 * scale, 0.28);
    snout.setLocalEulerAngles(90, 0, 0);
    snout.model!.material = snoutMat;
    root.addChild(snout);

    // Red/pink face area (flat sphere on front of head)
    const face = new pc.Entity("monkey-face");
    face.addComponent("model", { type: "sphere" });
    face.setLocalScale(0.28 * scale, 0.25 * scale, 0.1 * scale);
    face.setLocalPosition(0, 0.9 * scale, 0.2);
    face.model!.material = faceMat;
    root.addChild(face);

    // Eyes
    const leftEye = new pc.Entity("monkey-eye-l");
    leftEye.addComponent("model", { type: "sphere" });
    leftEye.setLocalScale(0.06 * scale, 0.07 * scale, 0.04 * scale);
    leftEye.setLocalPosition(-0.08 * scale, 0.94 * scale, 0.25);
    leftEye.model!.material = eyeMat;
    root.addChild(leftEye);

    const rightEye = new pc.Entity("monkey-eye-r");
    rightEye.addComponent("model", { type: "sphere" });
    rightEye.setLocalScale(0.06 * scale, 0.07 * scale, 0.04 * scale);
    rightEye.setLocalPosition(0.08 * scale, 0.94 * scale, 0.25);
    rightEye.model!.material = eyeMat;
    root.addChild(rightEye);

    // Two round ears on top
    const leftEar = new pc.Entity("monkey-ear-l");
    leftEar.addComponent("model", { type: "sphere" });
    leftEar.setLocalScale(0.14 * scale, 0.14 * scale, 0.06 * scale);
    leftEar.setLocalPosition(-0.2 * scale, 1.05 * scale, 0.05);
    leftEar.model!.material = earMat;
    root.addChild(leftEar);

    const rightEar = new pc.Entity("monkey-ear-r");
    rightEar.addComponent("model", { type: "sphere" });
    rightEar.setLocalScale(0.14 * scale, 0.14 * scale, 0.06 * scale);
    rightEar.setLocalPosition(0.2 * scale, 1.05 * scale, 0.05);
    rightEar.model!.material = earMat;
    root.addChild(rightEar);

    // Long curved tail (4 thin cylinders joined at angles)
    const tailSegments: [number, number, number, number, number, number][] = [
      // x, y, z, rotX, rotY, rotZ
      [0, 0.4 * scale, -0.3, 45, 0, 0],
      [0, 0.55 * scale, -0.5, 30, 10, 0],
      [0, 0.75 * scale, -0.6, -10, 15, 0],
      [0.05, 0.9 * scale, -0.55, -40, 10, 0],
    ];

    for (let i = 0; i < tailSegments.length; i++) {
      const [tx, ty, tz, rx, ry, rz] = tailSegments[i];
      const seg = new pc.Entity(`monkey-tail-${i}`);
      seg.addComponent("model", { type: "cylinder" });
      seg.setLocalScale(0.05 * scale, 0.2 * scale, 0.05 * scale);
      seg.setLocalPosition(tx, ty, tz);
      seg.setLocalEulerAngles(rx, ry, rz);
      seg.model!.material = tailMat;
      root.addChild(seg);
    }

    // Four limbs (thin cylinders)
    // Front arms
    const leftArm = new pc.Entity("monkey-arm-l");
    leftArm.addComponent("model", { type: "cylinder" });
    leftArm.setLocalScale(0.08 * scale, 0.35 * scale, 0.08 * scale);
    leftArm.setLocalPosition(-0.22 * scale, 0.3 * scale, 0.12);
    leftArm.setLocalEulerAngles(10, 0, 12);
    leftArm.model!.material = limbMat;
    root.addChild(leftArm);

    const rightArm = new pc.Entity("monkey-arm-r");
    rightArm.addComponent("model", { type: "cylinder" });
    rightArm.setLocalScale(0.08 * scale, 0.35 * scale, 0.08 * scale);
    rightArm.setLocalPosition(0.22 * scale, 0.3 * scale, 0.12);
    rightArm.setLocalEulerAngles(10, 0, -12);
    rightArm.model!.material = limbMat;
    root.addChild(rightArm);

    // Hind legs
    const leftLeg = new pc.Entity("monkey-leg-l");
    leftLeg.addComponent("model", { type: "cylinder" });
    leftLeg.setLocalScale(0.09 * scale, 0.3 * scale, 0.09 * scale);
    leftLeg.setLocalPosition(-0.14 * scale, 0.15 * scale, -0.05);
    leftLeg.model!.material = limbMat;
    root.addChild(leftLeg);

    const rightLeg = new pc.Entity("monkey-leg-r");
    rightLeg.addComponent("model", { type: "cylinder" });
    rightLeg.setLocalScale(0.09 * scale, 0.3 * scale, 0.09 * scale);
    rightLeg.setLocalPosition(0.14 * scale, 0.15 * scale, -0.05);
    rightLeg.model!.material = limbMat;
    root.addChild(rightLeg);

    // Hands (small spheres at arm ends)
    const handMat = this.createMaterial("#5a2d0e");
    const leftHand = new pc.Entity("monkey-hand-l");
    leftHand.addComponent("model", { type: "sphere" });
    leftHand.setLocalScale(0.09 * scale, 0.07 * scale, 0.09 * scale);
    leftHand.setLocalPosition(-0.24 * scale, 0.1 * scale, 0.14);
    leftHand.model!.material = handMat;
    root.addChild(leftHand);

    const rightHand = new pc.Entity("monkey-hand-r");
    rightHand.addComponent("model", { type: "sphere" });
    rightHand.setLocalScale(0.09 * scale, 0.07 * scale, 0.09 * scale);
    rightHand.setLocalPosition(0.24 * scale, 0.1 * scale, 0.14);
    rightHand.model!.material = handMat;
    root.addChild(rightHand);

    // Feet (small spheres)
    const leftFoot = new pc.Entity("monkey-foot-l");
    leftFoot.addComponent("model", { type: "sphere" });
    leftFoot.setLocalScale(0.1 * scale, 0.06 * scale, 0.12 * scale);
    leftFoot.setLocalPosition(-0.14 * scale, 0.02, 0);
    leftFoot.model!.material = handMat;
    root.addChild(leftFoot);

    const rightFoot = new pc.Entity("monkey-foot-r");
    rightFoot.addComponent("model", { type: "sphere" });
    rightFoot.setLocalScale(0.1 * scale, 0.06 * scale, 0.12 * scale);
    rightFoot.setLocalPosition(0.14 * scale, 0.02, 0);
    rightFoot.model!.material = handMat;
    root.addChild(rightFoot);

    return root;
  }

  // --- Character creation: Zookeeper (defender) ---

  private createZookeeperActor(isBot: boolean): pc.Entity {
    const scale = isBot ? 0.85 : 1.0;
    const root = new pc.Entity("zookeeper-player");
    const bodyMat = this.createMaterial("#6B8E23");
    const skinMat = this.createMaterial("#DEB887");
    const hatMat = this.createMaterial("#556B2F");
    const beltMat = this.createMaterial("#5a3d1e");
    const legMat = this.createMaterial("#4a6b18");
    const bootMat = this.createMaterial("#3d2812");
    const eyeMat = this.createMaterial("#111111");

    // Tall upright body (capsule, khaki)
    const body = new pc.Entity("keeper-body");
    body.addComponent("model", { type: "capsule" });
    body.setLocalScale(0.5 * scale, 0.85 * scale, 0.4 * scale);
    body.setLocalPosition(0, 0.6 * scale, 0);
    body.model!.material = bodyMat;
    root.addChild(body);

    // Chest/shoulders (wider at top)
    const chest = new pc.Entity("keeper-chest");
    chest.addComponent("model", { type: "box" });
    chest.setLocalScale(0.55 * scale, 0.3 * scale, 0.35 * scale);
    chest.setLocalPosition(0, 0.85 * scale, 0);
    chest.model!.material = bodyMat;
    root.addChild(chest);

    // Round head with skin tone
    const head = new pc.Entity("keeper-head");
    head.addComponent("model", { type: "sphere" });
    head.setLocalScale(0.35 * scale, 0.35 * scale, 0.35 * scale);
    head.setLocalPosition(0, 1.2 * scale, 0);
    head.model!.material = skinMat;
    root.addChild(head);

    // Face features - eyes
    const leftEye = new pc.Entity("keeper-eye-l");
    leftEye.addComponent("model", { type: "sphere" });
    leftEye.setLocalScale(0.05 * scale, 0.05 * scale, 0.03 * scale);
    leftEye.setLocalPosition(-0.07 * scale, 1.23 * scale, 0.16);
    leftEye.model!.material = eyeMat;
    root.addChild(leftEye);

    const rightEye = new pc.Entity("keeper-eye-r");
    rightEye.addComponent("model", { type: "sphere" });
    rightEye.setLocalScale(0.05 * scale, 0.05 * scale, 0.03 * scale);
    rightEye.setLocalPosition(0.07 * scale, 1.23 * scale, 0.16);
    rightEye.model!.material = eyeMat;
    root.addChild(rightEye);

    // Safari/ranger hat (cylinder on top, olive)
    const hatBrim = new pc.Entity("keeper-hat-brim");
    hatBrim.addComponent("model", { type: "cylinder" });
    hatBrim.setLocalScale(0.5 * scale, 0.04 * scale, 0.5 * scale);
    hatBrim.setLocalPosition(0, 1.38 * scale, 0);
    hatBrim.model!.material = hatMat;
    root.addChild(hatBrim);

    const hatTop = new pc.Entity("keeper-hat-top");
    hatTop.addComponent("model", { type: "cylinder" });
    hatTop.setLocalScale(0.3 * scale, 0.15 * scale, 0.3 * scale);
    hatTop.setLocalPosition(0, 1.45 * scale, 0);
    hatTop.model!.material = hatMat;
    root.addChild(hatTop);

    // Hat band
    const hatBandMat = this.createMaterial("#3d5a1e");
    const hatBand = new pc.Entity("keeper-hat-band");
    hatBand.addComponent("model", { type: "cylinder" });
    hatBand.setLocalScale(0.31 * scale, 0.03 * scale, 0.31 * scale);
    hatBand.setLocalPosition(0, 1.39 * scale, 0);
    hatBand.model!.material = hatBandMat;
    root.addChild(hatBand);

    // Two arms (thin cylinders, khaki)
    const leftArm = new pc.Entity("keeper-arm-l");
    leftArm.addComponent("model", { type: "cylinder" });
    leftArm.setLocalScale(0.09 * scale, 0.4 * scale, 0.09 * scale);
    leftArm.setLocalPosition(-0.32 * scale, 0.55 * scale, 0);
    leftArm.setLocalEulerAngles(0, 0, 10);
    leftArm.model!.material = bodyMat;
    root.addChild(leftArm);

    const rightArm = new pc.Entity("keeper-arm-r");
    rightArm.addComponent("model", { type: "cylinder" });
    rightArm.setLocalScale(0.09 * scale, 0.4 * scale, 0.09 * scale);
    rightArm.setLocalPosition(0.32 * scale, 0.55 * scale, 0);
    rightArm.setLocalEulerAngles(0, 0, -10);
    rightArm.model!.material = bodyMat;
    root.addChild(rightArm);

    // Hands (skin colored spheres)
    const leftHand = new pc.Entity("keeper-hand-l");
    leftHand.addComponent("model", { type: "sphere" });
    leftHand.setLocalScale(0.1 * scale, 0.08 * scale, 0.1 * scale);
    leftHand.setLocalPosition(-0.35 * scale, 0.32 * scale, 0);
    leftHand.model!.material = skinMat;
    root.addChild(leftHand);

    const rightHand = new pc.Entity("keeper-hand-r");
    rightHand.addComponent("model", { type: "sphere" });
    rightHand.setLocalScale(0.1 * scale, 0.08 * scale, 0.1 * scale);
    rightHand.setLocalPosition(0.35 * scale, 0.32 * scale, 0);
    rightHand.model!.material = skinMat;
    root.addChild(rightHand);

    // Two legs (thin cylinders, darker khaki)
    const leftLeg = new pc.Entity("keeper-leg-l");
    leftLeg.addComponent("model", { type: "cylinder" });
    leftLeg.setLocalScale(0.1 * scale, 0.4 * scale, 0.1 * scale);
    leftLeg.setLocalPosition(-0.12 * scale, 0.2 * scale, 0);
    leftLeg.model!.material = legMat;
    root.addChild(leftLeg);

    const rightLeg = new pc.Entity("keeper-leg-r");
    rightLeg.addComponent("model", { type: "cylinder" });
    rightLeg.setLocalScale(0.1 * scale, 0.4 * scale, 0.1 * scale);
    rightLeg.setLocalPosition(0.12 * scale, 0.2 * scale, 0);
    rightLeg.model!.material = legMat;
    root.addChild(rightLeg);

    // Boots
    const leftBoot = new pc.Entity("keeper-boot-l");
    leftBoot.addComponent("model", { type: "box" });
    leftBoot.setLocalScale(0.12 * scale, 0.08 * scale, 0.16 * scale);
    leftBoot.setLocalPosition(-0.12 * scale, 0.02, 0.02);
    leftBoot.model!.material = bootMat;
    root.addChild(leftBoot);

    const rightBoot = new pc.Entity("keeper-boot-r");
    rightBoot.addComponent("model", { type: "box" });
    rightBoot.setLocalScale(0.12 * scale, 0.08 * scale, 0.16 * scale);
    rightBoot.setLocalPosition(0.12 * scale, 0.02, 0.02);
    rightBoot.model!.material = bootMat;
    root.addChild(rightBoot);

    // Utility belt (thin cylinder around waist, brown)
    const belt = new pc.Entity("keeper-belt");
    belt.addComponent("model", { type: "cylinder" });
    belt.setLocalScale(0.42 * scale, 0.04 * scale, 0.35 * scale);
    belt.setLocalPosition(0, 0.42 * scale, 0);
    belt.model!.material = beltMat;
    root.addChild(belt);

    // Belt buckle
    const buckleMat = this.createMaterial("#c9a84c");
    const buckle = new pc.Entity("keeper-buckle");
    buckle.addComponent("model", { type: "box" });
    buckle.setLocalScale(0.06 * scale, 0.05 * scale, 0.03 * scale);
    buckle.setLocalPosition(0, 0.42 * scale, 0.17);
    buckle.model!.material = buckleMat;
    root.addChild(buckle);

    // Belt pouch (small box on side)
    const pouch = new pc.Entity("keeper-pouch");
    pouch.addComponent("model", { type: "box" });
    pouch.setLocalScale(0.08 * scale, 0.08 * scale, 0.06 * scale);
    pouch.setLocalPosition(0.2 * scale, 0.42 * scale, 0.08);
    pouch.model!.material = beltMat;
    root.addChild(pouch);

    // Shirt pocket detail
    const pocketMat = this.createMaterial("#5a7a1e");
    const pocket = new pc.Entity("keeper-pocket");
    pocket.addComponent("model", { type: "box" });
    pocket.setLocalScale(0.1 * scale, 0.08 * scale, 0.02 * scale);
    pocket.setLocalPosition(-0.12 * scale, 0.82 * scale, 0.18);
    pocket.model!.material = pocketMat;
    root.addChild(pocket);

    return root;
  }

  // --- Player actor dispatch ---

  private createPlayerActor(
    role: Role,
    isLocal: boolean,
    isBot: boolean
  ): SceneActor {
    let root: pc.Entity;

    if (role === "zookeeper") {
      root = this.createZookeeperActor(isBot);
    } else {
      root = this.createMonkeyActor(isBot);
    }

    // Selection ring
    const ring = new pc.Entity("selection-ring");
    ring.addComponent("model", { type: "cylinder" });
    ring.setLocalScale(1.4, 0.04, 1.4);
    ring.setPosition(0, -0.72, 0);
    ring.model!.material = this.createMaterial(
      isLocal ? "#fff4cc" : isBot ? "#26404a" : "#10151a"
    );
    root.addChild(ring);

    return { root, ring };
  }

  // --- Utility ---

  private createMaterial(
    diffuseHex: string,
    emissiveHex?: string
  ): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
    material.diffuse = new pc.Color().fromString(diffuseHex);

    if (emissiveHex) {
      material.emissive = new pc.Color().fromString(emissiveHex);
      material.emissiveIntensity = 0.35;
    }

    material.metalness = 0.08;
    material.gloss = 0.45;
    material.update();
    return material;
  }
}

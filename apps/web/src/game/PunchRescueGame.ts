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

    // Scale the stress color
    const punchModel = this.punchActor.model;
    if (punchModel?.material) {
      const mat = punchModel.material as pc.StandardMaterial;
      const r = 1.0;
      const g = 0.56 - stress * 0.2;
      const b = 0.18 - stress * 0.1;
      mat.diffuse.set(r, g, b);
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

  private createPunchActor(): pc.Entity {
    const punch = new pc.Entity("punch");

    // Body (capsule)
    punch.addComponent("model", { type: "capsule" });
    punch.setLocalScale(1.0, 1.2, 1.0);
    punch.setPosition(PUNCH_HOME.x, PUNCH_HOME.y, PUNCH_HOME.z);
    punch.model!.material = this.createMaterial("#ff8f2d");

    // Head (sphere on top) - bigger, cuter
    const head = new pc.Entity("punch-head");
    head.addComponent("model", { type: "sphere" });
    head.setLocalScale(0.8, 0.75, 0.7);
    head.setPosition(0, 0.65, 0);
    head.model!.material = this.createMaterial("#ffb366");
    punch.addChild(head);

    return punch;
  }

  private createToyActor(): pc.Entity {
    const toy = new pc.Entity("toy");

    // Main body (the orangutan plushie)
    toy.addComponent("model", { type: "capsule" });
    toy.setLocalScale(0.55, 0.7, 0.55);
    toy.setPosition(TOY_HOME.x, TOY_HOME.y, TOY_HOME.z);
    toy.model!.material = this.createMaterial("#c45a20", "#dd8040");

    // Plushie head
    const plushHead = new pc.Entity("plush-head");
    plushHead.addComponent("model", { type: "sphere" });
    plushHead.setLocalScale(0.65, 0.6, 0.6);
    plushHead.setPosition(0, 0.5, 0);
    plushHead.model!.material = this.createMaterial("#d4722e", "#e89050");
    toy.addChild(plushHead);

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

  private createPlayerActor(
    role: Role,
    isLocal: boolean,
    isBot: boolean
  ): SceneActor {
    const root = new pc.Entity(`${role}-player`);
    root.addComponent("model", { type: "capsule" });

    if (role === "zookeeper") {
      // Taller, more upright human shape
      root.setLocalScale(isBot ? 0.75 : 0.85, isBot ? 1.5 : 1.7, isBot ? 0.75 : 0.85);
      root.model!.material = this.createMaterial(ROLE_COLORS.zookeeper);
    } else {
      // Smaller, more hunched monkey shape
      root.setLocalScale(isBot ? 0.65 : 0.75, isBot ? 1.1 : 1.25, isBot ? 0.65 : 0.75);
      root.model!.material = this.createMaterial(ROLE_COLORS.monkey);
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

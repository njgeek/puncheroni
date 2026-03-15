import { Room, type Client } from "colyseus";
import {
  EXTRACTION_POINT,
  EXTRACTION_RADIUS,
  ZOOKEEPER_SPAWNS,
  ZOOKEEPER_TAG_RANGE,
  ZOOKEEPER_SPEED_BONUS,
  PLAYER_SPEED,
  PUNCH_CALM_RANGE,
  PUNCH_FOLLOW_RANGE,
  PUNCH_GUARD_STRESS_RANGE,
  PUNCH_HOME,
  PUNCH_RETREAT_SPEED,
  PUNCH_SPEED,
  MONKEY_SPAWNS,
  ROLE_COLORS,
  ROUND_RESULT_MS,
  SOCIAL_PHASE_MS,
  OPERATION_PHASE_MS,
  TARGET_ZOOKEEPERS,
  TARGET_MONKEYS,
  TOY_HOME,
  TOY_PICKUP_RANGE,
  WORLD_HALF_EXTENT,
  MONKEY_TO_ZOOKEEPER_RATIO,
  clamp,
  clampWorldPosition,
  distanceTo,
  distanceSquared,
  moveToward,
  normalizeInput,
  type InputState,
  type Phase,
  type Role,
} from "@puncheroni/shared";
import { PlayerState, PunchRoomState } from "./PunchRoomState.js";

interface JoinOptions {
  name?: string;
  preferredRole?: Role;
}

interface InputMessage {
  moveX?: number;
  moveZ?: number;
}

const SIMULATION_TICK_RATE = 1000 / 20;

const ZOOKEEPER_PATROL_POINTS = [
  { x: 6, y: PUNCH_HOME.y, z: 5 },
  { x: -6, y: PUNCH_HOME.y, z: 5 },
  { x: 8, y: PUNCH_HOME.y, z: -4 },
  { x: -8, y: PUNCH_HOME.y, z: -4 },
];

const MONKEY_RALLY_POINTS = [
  { x: -14, y: PUNCH_HOME.y, z: 12 },
  { x: 14, y: PUNCH_HOME.y, z: 12 },
  { x: -10, y: PUNCH_HOME.y, z: 8 },
  { x: 10, y: PUNCH_HOME.y, z: 8 },
];

export class PunchRoom extends Room<{ state: PunchRoomState }> {
  state = new PunchRoomState();

  private readonly inputs = new Map<string, InputState>();
  private elapsedMs = 0;
  private zookeeperSpawnIndex = 0;
  private monkeySpawnIndex = 0;
  private botCounter = 0;
  private previousPhase: Phase = "social";
  private roundResultRemainingMs = 0;

  override onCreate(): void {
    this.maxClients = 12;
    this.setPatchRate(SIMULATION_TICK_RATE);
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));

    this.onMessage("input", (client, message: InputMessage) => {
      this.inputs.set(
        client.sessionId,
        normalizeInput(message.moveX ?? 0, message.moveZ ?? 0)
      );
    });

    this.reconcileBots();
  }

  override onJoin(client: Client, options: JoinOptions = {}): void {
    const role = this.pickRole(options.preferredRole);
    const spawn = this.nextSpawn(role);
    const player = new PlayerState();

    player.sessionId = client.sessionId;
    player.name =
      (options.name ?? `Player ${this.clients.length}`).trim() || "Player";
    player.role = role;
    player.isBot = false;
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    player.facing = role === "zookeeper" ? 0 : Math.PI;
    player.connected = true;

    this.state.players.set(client.sessionId, player);
    this.inputs.set(client.sessionId, { moveX: 0, moveZ: 0 });
    this.reconcileBots();

    console.log(
      `[room] joined ${client.sessionId} as ${role} (${ROLE_COLORS[role]})`
    );
  }

  override onLeave(client: Client, _code: number): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (this.state.toy.holderSessionId === client.sessionId) {
      this.state.toy.holderSessionId = "";
      this.state.toy.x = player.x;
      this.state.toy.y = TOY_HOME.y;
      this.state.toy.z = player.z;
    }

    this.inputs.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.reconcileBots();
  }

  // --- Role assignment ---

  private pickRole(preferredRole?: Role): Role {
    const counts = this.getRoleCounts();
    const desiredZookeepers = Math.max(
      1,
      Math.ceil(counts.monkeys / MONKEY_TO_ZOOKEEPER_RATIO)
    );
    const zookeeperSlotsOpen = counts.zookeepers < desiredZookeepers;

    if (preferredRole === "zookeeper" && zookeeperSlotsOpen) return "zookeeper";
    if (preferredRole === "monkey") return "monkey";
    if (counts.monkeys < 2) return "monkey";
    return zookeeperSlotsOpen ? "zookeeper" : "monkey";
  }

  private nextSpawn(role: Role) {
    if (role === "zookeeper") {
      const spawn =
        ZOOKEEPER_SPAWNS[this.zookeeperSpawnIndex % ZOOKEEPER_SPAWNS.length]!;
      this.zookeeperSpawnIndex += 1;
      return spawn;
    }
    const spawn =
      MONKEY_SPAWNS[this.monkeySpawnIndex % MONKEY_SPAWNS.length]!;
    this.monkeySpawnIndex += 1;
    return spawn;
  }

  private getRoleCounts() {
    let monkeys = 0;
    let zookeepers = 0;
    let liveMonkeys = 0;
    let liveZookeepers = 0;

    this.state.players.forEach((player: PlayerState) => {
      if (player.role === "zookeeper") {
        zookeepers += 1;
        if (!player.isBot) liveZookeepers += 1;
      } else {
        monkeys += 1;
        if (!player.isBot) liveMonkeys += 1;
      }
    });

    return { monkeys, zookeepers, liveMonkeys, liveZookeepers };
  }

  // --- Bot management ---

  private reconcileBots(): void {
    const counts = this.getRoleCounts();
    const desiredMonkeys = Math.max(TARGET_MONKEYS, counts.liveMonkeys);
    const desiredZookeepers = Math.max(
      TARGET_ZOOKEEPERS,
      counts.liveZookeepers
    );

    while (counts.monkeys < desiredMonkeys) {
      this.addBot("monkey");
      counts.monkeys += 1;
    }
    while (counts.zookeepers < desiredZookeepers) {
      this.addBot("zookeeper");
      counts.zookeepers += 1;
    }
    while (counts.monkeys > desiredMonkeys && this.removeBot("monkey")) {
      counts.monkeys -= 1;
    }
    while (
      counts.zookeepers > desiredZookeepers &&
      this.removeBot("zookeeper")
    ) {
      counts.zookeepers -= 1;
    }
  }

  private addBot(role: Role): void {
    const player = new PlayerState();
    const sessionId = `bot-${role}-${++this.botCounter}`;
    const spawn = this.nextSpawn(role);

    player.sessionId = sessionId;
    player.name =
      role === "zookeeper"
        ? `Keeper ${this.botCounter}`
        : `Monkey ${this.botCounter}`;
    player.role = role;
    player.isBot = true;
    player.connected = false;
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    player.facing = role === "zookeeper" ? 0 : Math.PI;

    this.state.players.set(sessionId, player);
  }

  private removeBot(role: Role): boolean {
    for (const [sessionId, player] of this.state.players) {
      if (!player.isBot || player.role !== role) continue;

      if (this.state.toy.holderSessionId === sessionId) {
        this.state.toy.holderSessionId = "";
        this.state.toy.x = TOY_HOME.x;
        this.state.toy.y = TOY_HOME.y;
        this.state.toy.z = TOY_HOME.z;
      }

      this.state.players.delete(sessionId);
      return true;
    }
    return false;
  }

  // --- Round lifecycle ---

  private respawnAllPlayers(): void {
    this.zookeeperSpawnIndex = 0;
    this.monkeySpawnIndex = 0;

    this.state.players.forEach((player: PlayerState) => {
      const spawn = this.nextSpawn(player.role as Role);
      player.x = spawn.x;
      player.y = spawn.y;
      player.z = spawn.z;
      player.facing = player.role === "zookeeper" ? 0 : Math.PI;
    });

    this.inputs.forEach((_value, key) => {
      this.inputs.set(key, { moveX: 0, moveZ: 0 });
    });
  }

  private declareWinner(winner: "monkeys" | "zookeepers"): void {
    if (this.state.winner) return;

    this.state.winner = winner;
    this.state.objectiveText =
      winner === "monkeys"
        ? "The monkeys kidnapped Puncheroni!"
        : "Zookeepers kept Puncheroni safe!";
    this.state.extractionProgress = winner === "monkeys" ? 1 : 0;
    this.roundResultRemainingMs = ROUND_RESULT_MS;

    const cycleLengthMs = SOCIAL_PHASE_MS + OPERATION_PHASE_MS;
    this.elapsedMs =
      Math.floor(this.elapsedMs / cycleLengthMs) * cycleLengthMs;
    this.state.phase = "social";
    this.state.phaseTimerMs = SOCIAL_PHASE_MS;
    this.previousPhase = "social";
  }

  private resetRound(): void {
    this.state.winner = "";
    this.state.objectiveText = "Protect Puncheroni!";
    this.state.extractionProgress = 0;
    this.roundResultRemainingMs = 0;
    this.state.punch.x = PUNCH_HOME.x;
    this.state.punch.y = PUNCH_HOME.y;
    this.state.punch.z = PUNCH_HOME.z;
    this.state.punch.stress = 18;
    this.state.punch.bondedToSessionId = "";
    this.state.punch.mood = "calm";
    this.state.toy.x = TOY_HOME.x;
    this.state.toy.y = TOY_HOME.y;
    this.state.toy.z = TOY_HOME.z;
    this.state.toy.holderSessionId = "";
    this.respawnAllPlayers();
    this.reconcileBots();
  }

  // --- Main update loop ---

  private update(deltaTimeMs: number): void {
    const deltaSeconds = deltaTimeMs / 1000;

    this.elapsedMs += deltaTimeMs;
    this.updatePhase();

    if (this.state.winner) {
      this.roundResultRemainingMs -= deltaTimeMs;
      if (this.roundResultRemainingMs <= 0) this.resetRound();
      return;
    }

    this.updatePlayers(deltaSeconds);
    this.updateBots(deltaSeconds);
    this.updateToyState();
    this.resolveZookeeperTags();
    this.updatePunch(deltaSeconds);
    this.updatePunchMood();
    this.updateObjectiveState();
  }

  private updatePhase(): void {
    const cycleLengthMs = SOCIAL_PHASE_MS + OPERATION_PHASE_MS;
    const cyclePositionMs = this.elapsedMs % cycleLengthMs;
    const phase: Phase =
      cyclePositionMs < SOCIAL_PHASE_MS ? "social" : "operation";
    const phaseRemainingMs =
      phase === "social"
        ? SOCIAL_PHASE_MS - cyclePositionMs
        : cycleLengthMs - cyclePositionMs;

    this.state.phase = phase;
    this.state.phaseTimerMs = phaseRemainingMs;

    if (
      !this.state.winner &&
      this.previousPhase === "operation" &&
      phase === "social"
    ) {
      this.declareWinner("zookeepers");
      return;
    }

    this.previousPhase = phase;
  }

  // --- Player movement ---

  private updatePlayers(deltaSeconds: number): void {
    this.state.players.forEach((player: PlayerState, sessionId: string) => {
      if (player.isBot) return;

      const input = this.inputs.get(sessionId);
      if (!input) return;

      const speed =
        PLAYER_SPEED +
        (player.role === "zookeeper" && this.state.phase === "operation"
          ? ZOOKEEPER_SPEED_BONUS
          : 0);

      player.x += input.moveX * speed * deltaSeconds;
      player.z += input.moveZ * speed * deltaSeconds;

      const clamped = clampWorldPosition(player);
      player.x = clamped.x;
      player.z = clamped.z;

      if (input.moveX !== 0 || input.moveZ !== 0) {
        player.facing = Math.atan2(input.moveX, input.moveZ);
      }
    });
  }

  // --- Bot AI ---

  private updateBots(deltaSeconds: number): void {
    this.state.players.forEach((player: PlayerState) => {
      if (!player.isBot) return;

      if (player.role === "monkey") {
        this.updateMonkeyBot(player, deltaSeconds);
      } else {
        this.updateZookeeperBot(player, deltaSeconds);
      }
    });
  }

  private updateMonkeyBot(player: PlayerState, deltaSeconds: number): void {
    // Monkeys are attackers: grab toy, lure Punch, extract
    if (!this.state.toy.holderSessionId) {
      // Go for the toy
      this.movePlayerToward(
        player,
        this.state.toy,
        PLAYER_SPEED * 0.92,
        deltaSeconds
      );
      return;
    }

    if (this.state.toy.holderSessionId === player.sessionId) {
      // I have the toy — go to Punch, then to extraction
      const target =
        distanceSquared(player, this.state.punch) >
        PUNCH_CALM_RANGE * PUNCH_CALM_RANGE
          ? this.state.punch
          : EXTRACTION_POINT;
      this.movePlayerToward(player, target, PLAYER_SPEED, deltaSeconds);
      return;
    }

    // Support: escort toward extraction or Punch
    const escortTarget =
      this.state.punch.bondedToSessionId === this.state.toy.holderSessionId
        ? EXTRACTION_POINT
        : this.state.punch;
    this.movePlayerToward(
      player,
      escortTarget,
      PLAYER_SPEED * 0.9,
      deltaSeconds
    );
  }

  private updateZookeeperBot(
    player: PlayerState,
    deltaSeconds: number
  ): void {
    // Zookeepers are defenders: patrol near Punch, intercept toy holder
    let target = this.state.punch as { x: number; y: number; z: number };

    if (this.state.phase === "operation" && this.state.toy.holderSessionId) {
      // Chase the monkey holding the toy
      target =
        this.state.players.get(this.state.toy.holderSessionId) ??
        this.state.punch;
    } else if (this.state.phase === "social") {
      // Patrol around the enclosure
      const seed = Number.parseInt(
        player.sessionId.split("-").at(-1) ?? "0",
        10
      );
      target =
        ZOOKEEPER_PATROL_POINTS[
          (seed + Math.floor(this.elapsedMs / 3500)) %
            ZOOKEEPER_PATROL_POINTS.length
        ]!;
    }

    this.movePlayerToward(
      player,
      target,
      PLAYER_SPEED + ZOOKEEPER_SPEED_BONUS * 0.85,
      deltaSeconds
    );
  }

  private movePlayerToward(
    player: PlayerState,
    target: { x: number; y: number; z: number },
    speed: number,
    deltaSeconds: number
  ): void {
    const moved = moveToward(player, target, speed * deltaSeconds);
    const dx = moved.x - player.x;
    const dz = moved.z - player.z;
    const clamped = clampWorldPosition(moved);

    player.x = clamped.x;
    player.z = clamped.z;

    if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
      player.facing = Math.atan2(dx, dz);
    }
  }

  // --- Toy state ---

  private updateToyState(): void {
    const { toy } = this.state;

    if (toy.holderSessionId) {
      const holder = this.state.players.get(toy.holderSessionId);
      if (!holder || holder.role !== "monkey") {
        toy.holderSessionId = "";
      } else {
        toy.x = holder.x + 0.5;
        toy.y = TOY_HOME.y;
        toy.z = holder.z - 0.3;
        return;
      }
    }

    // Find closest monkey to pick up toy
    let closestMonkey: PlayerState | undefined;
    let closestDistSq = TOY_PICKUP_RANGE * TOY_PICKUP_RANGE;

    this.state.players.forEach((player: PlayerState) => {
      if (player.role !== "monkey") return;
      const distSq = distanceSquared(player, toy);
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestMonkey = player;
      }
    });

    if (closestMonkey) {
      toy.holderSessionId = closestMonkey.sessionId;
      toy.x = closestMonkey.x + 0.5;
      toy.z = closestMonkey.z - 0.3;
      return;
    }

    toy.x = clamp(toy.x, -WORLD_HALF_EXTENT, WORLD_HALF_EXTENT);
    toy.z = clamp(toy.z, -WORLD_HALF_EXTENT, WORLD_HALF_EXTENT);
  }

  // --- Zookeeper tagging ---

  private resolveZookeeperTags(): void {
    if (!this.state.toy.holderSessionId) return;

    const holder = this.state.players.get(this.state.toy.holderSessionId);
    if (!holder) {
      this.state.toy.holderSessionId = "";
      return;
    }

    const tagRangeSq = ZOOKEEPER_TAG_RANGE * ZOOKEEPER_TAG_RANGE;
    let tagged = false;

    this.state.players.forEach((player: PlayerState) => {
      if (tagged || player.role !== "zookeeper") return;
      if (distanceSquared(player, holder) <= tagRangeSq) {
        tagged = true;
      }
    });

    if (!tagged) return;

    // Tag! Monkey drops the toy
    this.state.toy.holderSessionId = "";
    this.state.toy.x = holder.x - 0.6;
    this.state.toy.y = TOY_HOME.y;
    this.state.toy.z = holder.z + 0.35;
    this.state.punch.stress = clamp(this.state.punch.stress + 20, 0, 100);
  }

  // --- Punch AI ---

  private updatePunch(deltaSeconds: number): void {
    const { punch, toy } = this.state;
    let toyHolder: PlayerState | undefined;
    let nearestZookeeperDistSq = Number.POSITIVE_INFINITY;
    let nearestZookeeper: PlayerState | undefined;
    let nearestMonkeyDistSq = Number.POSITIVE_INFINITY;
    let nearestMonkey: PlayerState | undefined;

    if (toy.holderSessionId) {
      toyHolder = this.state.players.get(toy.holderSessionId);
    }

    this.state.players.forEach((player: PlayerState) => {
      const distSq = distanceSquared(player, punch);
      if (player.role === "zookeeper") {
        if (distSq < nearestZookeeperDistSq) {
          nearestZookeeperDistSq = distSq;
          nearestZookeeper = player;
        }
      } else {
        if (distSq < nearestMonkeyDistSq) {
          nearestMonkeyDistSq = distSq;
          nearestMonkey = player;
        }
      }
    });

    // Stress: increases near monkeys, decreases near zookeepers
    const monkeyStressRadiusSq =
      PUNCH_GUARD_STRESS_RANGE * PUNCH_GUARD_STRESS_RANGE;
    if (nearestMonkeyDistSq < monkeyStressRadiusSq) {
      punch.stress = clamp(punch.stress + 24 * deltaSeconds, 0, 100);
    } else if (
      nearestZookeeper &&
      nearestZookeeperDistSq < PUNCH_CALM_RANGE * PUNCH_CALM_RANGE
    ) {
      punch.stress = clamp(punch.stress - 15 * deltaSeconds, 0, 100);
    } else {
      punch.stress = clamp(punch.stress - 5 * deltaSeconds, 0, 100);
    }

    // Follow toy holder (can be tricked by monkeys!)
    if (toyHolder) {
      const followRangeSq = PUNCH_FOLLOW_RANGE * PUNCH_FOLLOW_RANGE;
      const calmRangeSq = PUNCH_CALM_RANGE * PUNCH_CALM_RANGE;
      const targetDistSq = distanceSquared(toyHolder, punch);

      punch.bondedToSessionId = toyHolder.sessionId;

      if (targetDistSq < followRangeSq) {
        if (targetDistSq < calmRangeSq) {
          punch.stress = clamp(punch.stress - 18 * deltaSeconds, 0, 100);
        }

        const speed = punch.stress > 60 ? PUNCH_RETREAT_SPEED : PUNCH_SPEED;
        const moved = moveToward(punch, toyHolder, speed * deltaSeconds);
        punch.x = moved.x;
        punch.y = PUNCH_HOME.y;
        punch.z = moved.z;
        return;
      }
    }

    punch.bondedToSessionId = "";

    // Flee from nearby monkeys when stressed
    if (
      nearestMonkey &&
      nearestMonkeyDistSq < monkeyStressRadiusSq &&
      punch.stress > 40
    ) {
      const escapeTarget = {
        x: punch.x + (punch.x - nearestMonkey.x),
        y: PUNCH_HOME.y,
        z: punch.z + (punch.z - nearestMonkey.z),
      };
      const moved = moveToward(
        punch,
        clampWorldPosition(escapeTarget),
        PUNCH_RETREAT_SPEED * deltaSeconds
      );
      punch.x = moved.x;
      punch.y = PUNCH_HOME.y;
      punch.z = moved.z;
      return;
    }

    // Drift back home
    const returned = moveToward(
      punch,
      PUNCH_HOME,
      PUNCH_SPEED * 0.65 * deltaSeconds
    );
    punch.x = returned.x;
    punch.y = PUNCH_HOME.y;
    punch.z = returned.z;
  }

  private updatePunchMood(): void {
    const { stress } = this.state.punch;
    if (stress < 20) this.state.punch.mood = "calm";
    else if (stress < 40) this.state.punch.mood = "curious";
    else if (stress < 60) this.state.punch.mood = "nervous";
    else if (stress < 80) this.state.punch.mood = "panicked";
    else this.state.punch.mood = "panicked";
  }

  // --- Objective tracking ---

  private updateObjectiveState(): void {
    const holder = this.state.toy.holderSessionId
      ? this.state.players.get(this.state.toy.holderSessionId)
      : undefined;

    if (!holder) {
      this.state.objectiveText =
        this.state.phase === "social"
          ? "Protect Puncheroni!"
          : "Stop the monkeys from stealing the toy!";
      this.state.extractionProgress = 0;
      return;
    }

    if (this.state.punch.bondedToSessionId !== holder.sessionId) {
      this.state.objectiveText = "A monkey has the toy! Intercept them!";
      this.state.extractionProgress = 0.35;
      return;
    }

    const holderDist = distanceTo(holder, EXTRACTION_POINT);
    const punchDist = distanceTo(this.state.punch, EXTRACTION_POINT);
    const progressRadius = EXTRACTION_RADIUS * 3.5;

    this.state.objectiveText =
      "Punch is following the monkey! Stop the kidnapping!";
    this.state.extractionProgress = clamp(
      (1 - holderDist / progressRadius + (1 - punchDist / progressRadius)) / 2,
      0,
      1
    );

    if (holderDist <= EXTRACTION_RADIUS && punchDist <= EXTRACTION_RADIUS) {
      this.declareWinner("monkeys");
    }
  }
}

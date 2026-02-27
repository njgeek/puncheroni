import { Room, Client } from 'colyseus';
import { GameState, Player } from '../state/GameState';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { KillSystem } from '../systems/KillSystem';
import { TaskSystem } from '../systems/TaskSystem';
import { MeetingSystem } from '../systems/MeetingSystem';
import { BalanceSystem } from '../systems/BalanceSystem';
import { PlayerInput } from '../../shared/types';
import {
  TICK_MS, ROUND_DURATION, LOBBY_MIN_PLAYERS, LOBBY_MAX_PLAYERS,
  COUNTDOWN_DURATION, RESULTS_DURATION, EMERGENCY_BUTTON, EMERGENCY_BUTTON_RANGE,
  PLAYER_NAME_ADJECTIVES, PLAYER_NAME_NOUNS,
} from '../../shared/constants';

export class GameRoom extends Room<{ state: GameState }> {
  private physics = new PhysicsSystem();
  private killSystem = new KillSystem();
  private taskSystem = new TaskSystem();
  private meetingSystem = new MeetingSystem();
  private balance = new BalanceSystem();

  private playerInputs = new Map<string, PlayerInput>();
  /** sessionId → list of assigned taskIds */
  private playerTaskAssignments = new Map<string, string[]>();
  /** 'sessionId-taskId' → accumulated ms of interaction */
  private taskProgress = new Map<string, number>();

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private phaseTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastTickTime = 0;
  /** Guard to prevent double-ending a round */
  private roundEnding = false;
  /** Tracks kills this round — impostor win only checks after first kill */
  private killsThisRound = 0;

  onCreate() {
    this.setState(new GameState());
    this.maxClients = LOBBY_MAX_PLAYERS;

    // ── Input (movement + one-shot actions) ───────────────────────────────────
    this.onMessage('input', (client: Client, input: PlayerInput) => {
      this.playerInputs.set(client.sessionId, input);
    });

    // ── Quick-phrase chat during meetings ─────────────────────────────────────
    this.onMessage('quickPhrase', (client: Client, data: { phrase: string }) => {
      if (this.state.phase !== 'meeting') return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.broadcast('quickPhrase', { name: player.name, phrase: data.phrase });
    });

    // ── Vote during meeting ───────────────────────────────────────────────────
    this.onMessage('vote', (client: Client, data: { targetId: string }) => {
      if (this.state.phase !== 'meeting' || this.state.meeting.phase !== 'voting') return;
      this.meetingSystem.processVote(
        this.state.meeting, client.sessionId, data.targetId, this.state.players,
      );
    });

    // ── Emergency button ──────────────────────────────────────────────────────
    this.onMessage('emergencyButton', (client: Client) => {
      if (this.state.phase !== 'active') return;
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive || player.isGhost || player.inVent) return;
      const dist = Math.sqrt(
        (player.x - EMERGENCY_BUTTON.x) ** 2 + (player.y - EMERGENCY_BUTTON.y) ** 2,
      );
      if (dist > EMERGENCY_BUTTON_RANGE) return;
      this.triggerMeeting(player.name, 'Emergency Button');
    });

    // ── Vent travel ───────────────────────────────────────────────────────────
    this.onMessage('ventTravel', (client: Client, data: { targetVentId: number }) => {
      if (this.state.phase !== 'active') return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.killSystem.travelVent(player, data.targetVentId);
    });

    this.lastTickTime = Date.now();
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
    console.log('GameRoom created');
  }

  onJoin(client: Client) {
    const player = new Player();
    player.id = client.sessionId;
    player.name = this.generateName();
    this.balance.initializePlayer(player);
    this.state.players.set(client.sessionId, player);
    console.log(`${player.name} joined — ${this.state.players.size} players`);

    if (this.state.phase === 'lobby' && this.state.players.size >= LOBBY_MIN_PLAYERS) {
      this.startCountdown();
    }

    client.send('welcome', { name: player.name });
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) console.log(`${player.name} left`);
    this.state.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);
    this.playerTaskAssignments.delete(client.sessionId);
  }

  onDispose() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.phaseTimeout) clearTimeout(this.phaseTimeout);
  }

  // ── Tick ──────────────────────────────────────────────────────────────────
  private tick() {
    const now = Date.now();
    const deltaMs = now - this.lastTickTime;
    this.lastTickTime = now;

    if (this.state.phase === 'active') {
      this.tickActive(deltaMs, now);
    } else if (this.state.phase === 'meeting') {
      this.tickMeeting(deltaMs);
    }
  }

  private tickActive(deltaMs: number, now: number) {
    // 1. Collect movements
    const movements = new Map<string, { dx: number; dy: number }>();
    this.playerInputs.forEach((input, id) => movements.set(id, { dx: input.dx, dy: input.dy }));

    // 2. Move players
    this.physics.applyMovement(this.state.players, movements, deltaMs);

    // 3. Process kill / report / use actions
    this.playerInputs.forEach((input, id) => {
      const player = this.state.players.get(id);
      if (!player) return;

      // Kill
      if (input.kill && player.alive && !player.isGhost) {
        const killed = this.killSystem.processKill(player, this.state.players, this.state.bodies, now);
        if (killed) this.killsThisRound++;
      }

      // Report
      if (input.report && player.alive && !player.isGhost) {
        const body = this.killSystem.processReport(player, this.state.bodies);
        if (body) {
          const bodyName = body.playerName;
          this.state.bodies.delete(body.id);
          this.triggerMeeting(player.name, bodyName);
          return; // Meeting started — stop processing this tick
        }
      }

      // Use — crewmate tasks
      if (input.use && player.role === 'crewmate' && player.alive && !player.isGhost) {
        const taskIds = this.playerTaskAssignments.get(id) ?? [];
        const completedId = this.taskSystem.processTaskInteraction(
          player, taskIds, this.state.tasks, deltaMs, this.taskProgress,
        );
        if (completedId) {
          player.tasksDone++;
          const t = this.state.tasks.get(completedId);
          if (t) t.done = true;
          const { total, done } = this.taskSystem.getTotalAndDone(this.state.players);
          this.state.taskTotal = total;
          this.state.tasksDone = done;
        }
      }

      // Use — impostor vent
      if (input.use && player.role === 'impostor' && player.alive && !player.isGhost) {
        const result = this.killSystem.processVentUse(player);
        if (result && result.entered && result.connections) {
          const client = this.clients.find(c => c.sessionId === id);
          client?.send('ventOptions', {
            ventId: result.ventId,
            connections: result.connections.map(v => ({ id: v.id, x: v.x, y: v.y })),
          });
        }
      }
    });

    // 4. Clear one-shot inputs
    this.playerInputs.forEach((input) => {
      input.kill = false;
      input.report = false;
      input.vote = '';
    });

    // 5. Round timer
    this.state.roundTimer -= deltaMs / 1000;

    // 6. Win conditions
    if (!this.roundEnding) {
      if (this.checkImpostorWin()) return;
      if (this.checkCrewTaskWin()) return;
    }
  }

  private tickMeeting(deltaMs: number) {
    const result = this.meetingSystem.tick(this.state.meeting, this.state.players, deltaMs);

    if (result === 'discussion_end') {
      this.broadcast('meetingPhaseChange', { phase: 'voting' });
    } else if (result === 'voting_end') {
      this.broadcast('voteResult', {
        ejectedName: this.state.meeting.ejectedName,
        wasImpostor: this.state.meeting.ejectedWasImpostor,
        ejectedRole: this.state.meeting.ejectedRole,
      });
    } else if (result === 'result_end') {
      this.meetingSystem.endMeeting(this.state);
      this.state.phase = 'active';
      this.lastTickTime = Date.now();
      if (!this.roundEnding) {
        this.checkImpostorWin(true);
        this.checkCrewVoteWin();
      }
    }
  }

  // ── Meeting trigger ───────────────────────────────────────────────────────
  private triggerMeeting(reporterName: string, bodyName: string) {
    if (this.state.phase !== 'active') return;
    this.state.phase = 'meeting';
    this.meetingSystem.startMeeting(this.state, reporterName, bodyName);
    this.broadcast('meetingStart', {
      reporterName,
      bodyName,
      discussionTime: 30,
    });
  }

  // ── Phase transitions ─────────────────────────────────────────────────────
  private startCountdown() {
    if (this.state.phase === 'countdown') return;
    this.state.phase = 'countdown';
    this.state.countdown = COUNTDOWN_DURATION;

    const iv = setInterval(() => {
      this.state.countdown--;
      if (this.state.countdown <= 0) {
        clearInterval(iv);
        this.startRound();
      }
    }, 1000);
  }

  private startRound() {
    this.state.phase = 'active';
    this.state.roundTimer = ROUND_DURATION;
    this.state.winner = '';
    this.state.bodies.clear();
    this.state.meeting.active = false;
    this.roundEnding = false;
    this.killsThisRound = 0;
    this.playerTaskAssignments.clear();
    this.taskProgress.clear();

    // Reset + spawn players
    this.state.players.forEach((p: Player) => this.balance.initializePlayer(p));

    // Assign roles
    this.balance.assignRoles(this.state.players);

    // Initialize tasks
    this.taskSystem.initializeTasks(this.state.tasks);

    // Assign tasks to crewmates
    const assignments = this.taskSystem.assignTasks(this.state.players);
    assignments.forEach((taskIds, pid) => this.playerTaskAssignments.set(pid, taskIds));

    // Update global task counts
    const { total, done } = this.taskSystem.getTotalAndDone(this.state.players);
    this.state.taskTotal = total;
    this.state.tasksDone = done;

    // Send each player their private role reveal
    this.state.players.forEach((player: Player, id: string) => {
      const client = this.clients.find(c => c.sessionId === id);
      const taskIds = this.playerTaskAssignments.get(id) ?? [];
      const myTasks = taskIds.map(tid => {
        const t = this.state.tasks.get(tid);
        return t ? { id: t.id, name: t.name, room: t.room, x: t.x, y: t.y } : null;
      }).filter(Boolean);

      client?.send('roleReveal', {
        role: player.role,
        tasks: myTasks,
        impostorNames: player.role === 'impostor' ? this.getImpostorNames() : [],
      });
    });

    this.lastTickTime = Date.now();
    console.log('Round started!');
  }

  private endRound(winner: 'crewmate' | 'impostor', reason: string) {
    if (this.state.phase === 'results' || this.roundEnding) return;
    this.roundEnding = true;
    this.state.phase = 'results';
    this.state.winner = winner;

    this.broadcast('gameOver', {
      winner,
      reason,
      tasksDone: this.state.tasksDone,
      tasksTotal: this.state.taskTotal,
    });

    console.log(`Game over! ${winner} wins — ${reason}`);

    this.phaseTimeout = setTimeout(() => {
      if (this.state.players.size >= LOBBY_MIN_PLAYERS) {
        this.startCountdown();
      } else {
        this.state.phase = 'lobby';
      }
    }, RESULTS_DURATION * 1000);
  }

  // ── Win checks ────────────────────────────────────────────────────────────
  private checkImpostorWin(afterEjection = false): boolean {
    // Only check after at least one kill or ejection — prevents instant win at round start
    if (!afterEjection && this.killsThisRound === 0) return false;
    let impostors = 0;
    let crewAlive = 0;
    this.state.players.forEach((p: Player) => {
      if (p.isGhost) return;
      if (p.role === 'impostor') impostors++;
      else crewAlive++;
    });
    if (impostors > 0 && impostors >= crewAlive) {
      this.endRound('impostor', 'Impostors outnumber crewmates');
      return true;
    }
    return false;
  }

  private checkCrewTaskWin(): boolean {
    const { total, done } = this.taskSystem.getTotalAndDone(this.state.players);
    if (total > 0 && done >= total) {
      this.endRound('crewmate', 'All tasks completed');
      return true;
    }
    return false;
  }

  private checkCrewVoteWin(): boolean {
    let impostors = 0;
    this.state.players.forEach((p: Player) => {
      if (!p.isGhost && p.role === 'impostor') impostors++;
    });
    if (impostors === 0) {
      this.endRound('crewmate', 'All impostors ejected');
      return true;
    }
    return false;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private getImpostorNames(): string[] {
    const names: string[] = [];
    this.state.players.forEach((p: Player) => {
      if (p.role === 'impostor') names.push(p.name);
    });
    return names;
  }

  private generateName(): string {
    const adj = PLAYER_NAME_ADJECTIVES[Math.floor(Math.random() * PLAYER_NAME_ADJECTIVES.length)];
    const noun = PLAYER_NAME_NOUNS[Math.floor(Math.random() * PLAYER_NAME_NOUNS.length)];
    const num = Math.floor(Math.random() * 99) + 1;
    return `${adj} ${noun} #${num}`;
  }
}

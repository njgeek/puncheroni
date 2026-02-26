import { Room, Client } from 'colyseus';
import { GameState, Player, PunchVIP } from '../state/GameState';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { BalanceSystem } from '../systems/BalanceSystem';
import { PlayerInput, GamePhase, RoundStats, Team } from '../../shared/types';
import {
  TICK_MS, ROUND_DURATION, LOBBY_MIN_PLAYERS, LOBBY_MAX_PLAYERS,
  COUNTDOWN_DURATION, RESULTS_DURATION, PUNCH_HP, PUNCH_X, PUNCH_Y,
  PLAYER_NAME_ADJECTIVES, PLAYER_NAME_NOUNS,
} from '../../shared/constants';

export class GameRoom extends Room<{ state: GameState }> {
  private physics = new PhysicsSystem();
  private combat = new CombatSystem();
  private balance = new BalanceSystem();
  private playerInputs = new Map<string, PlayerInput>();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private phaseTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastTickTime = 0;

  onCreate() {
    this.setState(new GameState());
    this.maxClients = LOBBY_MAX_PLAYERS;

    this.state.punch.x = PUNCH_X;
    this.state.punch.y = PUNCH_Y;
    this.state.punch.hp = PUNCH_HP;
    this.state.punch.maxHp = PUNCH_HP;
    this.state.punch.isHome = true;
    this.state.punch.isKidnapped = false;
    this.state.punch.carriedBy = '';

    this.onMessage('input', (client, input: PlayerInput) => {
      this.playerInputs.set(client.sessionId, input);
    });

    this.onMessage('teamPreference', (client, data: { team: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (player && (data.team === 'defender' || data.team === 'attacker')) {
        player.preferredTeam = data.team;

        // During lobby phase, try to swap immediately
        if (this.state.phase === 'lobby') {
          if (data.team !== player.team) {
            this.balance.trySwapTeam(player, this.state.players);
          }
          client.send('teamUpdate', { team: player.team });
          this.broadcastTeamCounts();
        }
      }
    });

    this.lastTickTime = Date.now();
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);

    console.log('GameRoom created');
  }

  onJoin(client: Client) {
    const player = new Player();
    player.id = client.sessionId;
    player.name = this.generateName();

    const team = this.balance.assignTeam(this.state.players);
    this.balance.initializePlayer(player, team);

    this.state.players.set(client.sessionId, player);

    console.log(`${player.name} (${player.team}) joined — ${this.state.players.size} players`);

    if (this.state.phase === 'lobby' && this.state.players.size >= LOBBY_MIN_PLAYERS) {
      this.startCountdown();
    }

    client.send('welcome', { name: player.name, team: player.team });
    this.broadcastTeamCounts();
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      console.log(`${player.name} left`);

      // Drop Punch if carrying
      if (player.isCarryingPunch || player.isCarryingPunchHome) {
        this.combat.dropPunch(player, this.state.punch, Date.now());
      }
    }
    this.state.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);
    this.broadcastTeamCounts();
  }

  onDispose() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.phaseTimeout) clearTimeout(this.phaseTimeout);
  }

  private tick() {
    const now = Date.now();
    const deltaMs = now - this.lastTickTime;
    this.lastTickTime = now;

    if (this.state.phase !== 'active') return;

    // 1. Collect movement inputs
    const movements = new Map<string, { dx: number; dy: number }>();
    this.playerInputs.forEach((input, id) => {
      movements.set(id, { dx: input.dx, dy: input.dy });
    });

    // 2. Apply rubber-banding
    const attackerBuff = this.balance.applyRubberBanding(
      this.state.players, this.state.punch, this.state.roundTimer
    );
    this.combat.setAttackerDamageBuff(attackerBuff);

    // 2b. Apply carrier speed penalty
    this.state.players.forEach((player: Player) => {
      const mult = this.combat.getCarrierSpeedMultiplier(player);
      if (mult < 1) {
        player.speed *= mult;
      }
    });

    // 3. Apply movement
    this.physics.applyMovement(this.state.players, movements, deltaMs);

    // 4. Process attacks and dashes
    this.playerInputs.forEach((input, id) => {
      const player = this.state.players.get(id);
      if (!player) return;

      if (input.attack) {
        this.combat.processAttack(
          player, input.attackAngle, now,
          this.state.players, this.state.punch
        );
      }

      if (input.dash) {
        this.combat.processDash(player, input.attackAngle, now);
      }
    });

    // 4b. Process dash tackles (dashing into enemies deals damage)
    this.combat.processDashTackles(this.state.players, this.state.punch, now);

    // 5. Clear one-shot inputs
    this.playerInputs.forEach((input) => {
      input.attack = false;
      input.dash = false;
    });

    // 6. Eliminations & respawns
    const eliminations = this.combat.processEliminations(this.state.players, this.state.punch, now);
    for (const elim of eliminations) {
      this.broadcast('playerEliminated', elim);
    }
    this.combat.processRespawns(this.state.players, now);

    // 7. Defender healing + Punch self-heal (only when home)
    this.combat.processDefenderHealing(this.state.players, this.state.punch, deltaMs);
    this.combat.processPunchSelfHeal(this.state.punch, this.state.players, deltaMs);

    // 8. Punch knockback (only when home)
    this.combat.processPunchKnockback(this.state.punch, this.state.players, now);

    // === KIDNAP PHASE ===
    // 9. Attackers try to grab Punch
    this.combat.processKidnapAttempts(this.state.players, this.state.punch, now);

    // 10. Defenders try to pick up dropped Punch
    this.combat.processDefenderRescue(this.state.players, this.state.punch, now);

    // 11. Update Punch position to follow carrier
    this.combat.updateCarriedPunchPosition(this.state.players, this.state.punch);

    // 12. Check if defender returned Punch home
    if (this.combat.checkPunchReturnedHome(this.state.players, this.state.punch)) {
      this.broadcast('punchRescued', {});
      console.log('Punch rescued and returned home!');
    }

    // 13. Check if attacker reached extraction zone — ATTACKERS WIN
    if (this.combat.checkExtractionZones(this.state.players, this.state.punch)) {
      this.endRound(Team.Attacker);
      return;
    }

    // 14. Update round timer
    this.state.roundTimer -= deltaMs / 1000;

    // 15. Check time-based win (defenders win if timer expires)
    if (this.state.roundTimer <= 0) {
      this.endRound(Team.Defender);
    }

    // Update attacking visual flag (persists for ATTACK_VISUAL_DURATION ms)
    this.state.players.forEach((p: Player) => {
      if (p.isAttacking && now >= p.attackEndTime) {
        p.isAttacking = false;
      }
    });
  }

  private startCountdown() {
    // Apply team preferences before round starts
    this.balance.applyPreferences(this.state.players);

    // Re-send welcome with final team assignment
    this.state.players.forEach((player: Player, id: string) => {
      const client = this.clients.find(c => c.sessionId === id);
      client?.send('welcome', { name: player.name, team: player.team });
    });

    this.state.phase = 'countdown';
    this.state.countdown = COUNTDOWN_DURATION;

    const countdownInterval = setInterval(() => {
      this.state.countdown--;
      if (this.state.countdown <= 0) {
        clearInterval(countdownInterval);
        this.startRound();
      }
    }, 1000);
  }

  private startRound() {
    this.state.phase = 'active';
    this.state.roundTimer = ROUND_DURATION;
    this.state.roundNumber++;
    this.state.winningTeam = '';

    // Reset Punch
    this.state.punch.x = PUNCH_X;
    this.state.punch.y = PUNCH_Y;
    this.state.punch.hp = PUNCH_HP;
    this.state.punch.maxHp = PUNCH_HP;
    this.state.punch.lastKnockbackTime = Date.now();
    this.state.punch.isKidnapped = false;
    this.state.punch.carriedBy = '';
    this.state.punch.isHome = true;
    this.state.punch.dropImmuneUntil = 0;

    // Reset all players
    this.state.players.forEach((player: Player) => {
      this.balance.initializePlayer(
        player,
        player.team === 'defender' ? Team.Defender : Team.Attacker
      );
    });

    this.lastTickTime = Date.now();
    console.log(`Round ${this.state.roundNumber} started!`);
  }

  private endRound(winner: Team) {
    this.state.phase = 'results';
    this.state.winningTeam = winner;

    let mvpId = '';
    let mvpName = '';
    let mvpDamage = 0;
    let defenderKills = 0;
    let attackerKills = 0;

    this.state.players.forEach((p: Player) => {
      if (p.damageDealt > mvpDamage) {
        mvpId = p.id;
        mvpName = p.name;
        mvpDamage = p.damageDealt;
      }
      if (p.team === 'defender') defenderKills += p.kills;
      else attackerKills += p.kills;
    });

    const stats: RoundStats = {
      winningTeam: winner,
      roundDuration: ROUND_DURATION - this.state.roundTimer,
      mvpId,
      mvpName,
      mvpDamage,
      defenderKills,
      attackerKills,
      punchHpRemaining: this.state.punch.hp,
    };

    this.broadcast('roundResults', stats);

    const winMsg = winner === Team.Attacker ? 'KIDNAPPED' : 'PROTECTED';
    console.log(`Round ${this.state.roundNumber} — Punch was ${winMsg}! ${winner} wins!`);

    this.phaseTimeout = setTimeout(() => {
      if (this.state.players.size >= LOBBY_MIN_PLAYERS) {
        this.balance.swapTeams(this.state.players);
        this.startCountdown();
      } else {
        this.state.phase = 'lobby';
      }
    }, RESULTS_DURATION * 1000);
  }

  private broadcastTeamCounts() {
    let friends = 0;
    let foes = 0;
    this.state.players.forEach((p: Player) => {
      if (p.team === 'defender') friends++;
      else foes++;
    });
    this.broadcast('teamCounts', { friends, foes });
  }

  private generateName(): string {
    const adj = PLAYER_NAME_ADJECTIVES[Math.floor(Math.random() * PLAYER_NAME_ADJECTIVES.length)];
    const noun = PLAYER_NAME_NOUNS[Math.floor(Math.random() * PLAYER_NAME_NOUNS.length)];
    const num = Math.floor(Math.random() * 99) + 1;
    return `${adj} ${noun} #${num}`;
  }
}

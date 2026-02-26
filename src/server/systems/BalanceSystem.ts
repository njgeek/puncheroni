import { Player, PunchVIP } from '../state/GameState';
import { MapSchema } from '@colyseus/schema';
import {
  DEFENDER_RATIO, DEFENDER_HP, DEFENDER_SPEED, ATTACKER_HP, ATTACKER_SPEED,
  RUBBER_BAND_KIDNAPPED_DEFENDER_SPEED_BUFF,
  RUBBER_BAND_TIME_THRESHOLD,
  RUBBER_BAND_ATTACKER_DAMAGE_BUFF, TEAM_SWAP_RATIO,
  SAFE_SPAWN_POINTS,
} from '../../shared/constants';
import { Team } from '../../shared/types';

export class BalanceSystem {
  assignTeam(players: MapSchema<Player>, preference?: string): Team {
    let defenders = 0;
    let attackers = 0;
    players.forEach((p: Player) => {
      if (p.team === 'defender') defenders++;
      else attackers++;
    });

    const total = defenders + attackers + 1;
    const targetDefenders = Math.ceil(total * DEFENDER_RATIO);

    // Honor preference if within 60/40 balance limits
    if (preference === 'defender' || preference === 'attacker') {
      const maxDefenders = Math.ceil(total * 0.6);
      const minDefenders = Math.floor(total * 0.4);
      if (preference === 'defender' && defenders < maxDefenders) return Team.Defender;
      if (preference === 'attacker' && defenders >= minDefenders) return Team.Attacker;
    }

    return defenders < targetDefenders ? Team.Defender : Team.Attacker;
  }

  applyPreferences(players: MapSchema<Player>) {
    // Collect players who want to swap
    const wantDefender: Player[] = [];
    const wantAttacker: Player[] = [];
    players.forEach((p: Player) => {
      if (p.preferredTeam === 'defender' && p.team === 'attacker') wantDefender.push(p);
      if (p.preferredTeam === 'attacker' && p.team === 'defender') wantAttacker.push(p);
    });

    // Try direct swaps first (swap pairs maintain balance)
    const swapCount = Math.min(wantDefender.length, wantAttacker.length);
    for (let i = 0; i < swapCount; i++) {
      this.initializePlayer(wantDefender[i], Team.Defender);
      this.initializePlayer(wantAttacker[i], Team.Attacker);
    }

    // For remaining unmatched preferences, check if we can move them within 60/40 limits
    let defenders = 0;
    let attackers = 0;
    players.forEach((p: Player) => {
      if (p.team === 'defender') defenders++;
      else attackers++;
    });
    const total = defenders + attackers;
    const maxDefenders = Math.ceil(total * 0.6);
    const minDefenders = Math.floor(total * 0.4);

    // Move remaining who want defender (if room)
    for (let i = swapCount; i < wantDefender.length; i++) {
      if (defenders < maxDefenders) {
        this.initializePlayer(wantDefender[i], Team.Defender);
        defenders++;
        attackers--;
      }
    }

    // Move remaining who want attacker (if room)
    for (let i = swapCount; i < wantAttacker.length; i++) {
      if (defenders > minDefenders) {
        this.initializePlayer(wantAttacker[i], Team.Attacker);
        defenders--;
        attackers++;
      }
    }
  }

  initializePlayer(player: Player, team: Team) {
    player.team = team;
    if (team === Team.Defender) {
      player.hp = DEFENDER_HP;
      player.maxHp = DEFENDER_HP;
      player.speed = DEFENDER_SPEED;
    } else {
      player.hp = ATTACKER_HP;
      player.maxHp = ATTACKER_HP;
      player.speed = ATTACKER_SPEED;
    }
    player.alive = true;
    player.damageDealt = 0;
    player.kills = 0;
    player.isDashing = false;
    player.isCarryingPunch = false;
    player.isCarryingPunchHome = false;

    // Spawn at a safe spawn point (away from walls)
    const sp = SAFE_SPAWN_POINTS[Math.floor(Math.random() * SAFE_SPAWN_POINTS.length)];
    player.x = sp.x;
    player.y = sp.y;
  }

  applyRubberBanding(
    players: MapSchema<Player>,
    punch: PunchVIP,
    roundTimer: number,
  ): number {
    let attackerDamageBuff = 0;

    players.forEach((player: Player) => {
      if (player.team === 'defender') {
        player.speed = DEFENDER_SPEED;
      } else {
        player.speed = ATTACKER_SPEED;
      }
    });

    // If Punch is kidnapped, buff defenders so they can chase
    if (punch.isKidnapped || (punch.carriedBy && !punch.isHome)) {
      players.forEach((player: Player) => {
        if (player.team === 'defender') {
          player.speed = DEFENDER_SPEED * (1 + RUBBER_BAND_KIDNAPPED_DEFENDER_SPEED_BUFF);
        }
      });
    }

    // If time running out and Punch is still home, buff attackers
    if (roundTimer < RUBBER_BAND_TIME_THRESHOLD && punch.isHome) {
      attackerDamageBuff = RUBBER_BAND_ATTACKER_DAMAGE_BUFF;
    }

    return attackerDamageBuff;
  }

  trySwapTeam(player: Player, players: MapSchema<Player>): boolean {
    const targetTeam = player.team === 'defender' ? Team.Attacker : Team.Defender;
    let defenders = 0;
    let attackers = 0;
    players.forEach((p: Player) => {
      if (p.team === 'defender') defenders++;
      else attackers++;
    });
    const total = defenders + attackers;
    const maxDefenders = Math.ceil(total * 0.6);
    const minDefenders = Math.floor(total * 0.4);

    if (targetTeam === Team.Defender && defenders >= maxDefenders) return false;
    if (targetTeam === Team.Attacker && defenders <= minDefenders) return false;

    this.initializePlayer(player, targetTeam);
    return true;
  }

  swapTeams(players: MapSchema<Player>) {
    const playerIds: string[] = [];
    players.forEach((_: Player, id: string) => playerIds.push(id));

    const swapCount = Math.max(1, Math.floor(playerIds.length * TEAM_SWAP_RATIO));
    const shuffled = playerIds.sort(() => Math.random() - 0.5);
    const toSwap = shuffled.slice(0, swapCount);

    for (const id of toSwap) {
      const player = players.get(id);
      if (!player) continue;
      const newTeam = player.team === 'defender' ? Team.Attacker : Team.Defender;
      this.initializePlayer(player, newTeam);
    }

    // Re-balance remaining
    let defenders = 0;
    let attackers = 0;
    players.forEach((p: Player) => {
      if (p.team === 'defender') defenders++;
      else attackers++;
    });
    const total = defenders + attackers;
    const targetDefenders = Math.ceil(total * DEFENDER_RATIO);

    if (defenders < targetDefenders) {
      let needed = targetDefenders - defenders;
      players.forEach((p: Player) => {
        if (needed <= 0) return;
        if (p.team === 'attacker' && !toSwap.includes(p.id)) {
          this.initializePlayer(p, Team.Defender);
          needed--;
        }
      });
    } else if (defenders > targetDefenders) {
      let excess = defenders - targetDefenders;
      players.forEach((p: Player) => {
        if (excess <= 0) return;
        if (p.team === 'defender' && !toSwap.includes(p.id)) {
          this.initializePlayer(p, Team.Attacker);
          excess--;
        }
      });
    }
  }
}

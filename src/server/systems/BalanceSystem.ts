import { Player, PunchVIP } from '../state/GameState';
import { MapSchema } from '@colyseus/schema';
import {
  DEFENDER_RATIO, DEFENDER_HP, DEFENDER_SPEED, ATTACKER_HP, ATTACKER_SPEED,
  RUBBER_BAND_KIDNAPPED_DEFENDER_SPEED_BUFF,
  RUBBER_BAND_TIME_THRESHOLD,
  RUBBER_BAND_ATTACKER_DAMAGE_BUFF, TEAM_SWAP_RATIO,
  PLAYER_RADIUS, ARENA_WIDTH, ARENA_HEIGHT,
} from '../../shared/constants';
import { Team } from '../../shared/types';

export class BalanceSystem {
  assignTeam(players: MapSchema<Player>): Team {
    let defenders = 0;
    let attackers = 0;
    players.forEach((p: Player) => {
      if (p.team === 'defender') defenders++;
      else attackers++;
    });

    const total = defenders + attackers + 1;
    const targetDefenders = Math.ceil(total * DEFENDER_RATIO);
    return defenders < targetDefenders ? Team.Defender : Team.Attacker;
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
    player.barrierCount = 0;
    player.damageDealt = 0;
    player.kills = 0;
    player.isDashing = false;
    player.isCarryingPunch = false;
    player.isCarryingPunchHome = false;

    // Spawn at edge
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: player.x = PLAYER_RADIUS + 20; player.y = Math.random() * ARENA_HEIGHT; break;
      case 1: player.x = ARENA_WIDTH - PLAYER_RADIUS - 20; player.y = Math.random() * ARENA_HEIGHT; break;
      case 2: player.x = Math.random() * ARENA_WIDTH; player.y = PLAYER_RADIUS + 20; break;
      case 3: player.x = Math.random() * ARENA_WIDTH; player.y = ARENA_HEIGHT - PLAYER_RADIUS - 20; break;
    }
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

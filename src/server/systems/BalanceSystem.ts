import { Player } from '../state/GameState';
import { MapSchema } from '@colyseus/schema';
import { SAFE_SPAWN_POINTS, PLAYER_SPEED, getImpostorCount } from '../../shared/constants';

export class BalanceSystem {
  /** Assign impostor / crewmate roles based on player count. */
  assignRoles(players: MapSchema<Player>) {
    const ids: string[] = [];
    players.forEach((_: Player, id: string) => ids.push(id));

    const impostorCount = getImpostorCount(ids.length);
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    const impostors = new Set(shuffled.slice(0, impostorCount));

    players.forEach((p: Player, id: string) => {
      p.role = impostors.has(id) ? 'impostor' : 'crewmate';
      p.isGhost = false;
      p.inVent = false;
      p.votedFor = '';
      // Impostors get a 10 s grace period before they can kill
      p.killCooldownEnd = impostors.has(id) ? Date.now() + 10000 : 0;
    });
  }

  /** Set player back to default alive state at a safe spawn. */
  initializePlayer(player: Player) {
    player.alive = true;
    player.isGhost = false;
    player.inVent = false;
    player.speed = PLAYER_SPEED;
    player.votedFor = '';
    player.tasksDone = 0;
    player.tasksTotal = 0;
    player.killCooldownEnd = 0;

    const sp = SAFE_SPAWN_POINTS[Math.floor(Math.random() * SAFE_SPAWN_POINTS.length)];
    player.x = sp.x;
    player.y = sp.y;
  }
}

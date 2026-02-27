import { Player } from '../state/GameState';
import { MapSchema } from '@colyseus/schema';
import { ARENA_WIDTH, ARENA_HEIGHT, PLAYER_RADIUS, MAP_WALLS } from '../../shared/constants';

export class PhysicsSystem {
  applyMovement(
    players: MapSchema<Player>,
    inputs: Map<string, { dx: number; dy: number }>,
    deltaMs: number,
  ) {
    const deltaSec = deltaMs / 1000;

    players.forEach((player: Player, id: string) => {
      // Ghosts float freely (no collision), living players use physics
      if (player.isGhost) {
        const input = inputs.get(id);
        if (input) {
          const mag = Math.sqrt(input.dx ** 2 + input.dy ** 2);
          if (mag > 0) {
            player.x += (input.dx / mag) * player.speed * deltaSec * 60;
            player.y += (input.dy / mag) * player.speed * deltaSec * 60;
          }
        }
        player.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, player.x));
        player.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, player.y));
        return;
      }

      if (!player.alive || player.inVent) return;

      const input = inputs.get(id);
      if (input) {
        const mag = Math.sqrt(input.dx ** 2 + input.dy ** 2);
        if (mag > 0) {
          player.x += (input.dx / mag) * player.speed * deltaSec * 60;
          player.y += (input.dy / mag) * player.speed * deltaSec * 60;
        }
      }

      // Arena bounds
      player.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, player.x));
      player.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, player.y));

      // Wall collisions
      for (const wall of MAP_WALLS) {
        this.resolveCircleRect(player, wall.x, wall.y, wall.w, wall.h);
      }
    });

    // Soft player–player separation (living non-vent players only)
    this.resolvePlayerCollisions(players);
  }

  private resolvePlayerCollisions(players: MapSchema<Player>) {
    const arr: Player[] = [];
    players.forEach((p: Player) => {
      if (p.alive && !p.isGhost && !p.inVent) arr.push(p);
    });

    const minDist = PLAYER_RADIUS * 2;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist > 0) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          a.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, a.x));
          a.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, a.y));
          b.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, b.x));
          b.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, b.y));
        }
      }
    }
  }

  private resolveCircleRect(
    player: Player,
    rx: number, ry: number, rw: number, rh: number,
  ) {
    const cx = Math.max(rx, Math.min(rx + rw, player.x));
    const cy = Math.max(ry, Math.min(ry + rh, player.y));
    const dx = player.x - cx;
    const dy = player.y - cy;
    const distSq = dx * dx + dy * dy;

    if (distSq < PLAYER_RADIUS * PLAYER_RADIUS && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const overlap = PLAYER_RADIUS - dist;
      player.x += (dx / dist) * overlap;
      player.y += (dy / dist) * overlap;
    } else if (distSq === 0) {
      const toLeft = player.x - rx;
      const toRight = rx + rw - player.x;
      const toTop = player.y - ry;
      const toBottom = ry + rh - player.y;
      const minD = Math.min(toLeft, toRight, toTop, toBottom);
      if (minD === toLeft) player.x = rx - PLAYER_RADIUS;
      else if (minD === toRight) player.x = rx + rw + PLAYER_RADIUS;
      else if (minD === toTop) player.y = ry - PLAYER_RADIUS;
      else player.y = ry + rh + PLAYER_RADIUS;
    }
  }
}

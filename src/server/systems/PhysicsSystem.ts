import { Player } from '../state/GameState';
import { MapSchema } from '@colyseus/schema';
import {
  ARENA_WIDTH, ARENA_HEIGHT, PLAYER_RADIUS, PUNCH_X, PUNCH_Y,
  PUNCH_ZONE_RADIUS, DASH_SPEED, MAP_WALLS,
} from '../../shared/constants';

export class PhysicsSystem {
  applyMovement(
    players: MapSchema<Player>,
    inputs: Map<string, { dx: number; dy: number }>,
    deltaMs: number
  ) {
    const deltaSec = deltaMs / 1000;

    players.forEach((player, id) => {
      if (!player.alive) return;

      // If dashing, apply dash movement with sub-stepping (prevents wall clipping)
      if (player.isDashing) {
        if (Date.now() < player.dashEndTime) {
          const totalDx = player.dashDx * DASH_SPEED * deltaSec * 60;
          const totalDy = player.dashDy * DASH_SPEED * deltaSec * 60;
          const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

          // Sub-step: move in increments of PLAYER_RADIUS to prevent clipping through walls
          const steps = Math.max(1, Math.ceil(totalDist / PLAYER_RADIUS));
          const stepDx = totalDx / steps;
          const stepDy = totalDy / steps;

          for (let s = 0; s < steps; s++) {
            player.x += stepDx;
            player.y += stepDy;

            // Clamp + wall check after each sub-step
            player.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, player.x));
            player.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, player.y));
            for (const wall of MAP_WALLS) {
              this.resolveCircleRect(player, wall.x, wall.y, wall.w, wall.h);
            }
          }
        } else {
          player.isDashing = false;
        }
      } else {
        const input = inputs.get(id);
        if (input) {
          const mag = Math.sqrt(input.dx * input.dx + input.dy * input.dy);
          if (mag > 0) {
            const nx = input.dx / mag;
            const ny = input.dy / mag;
            player.x += nx * player.speed * deltaSec * 60;
            player.y += ny * player.speed * deltaSec * 60;
          }
        }
      }

      // Clamp to arena
      player.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, player.x));
      player.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, player.y));

      // Wall collision — push player out of walls
      for (const wall of MAP_WALLS) {
        this.resolveCircleRect(player, wall.x, wall.y, wall.w, wall.h);
      }

      // Defenders can't enter Punch zone center
      const dxP = player.x - PUNCH_X;
      const dyP = player.y - PUNCH_Y;
      const distP = Math.sqrt(dxP * dxP + dyP * dyP);
      if (distP < PUNCH_ZONE_RADIUS - 20 && player.team === 'defender') {
        const angle = Math.atan2(dyP, dxP);
        player.x = PUNCH_X + Math.cos(angle) * (PUNCH_ZONE_RADIUS - 20);
        player.y = PUNCH_Y + Math.sin(angle) * (PUNCH_ZONE_RADIUS - 20);
      }
    });

    // Player-to-player collision (soft push — prevents stacking)
    this.resolvePlayerCollisions(players);
  }

  /** Soft push: overlapping players push each other apart */
  private resolvePlayerCollisions(players: MapSchema<Player>) {
    const ids: string[] = [];
    const playerArr: Player[] = [];
    players.forEach((p, id) => {
      if (p.alive) {
        ids.push(id);
        playerArr.push(p);
      }
    });

    const minDist = PLAYER_RADIUS * 2;
    for (let i = 0; i < playerArr.length; i++) {
      for (let j = i + 1; j < playerArr.length; j++) {
        const a = playerArr[i];
        const b = playerArr[j];
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

          // Re-clamp both after push
          a.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, a.x));
          a.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, a.y));
          b.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, b.x));
          b.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, b.y));
        }
      }
    }
  }

  /** Push a player (circle) out of a rectangle */
  private resolveCircleRect(
    player: Player,
    rx: number, ry: number, rw: number, rh: number
  ) {
    // Find closest point on rect to circle center
    const closestX = Math.max(rx, Math.min(rx + rw, player.x));
    const closestY = Math.max(ry, Math.min(ry + rh, player.y));

    const dx = player.x - closestX;
    const dy = player.y - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < PLAYER_RADIUS * PLAYER_RADIUS && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const overlap = PLAYER_RADIUS - dist;
      player.x += (dx / dist) * overlap;
      player.y += (dy / dist) * overlap;
    } else if (distSq === 0) {
      // Player center is exactly on the rect edge or inside — push out by nearest edge
      const toLeft = player.x - rx;
      const toRight = rx + rw - player.x;
      const toTop = player.y - ry;
      const toBottom = ry + rh - player.y;
      const minDist = Math.min(toLeft, toRight, toTop, toBottom);
      if (minDist === toLeft) player.x = rx - PLAYER_RADIUS;
      else if (minDist === toRight) player.x = rx + rw + PLAYER_RADIUS;
      else if (minDist === toTop) player.y = ry - PLAYER_RADIUS;
      else player.y = ry + rh + PLAYER_RADIUS;
    }
  }

  getDistance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

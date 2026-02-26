import { Player, Projectile, Barrier, PunchVIP } from '../state/GameState';
import { MapSchema, ArraySchema } from '@colyseus/schema';
import {
  ARENA_WIDTH, ARENA_HEIGHT, PLAYER_RADIUS, PUNCH_X, PUNCH_Y,
  PUNCH_ZONE_RADIUS, ATTACKER_PROJECTILE_SPEED, ATTACKER_DASH_SPEED,
  ATTACKER_DASH_DURATION, BARRIER_WIDTH, BARRIER_HEIGHT,
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

      // If dashing, apply dash movement
      if (player.isDashing) {
        if (Date.now() < player.dashEndTime) {
          player.x += player.dashDx * ATTACKER_DASH_SPEED * deltaSec * 60;
          player.y += player.dashDy * ATTACKER_DASH_SPEED * deltaSec * 60;
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

      // Defenders can't enter Punch zone center (too close)
      // Attackers collide with Punch zone
      const dxP = player.x - PUNCH_X;
      const dyP = player.y - PUNCH_Y;
      const distP = Math.sqrt(dxP * dxP + dyP * dyP);
      if (distP < PUNCH_ZONE_RADIUS - 20 && player.team === 'defender') {
        const angle = Math.atan2(dyP, dxP);
        player.x = PUNCH_X + Math.cos(angle) * (PUNCH_ZONE_RADIUS - 20);
        player.y = PUNCH_Y + Math.sin(angle) * (PUNCH_ZONE_RADIUS - 20);
      }
    });
  }

  moveProjectiles(projectiles: ArraySchema<Projectile>, deltaMs: number): string[] {
    const deltaSec = deltaMs / 1000;
    const toRemove: string[] = [];

    for (const proj of projectiles) {
      proj.x += proj.dx * proj.speed * deltaSec * 60;
      proj.y += proj.dy * proj.speed * deltaSec * 60;
      proj.distanceTraveled += proj.speed * deltaSec * 60;

      // Remove if out of range or arena
      if (
        proj.distanceTraveled > proj.maxRange ||
        proj.x < 0 || proj.x > ARENA_WIDTH ||
        proj.y < 0 || proj.y > ARENA_HEIGHT
      ) {
        toRemove.push(proj.id);
      }
    }

    return toRemove;
  }

  checkPlayerBarrierCollision(players: MapSchema<Player>, barriers: ArraySchema<Barrier>) {
    players.forEach((player) => {
      if (!player.alive) return;
      // Dashing attackers break through barriers (handled in combat)
      if (player.isDashing) return;

      for (const barrier of barriers) {
        if (this.circleRectCollision(
          player.x, player.y, PLAYER_RADIUS,
          barrier.x, barrier.y, barrier.width, barrier.height, barrier.angle
        )) {
          // Push player out of barrier
          const dx = player.x - barrier.x;
          const dy = player.y - barrier.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          player.x += (dx / dist) * 3;
          player.y += (dy / dist) * 3;
        }
      }
    });
  }

  checkProjectileBarrierCollision(
    projectiles: ArraySchema<Projectile>,
    barriers: ArraySchema<Barrier>
  ): { projIds: string[]; barrierDamage: Map<string, number> } {
    const projIds: string[] = [];
    const barrierDamage = new Map<string, number>();

    for (const proj of projectiles) {
      for (const barrier of barriers) {
        if (this.circleRectCollision(
          proj.x, proj.y, 5,
          barrier.x, barrier.y, barrier.width, barrier.height, barrier.angle
        )) {
          projIds.push(proj.id);
          const curr = barrierDamage.get(barrier.id) || 0;
          barrierDamage.set(barrier.id, curr + proj.damage);
          break;
        }
      }
    }

    return { projIds, barrierDamage };
  }

  circleRectCollision(
    cx: number, cy: number, cr: number,
    rx: number, ry: number, rw: number, rh: number, angle: number
  ): boolean {
    // Transform circle center to barrier's local space
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const dx = cx - rx;
    const dy = cy - ry;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    const halfW = rw / 2;
    const halfH = rh / 2;
    const closestX = Math.max(-halfW, Math.min(halfW, localX));
    const closestY = Math.max(-halfH, Math.min(halfH, localY));

    const distX = localX - closestX;
    const distY = localY - closestY;
    return (distX * distX + distY * distY) < (cr * cr);
  }

  getDistance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

import { Player, PunchVIP } from '../state/GameState';
import { MapSchema } from '@colyseus/schema';
import {
  DEFENDER_MELEE_DAMAGE, DEFENDER_MELEE_RANGE, DEFENDER_MELEE_COOLDOWN,
  ATTACKER_MELEE_DAMAGE, ATTACKER_MELEE_RANGE, ATTACKER_MELEE_COOLDOWN,
  MELEE_ARC, MELEE_KNOCKBACK, ATTACK_VISUAL_DURATION,
  DASH_COOLDOWN, DASH_DURATION, DASH_SPEED,
  DASH_TACKLE_DAMAGE, DASH_TACKLE_KNOCKBACK,
  DEFENDER_HEAL_RANGE, DEFENDER_HEAL_RATE, PUNCH_X, PUNCH_Y,
  PLAYER_RADIUS, RESPAWN_TIME, ARENA_WIDTH, ARENA_HEIGHT,
  PUNCH_KNOCKBACK_INTERVAL, PUNCH_KNOCKBACK_RADIUS, PUNCH_KNOCKBACK_FORCE,
  PUNCH_SELF_HEAL_RATE, PUNCH_SAFE_RADIUS,
  KIDNAP_GRAB_RANGE, KIDNAPPER_SPEED_PENALTY, KIDNAP_DROP_STUN,
  EXTRACTION_ZONES, EXTRACTION_ZONE_RADIUS, RESCUE_RETURN_RANGE,
  SAFE_SPAWN_POINTS, MAP_WALLS,
} from '../../shared/constants';

export class CombatSystem {
  private damageBuffAttacker = 0;

  setAttackerDamageBuff(buff: number) {
    this.damageBuffAttacker = buff;
  }

  processAttack(
    player: Player,
    attackAngle: number,
    now: number,
    players: MapSchema<Player>,
    punch: PunchVIP,
  ) {
    if (!player.alive) return;

    // Can't attack while carrying Punch
    if (player.isCarryingPunch || player.isCarryingPunchHome) return;

    const isDefender = player.team === 'defender';
    const cooldown = isDefender ? DEFENDER_MELEE_COOLDOWN : ATTACKER_MELEE_COOLDOWN;
    const range = isDefender ? DEFENDER_MELEE_RANGE : ATTACKER_MELEE_RANGE;
    let damage = isDefender ? DEFENDER_MELEE_DAMAGE : ATTACKER_MELEE_DAMAGE;

    if (!isDefender) {
      damage *= (1 + this.damageBuffAttacker);
    }

    if (now - player.lastAttackTime < cooldown) return;
    player.lastAttackTime = now;
    player.isAttacking = true;
    player.attackEndTime = now + ATTACK_VISUAL_DURATION;
    player.attackAngle = attackAngle;

    // Check hit on enemies in melee range
    players.forEach((target: Player) => {
      if (target.team === player.team || !target.alive || target.id === player.id) return;
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > range) return;

      // Check angle (MELEE_ARC half-arc)
      const angleToTarget = Math.atan2(dy, dx);
      let angleDiff = Math.abs(angleToTarget - attackAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      if (angleDiff < MELEE_ARC) {
        target.hp -= damage;
        player.damageDealt += damage;
        target.lastHitBy = player.id;

        // Knockback — push target away from attacker
        if (dist > 0) {
          const pushX = (dx / dist) * MELEE_KNOCKBACK;
          const pushY = (dy / dist) * MELEE_KNOCKBACK;
          target.x += pushX;
          target.y += pushY;
          this.clampAndResolveWalls(target);
        }

        // If target was carrying Punch, they drop him!
        if (target.isCarryingPunch || target.isCarryingPunchHome) {
          this.dropPunch(target, punch, now);
        }
      }
    });
  }

  processDash(player: Player, attackAngle: number, now: number) {
    if (!player.alive) return;
    if (player.isCarryingPunch || player.isCarryingPunchHome) return; // can't dash while carrying
    if (now - player.lastDashTime < DASH_COOLDOWN) return;

    player.lastDashTime = now;
    player.isDashing = true;
    player.dashEndTime = now + DASH_DURATION;
    player.dashDx = Math.cos(attackAngle);
    player.dashDy = Math.sin(attackAngle);
  }

  /** Check if dashing player collides with enemies — deals tackle damage + knockback */
  processDashTackles(
    players: MapSchema<Player>,
    punch: PunchVIP,
    now: number,
  ) {
    const dashers: Player[] = [];
    players.forEach((p: Player) => {
      if (p.isDashing && p.alive) dashers.push(p);
    });

    for (const dasher of dashers) {
      players.forEach((target: Player) => {
        if (target.team === dasher.team || !target.alive || target.id === dasher.id) return;

        const dx = target.x - dasher.x;
        const dy = target.y - dasher.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const hitRange = PLAYER_RADIUS * 2 + 5; // slightly generous hit detection

        if (dist < hitRange && dist > 0) {
          // Deal tackle damage
          target.hp -= DASH_TACKLE_DAMAGE;
          dasher.damageDealt += DASH_TACKLE_DAMAGE;
          target.lastHitBy = dasher.id;

          // Strong knockback in dash direction
          target.x += (dx / dist) * DASH_TACKLE_KNOCKBACK;
          target.y += (dy / dist) * DASH_TACKLE_KNOCKBACK;
          this.clampAndResolveWalls(target);

          // End the dash on impact (dasher stops)
          dasher.isDashing = false;

          // Drop Punch if target was carrying
          if (target.isCarryingPunch || target.isCarryingPunchHome) {
            this.dropPunch(target, punch, now);
          }
        }
      });
    }
  }

  /** Clamp position to arena bounds and resolve wall collisions */
  private clampAndResolveWalls(player: Player) {
    player.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, player.x));
    player.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, player.y));
    for (const wall of MAP_WALLS) {
      this.resolveCircleRect(player, wall.x, wall.y, wall.w, wall.h);
    }
  }

  /** Push player circle out of a rectangle */
  private resolveCircleRect(
    player: Player,
    rx: number, ry: number, rw: number, rh: number,
  ) {
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

  // --- KIDNAP MECHANIC ---

  processKidnapAttempts(players: MapSchema<Player>, punch: PunchVIP, now: number) {
    // Can't grab during immunity window
    if (now < punch.dropImmuneUntil) return;
    // Already carried
    if (punch.carriedBy) return;

    players.forEach((player: Player) => {
      if (punch.carriedBy) return; // already grabbed this tick
      if (player.team !== 'attacker' || !player.alive) return;

      const dx = player.x - punch.x;
      const dy = player.y - punch.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < KIDNAP_GRAB_RANGE) {
        // Grab Punch!
        punch.isKidnapped = true;
        punch.carriedBy = player.id;
        punch.isHome = false;
        player.isCarryingPunch = true;
      }
    });
  }

  processDefenderRescue(players: MapSchema<Player>, punch: PunchVIP, now: number) {
    // Defenders can pick up a dropped (not-carried, not-home) Punch and carry him back
    if (punch.carriedBy) return; // someone already has him
    if (punch.isHome) return; // already safe
    if (now < punch.dropImmuneUntil) return;

    players.forEach((player: Player) => {
      if (punch.carriedBy) return;
      if (player.team !== 'defender' || !player.alive) return;

      const dx = player.x - punch.x;
      const dy = player.y - punch.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < KIDNAP_GRAB_RANGE) {
        // Defender picks up Punch to carry home
        punch.carriedBy = player.id;
        punch.isKidnapped = false;
        player.isCarryingPunchHome = true;
      }
    });
  }

  updateCarriedPunchPosition(players: MapSchema<Player>, punch: PunchVIP) {
    if (!punch.carriedBy) return;

    const carrier = players.get(punch.carriedBy);
    if (!carrier || !carrier.alive) {
      // Carrier died or disconnected — drop Punch
      this.dropPunch(carrier || null, punch, Date.now());
      return;
    }

    // Punch follows the carrier
    punch.x = carrier.x;
    punch.y = carrier.y;
  }

  checkExtractionZones(players: MapSchema<Player>, punch: PunchVIP): boolean {
    if (!punch.carriedBy) return false;
    const carrier = players.get(punch.carriedBy);
    if (!carrier || carrier.team !== 'attacker') return false;

    // Check if carrier reached any extraction zone
    for (const zone of EXTRACTION_ZONES) {
      const dx = carrier.x - zone.x;
      const dy = carrier.y - zone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < EXTRACTION_ZONE_RADIUS) {
        return true; // ATTACKERS WIN
      }
    }
    return false;
  }

  checkPunchReturnedHome(players: MapSchema<Player>, punch: PunchVIP): boolean {
    if (!punch.carriedBy) return false;
    const carrier = players.get(punch.carriedBy);
    if (!carrier || carrier.team !== 'defender') return false;

    // Check if defender brought Punch back to center
    const dx = carrier.x - PUNCH_X;
    const dy = carrier.y - PUNCH_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < RESCUE_RETURN_RANGE) {
      // Punch is home!
      punch.x = PUNCH_X;
      punch.y = PUNCH_Y;
      punch.carriedBy = '';
      punch.isKidnapped = false;
      punch.isHome = true;
      carrier.isCarryingPunchHome = false;
      return true;
    }
    return false;
  }

  dropPunch(carrier: Player | null, punch: PunchVIP, now: number) {
    // Punch drops at current position
    if (carrier) {
      carrier.isCarryingPunch = false;
      carrier.isCarryingPunchHome = false;
    }
    punch.carriedBy = '';
    punch.isKidnapped = true; // still kidnapped (not at home), just not carried
    punch.dropImmuneUntil = now + KIDNAP_DROP_STUN;
  }

  getCarrierSpeedMultiplier(player: Player): number {
    if (player.isCarryingPunch || player.isCarryingPunchHome) {
      return KIDNAPPER_SPEED_PENALTY;
    }
    return 1;
  }

  // --- END KIDNAP ---

  processEliminations(
    players: MapSchema<Player>,
    punch: PunchVIP,
    now: number,
  ): Array<{ victimId: string; victimName: string; killerId: string; killerName: string }> {
    const eliminations: Array<{ victimId: string; victimName: string; killerId: string; killerName: string }> = [];

    players.forEach((player: Player) => {
      if (player.alive && player.hp <= 0) {
        player.alive = false;
        player.respawnAt = now + RESPAWN_TIME;

        // Credit kill to lastHitBy
        if (player.lastHitBy) {
          const killer = players.get(player.lastHitBy);
          if (killer) {
            killer.kills++;
            eliminations.push({
              victimId: player.id,
              victimName: player.name,
              killerId: killer.id,
              killerName: killer.name,
            });
          }
        }

        // Drop Punch if carrying
        if (player.isCarryingPunch || player.isCarryingPunchHome) {
          this.dropPunch(player, punch, now);
        }

        player.lastHitBy = '';
      }
    });

    return eliminations;
  }

  processRespawns(players: MapSchema<Player>, now: number) {
    players.forEach((player: Player) => {
      if (!player.alive && now >= player.respawnAt) {
        player.alive = true;
        player.hp = player.maxHp;
        player.isDashing = false;
        player.isCarryingPunch = false;
        player.isCarryingPunchHome = false;

        // Respawn at a safe spawn point (away from walls)
        const sp = SAFE_SPAWN_POINTS[Math.floor(Math.random() * SAFE_SPAWN_POINTS.length)];
        player.x = sp.x;
        player.y = sp.y;
      }
    });
  }

  processDefenderHealing(players: MapSchema<Player>, punch: PunchVIP, deltaMs: number) {
    // Only heal when Punch is home
    if (!punch.isHome) return;

    let healAmount = 0;
    players.forEach((player: Player) => {
      if (player.team !== 'defender' || !player.alive) return;
      const dx = player.x - punch.x;
      const dy = player.y - punch.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < DEFENDER_HEAL_RANGE) {
        healAmount += DEFENDER_HEAL_RATE * (deltaMs / 1000);
      }
    });
    if (healAmount > 0) {
      punch.hp = Math.min(punch.maxHp, punch.hp + healAmount);
    }
  }

  processPunchSelfHeal(punch: PunchVIP, players: MapSchema<Player>, deltaMs: number) {
    // Only self-heal when home
    if (!punch.isHome) return;

    let enemyNearby = false;
    players.forEach((player: Player) => {
      if (player.team !== 'attacker' || !player.alive) return;
      const dx = player.x - punch.x;
      const dy = player.y - punch.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PUNCH_SAFE_RADIUS) {
        enemyNearby = true;
      }
    });
    if (!enemyNearby) {
      punch.hp = Math.min(punch.maxHp, punch.hp + PUNCH_SELF_HEAL_RATE * (deltaMs / 1000));
    }
  }

  processPunchKnockback(punch: PunchVIP, players: MapSchema<Player>, now: number) {
    // Knockback only when Punch is home and not carried
    if (!punch.isHome || punch.carriedBy) return;
    if (now - punch.lastKnockbackTime < PUNCH_KNOCKBACK_INTERVAL) return;
    punch.lastKnockbackTime = now;
    punch.isKnockbackActive = true;

    setTimeout(() => { punch.isKnockbackActive = false; }, 500);

    players.forEach((player: Player) => {
      if (player.team !== 'attacker' || !player.alive) return;
      const dx = player.x - punch.x;
      const dy = player.y - punch.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PUNCH_KNOCKBACK_RADIUS && dist > 0) {
        const force = PUNCH_KNOCKBACK_FORCE * (1 - dist / PUNCH_KNOCKBACK_RADIUS);
        player.x += (dx / dist) * force;
        player.y += (dy / dist) * force;
        this.clampAndResolveWalls(player);
      }
    });
  }
}

import { Player, Projectile, Barrier, PunchVIP } from '../state/GameState';
import { MapSchema, ArraySchema } from '@colyseus/schema';
import {
  DEFENDER_MELEE_DAMAGE, DEFENDER_MELEE_RANGE, DEFENDER_MELEE_COOLDOWN,
  ATTACKER_RANGED_DAMAGE, ATTACKER_RANGED_COOLDOWN, ATTACKER_PROJECTILE_SPEED,
  ATTACKER_PROJECTILE_RANGE, ATTACKER_DASH_COOLDOWN, ATTACKER_DASH_DURATION,
  DEFENDER_HEAL_RANGE, DEFENDER_HEAL_RATE, PUNCH_X, PUNCH_Y,
  DEFENDER_MAX_BARRIERS, BARRIER_HP, BARRIER_WIDTH, BARRIER_HEIGHT,
  PLAYER_RADIUS, RESPAWN_TIME, ARENA_WIDTH, ARENA_HEIGHT,
  PUNCH_KNOCKBACK_INTERVAL, PUNCH_KNOCKBACK_RADIUS, PUNCH_KNOCKBACK_FORCE,
  PUNCH_SELF_HEAL_RATE, PUNCH_SAFE_RADIUS,
  KIDNAP_GRAB_RANGE, KIDNAPPER_SPEED_PENALTY, KIDNAP_DROP_STUN,
  EXTRACTION_ZONES, EXTRACTION_ZONE_RADIUS, RESCUE_RETURN_RANGE,
} from '../../shared/constants';

let projectileIdCounter = 0;
let barrierIdCounter = 0;

export class CombatSystem {
  private damageBuffAttacker = 0;

  setAttackerDamageBuff(buff: number) {
    this.damageBuffAttacker = buff;
  }

  processAttack(
    player: Player,
    attackAngle: number,
    now: number,
    projectiles: ArraySchema<Projectile>,
    players: MapSchema<Player>,
    punch: PunchVIP,
  ) {
    if (!player.alive) return;

    if (player.team === 'defender') {
      // Melee attack
      if (now - player.lastAttackTime < DEFENDER_MELEE_COOLDOWN) return;
      player.lastAttackTime = now;
      player.isAttacking = true;
      player.attackAngle = attackAngle;

      // Check hit on enemies in melee range
      players.forEach((target: Player) => {
        if (target.team === 'defender' || !target.alive || target.id === player.id) return;
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > DEFENDER_MELEE_RANGE) return;

        // Check angle (90 degree arc)
        const angleToTarget = Math.atan2(dy, dx);
        let angleDiff = Math.abs(angleToTarget - attackAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        if (angleDiff < Math.PI / 4) {
          target.hp -= DEFENDER_MELEE_DAMAGE;
          player.damageDealt += DEFENDER_MELEE_DAMAGE;
          target.lastHitBy = player.id;

          // If this attacker was carrying Punch, they drop him!
          if (target.isCarryingPunch) {
            this.dropPunch(target, punch, now);
          }
        }
      });
    } else {
      // Attacker: can't shoot while carrying Punch
      if (player.isCarryingPunch) return;

      // Ranged attack
      if (now - player.lastAttackTime < ATTACKER_RANGED_COOLDOWN) return;
      player.lastAttackTime = now;
      player.isAttacking = true;
      player.attackAngle = attackAngle;

      const proj = new Projectile();
      proj.id = `proj_${++projectileIdCounter}`;
      proj.ownerId = player.id;
      proj.x = player.x;
      proj.y = player.y;
      proj.dx = Math.cos(attackAngle);
      proj.dy = Math.sin(attackAngle);
      proj.speed = ATTACKER_PROJECTILE_SPEED;
      proj.damage = ATTACKER_RANGED_DAMAGE * (1 + this.damageBuffAttacker);
      proj.maxRange = ATTACKER_PROJECTILE_RANGE;
      proj.distanceTraveled = 0;
      projectiles.push(proj);
    }
  }

  processDash(player: Player, attackAngle: number, now: number) {
    if (player.team !== 'attacker' || !player.alive) return;
    if (player.isCarryingPunch) return; // can't dash while carrying
    if (now - player.lastDashTime < ATTACKER_DASH_COOLDOWN) return;

    player.lastDashTime = now;
    player.isDashing = true;
    player.dashEndTime = now + ATTACKER_DASH_DURATION;
    player.dashDx = Math.cos(attackAngle);
    player.dashDy = Math.sin(attackAngle);
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

  placeBarrier(player: Player, attackAngle: number, barriers: ArraySchema<Barrier>) {
    if (player.team !== 'defender' || !player.alive) return;
    if (player.isCarryingPunchHome) return; // can't place barriers while carrying
    if (player.barrierCount >= DEFENDER_MAX_BARRIERS) return;

    const barrier = new Barrier();
    barrier.id = `barrier_${++barrierIdCounter}`;
    barrier.ownerId = player.id;
    barrier.x = player.x + Math.cos(attackAngle) * 40;
    barrier.y = player.y + Math.sin(attackAngle) * 40;
    barrier.angle = attackAngle;
    barrier.hp = BARRIER_HP;
    barrier.maxHp = BARRIER_HP;
    barrier.width = BARRIER_WIDTH;
    barrier.height = BARRIER_HEIGHT;

    barriers.push(barrier);
    player.barrierCount++;
  }

  checkProjectilePlayerHits(
    projectiles: ArraySchema<Projectile>,
    players: MapSchema<Player>,
    punch: PunchVIP,
  ): string[] {
    const toRemove: string[] = [];

    for (const proj of projectiles) {
      players.forEach((player: Player) => {
        // Projectiles from attackers hit defenders
        if (player.team === 'attacker' || !player.alive) return;
        if (player.id === proj.ownerId) return;

        const dx = player.x - proj.x;
        const dy = player.y - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < PLAYER_RADIUS + 5) {
          player.hp -= proj.damage;
          player.lastHitBy = proj.ownerId;
          players.forEach((p: Player) => {
            if (p.id === proj.ownerId) {
              p.damageDealt += proj.damage;
            }
          });
          toRemove.push(proj.id);

          // If this defender was carrying Punch home, they drop him
          if (player.isCarryingPunchHome) {
            this.dropPunch(player, punch, Date.now());
          }
        }
      });
    }

    return toRemove;
  }

  checkProjectilePunchHit(
    projectiles: ArraySchema<Projectile>,
    punch: PunchVIP,
  ): string[] {
    // Projectiles no longer damage Punch directly (kidnap mode)
    // But they still collide with free Punch to prevent shooting through him
    const toRemove: string[] = [];
    if (punch.carriedBy) return toRemove; // no collision when carried

    for (const proj of projectiles) {
      const dx = punch.x - proj.x;
      const dy = punch.y - proj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 30) {
        toRemove.push(proj.id);
      }
    }

    return toRemove;
  }

  checkDashBarrierBreak(
    players: MapSchema<Player>,
    barriers: ArraySchema<Barrier>,
  ): string[] {
    const toRemove: string[] = [];

    players.forEach((player: Player) => {
      if (!player.isDashing || player.team !== 'attacker') return;

      for (const barrier of barriers) {
        const dx = player.x - barrier.x;
        const dy = player.y - barrier.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < PLAYER_RADIUS + BARRIER_WIDTH / 2) {
          toRemove.push(barrier.id);
        }
      }
    });

    return toRemove;
  }

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

        // Respawn at random edge
        const side = Math.floor(Math.random() * 4);
        switch (side) {
          case 0: player.x = PLAYER_RADIUS; player.y = Math.random() * ARENA_HEIGHT; break;
          case 1: player.x = ARENA_WIDTH - PLAYER_RADIUS; player.y = Math.random() * ARENA_HEIGHT; break;
          case 2: player.x = Math.random() * ARENA_WIDTH; player.y = PLAYER_RADIUS; break;
          case 3: player.x = Math.random() * ARENA_WIDTH; player.y = ARENA_HEIGHT - PLAYER_RADIUS; break;
        }
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
        player.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, player.x));
        player.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, player.y));
      }
    });
  }

  removeProjectiles(projectiles: ArraySchema<Projectile>, ids: string[]) {
    const idSet = new Set(ids);
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (idSet.has(projectiles[i].id)) {
        projectiles.splice(i, 1);
      }
    }
  }

  removeBarriers(barriers: ArraySchema<Barrier>, ids: string[], players: MapSchema<Player>) {
    const idSet = new Set(ids);
    for (let i = barriers.length - 1; i >= 0; i--) {
      if (idSet.has(barriers[i].id)) {
        const ownerId = barriers[i].ownerId;
        players.forEach((p: Player) => {
          if (p.id === ownerId) p.barrierCount = Math.max(0, p.barrierCount - 1);
        });
        barriers.splice(i, 1);
      }
    }
  }

  applyBarrierDamage(barriers: ArraySchema<Barrier>, damage: Map<string, number>): string[] {
    const destroyed: string[] = [];
    for (const barrier of barriers) {
      const dmg = damage.get(barrier.id);
      if (dmg) {
        barrier.hp -= dmg;
        if (barrier.hp <= 0) {
          destroyed.push(barrier.id);
        }
      }
    }
    return destroyed;
  }
}

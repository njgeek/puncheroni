import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

export class Player extends Schema {
  id: string = '';
  name: string = '';
  team: string = 'defender';
  x: number = 0;
  y: number = 0;
  hp: number = 100;
  maxHp: number = 100;
  speed: number = 3;
  alive: boolean = true;
  respawnAt: number = 0;
  lastAttackTime: number = 0;
  lastDashTime: number = 0;
  isDashing: boolean = false;
  dashEndTime: number = 0;
  dashDx: number = 0;
  dashDy: number = 0;
  damageDealt: number = 0;
  kills: number = 0;
  attackAngle: number = 0;
  isAttacking: boolean = false;
  attackEndTime: number = 0;
  isCarryingPunch: boolean = false;
  isCarryingPunchHome: boolean = false; // defender carrying Punch back to center
  preferredTeam: string = ''; // player's team preference from lobby
  lastHitBy: string = ''; // sessionId of last player who hit this player
}
defineTypes(Player, {
  id: 'string',
  name: 'string',
  team: 'string',
  x: 'number',
  y: 'number',
  hp: 'number',
  maxHp: 'number',
  speed: 'number',
  alive: 'boolean',
  respawnAt: 'number',
  lastAttackTime: 'number',
  lastDashTime: 'number',
  isDashing: 'boolean',
  dashEndTime: 'number',
  dashDx: 'number',
  dashDy: 'number',
  damageDealt: 'number',
  kills: 'number',
  attackAngle: 'number',
  isAttacking: 'boolean',
  attackEndTime: 'number',
  isCarryingPunch: 'boolean',
  isCarryingPunchHome: 'boolean',
  preferredTeam: 'string',
  lastHitBy: 'string',
});

export class PunchVIP extends Schema {
  x: number = 600;
  y: number = 600;
  hp: number = 100;
  maxHp: number = 100;
  lastKnockbackTime: number = 0;
  isKnockbackActive: boolean = false;
  isKidnapped: boolean = false;
  carriedBy: string = ''; // sessionId of carrier (attacker or defender)
  dropImmuneUntil: number = 0; // timestamp — can't be grabbed right after drop
  isHome: boolean = true; // true when Punch is at center
}
defineTypes(PunchVIP, {
  x: 'number',
  y: 'number',
  hp: 'number',
  maxHp: 'number',
  lastKnockbackTime: 'number',
  isKnockbackActive: 'boolean',
  isKidnapped: 'boolean',
  carriedBy: 'string',
  dropImmuneUntil: 'number',
  isHome: 'boolean',
});

export class GameState extends Schema {
  players = new MapSchema<Player>();
  punch = new PunchVIP();
  phase: string = 'lobby';
  roundTimer: number = 300;
  countdown: number = 3;
  winningTeam: string = '';
  roundNumber: number = 0;
}
defineTypes(GameState, {
  players: { map: Player },
  punch: PunchVIP,
  phase: 'string',
  roundTimer: 'number',
  countdown: 'number',
  winningTeam: 'string',
  roundNumber: 'number',
});

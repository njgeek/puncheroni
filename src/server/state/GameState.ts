import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

// ── Task station ──────────────────────────────────────────────────────────────
export class Task extends Schema {
  id: string = '';
  x: number = 0;
  y: number = 0;
  name: string = '';
  room: string = '';
  done: boolean = false;
}
defineTypes(Task, {
  id: 'string',
  x: 'number',
  y: 'number',
  name: 'string',
  room: 'string',
  done: 'boolean',
});

// ── Dead body left after a kill ───────────────────────────────────────────────
export class DeadBody extends Schema {
  id: string = '';
  x: number = 0;
  y: number = 0;
  playerName: string = '';
}
defineTypes(DeadBody, {
  id: 'string',
  x: 'number',
  y: 'number',
  playerName: 'string',
});

// ── Meeting state (active during emergency / body report) ─────────────────────
export class MeetingState extends Schema {
  active: boolean = false;
  phase: string = '';          // 'discussion' | 'voting' | 'result'
  reporterName: string = '';
  bodyName: string = '';
  timer: number = 0;
  ejectedName: string = '';
  ejectedWasImpostor: boolean = false;
  ejectedRole: string = '';
}
defineTypes(MeetingState, {
  active: 'boolean',
  phase: 'string',
  reporterName: 'string',
  bodyName: 'string',
  timer: 'number',
  ejectedName: 'string',
  ejectedWasImpostor: 'boolean',
  ejectedRole: 'string',
});

// ── Player ────────────────────────────────────────────────────────────────────
export class Player extends Schema {
  id: string = '';
  name: string = '';
  x: number = 0;
  y: number = 0;
  alive: boolean = true;
  isGhost: boolean = false;
  inVent: boolean = false;
  role: string = '';           // 'crewmate' | 'impostor'
  tasksDone: number = 0;
  tasksTotal: number = 0;
  killCooldownEnd: number = 0;
  votedFor: string = '';
  speed: number = 3;
}
defineTypes(Player, {
  id: 'string',
  name: 'string',
  x: 'number',
  y: 'number',
  alive: 'boolean',
  isGhost: 'boolean',
  inVent: 'boolean',
  role: 'string',
  tasksDone: 'number',
  tasksTotal: 'number',
  killCooldownEnd: 'number',
  votedFor: 'string',
  speed: 'number',
});

// ── Game state ─────────────────────────────────────────────────────────────────
export class GameState extends Schema {
  players = new MapSchema<Player>();
  bodies = new MapSchema<DeadBody>();
  tasks = new MapSchema<Task>();
  meeting = new MeetingState();
  phase: string = 'lobby';
  roundTimer: number = 300;
  countdown: number = 3;
  taskTotal: number = 0;
  tasksDone: number = 0;
  winner: string = '';
}
defineTypes(GameState, {
  players: { map: Player },
  bodies: { map: DeadBody },
  tasks: { map: Task },
  meeting: MeetingState,
  phase: 'string',
  roundTimer: 'number',
  countdown: 'number',
  taskTotal: 'number',
  tasksDone: 'number',
  winner: 'string',
});

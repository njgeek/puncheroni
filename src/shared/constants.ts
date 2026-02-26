// Arena
export const ARENA_WIDTH = 1200;
export const ARENA_HEIGHT = 1200;
export const PUNCH_X = ARENA_WIDTH / 2;
export const PUNCH_Y = ARENA_HEIGHT / 2;
export const PUNCH_ZONE_RADIUS = 80;

// Tick rate
export const SERVER_TICK_RATE = 20; // Hz
export const TICK_MS = 1000 / SERVER_TICK_RATE;

// Teams
export const DEFENDER_RATIO = 0.55;
export const TEAM_SWAP_RATIO = 0.15;

// Defender stats (Punch's Friends — PUNCH attack)
export const DEFENDER_HP = 120;
export const DEFENDER_SPEED = 3.2;
export const DEFENDER_MELEE_DAMAGE = 18;
export const DEFENDER_MELEE_RANGE = 70;
export const DEFENDER_MELEE_COOLDOWN = 450; // ms
export const DEFENDER_HEAL_RANGE = 100;
export const DEFENDER_HEAL_RATE = 2; // HP/s to Punch

// Attacker stats (Punch's Foes — KICK attack)
export const ATTACKER_HP = 90;
export const ATTACKER_SPEED = 4.2;
export const ATTACKER_MELEE_DAMAGE = 14;
export const ATTACKER_MELEE_RANGE = 65;
export const ATTACKER_MELEE_COOLDOWN = 350; // ms

// Shared melee
export const MELEE_ARC = Math.PI / 2.5; // 72° half-arc = 144° total swing
export const MELEE_KNOCKBACK = 30; // push distance on hit
export const ATTACK_VISUAL_DURATION = 200; // ms — how long attack swing arc shows

// Dash (both teams)
export const DASH_SPEED = 11;
export const DASH_DURATION = 350; // ms — visible burst
export const DASH_COOLDOWN = 3000; // ms
export const DASH_TACKLE_DAMAGE = 20; // damage when dashing into an enemy
export const DASH_TACKLE_KNOCKBACK = 50; // push distance on dash tackle

// Punch (VIP) stats
export const PUNCH_HP = 100;
export const PUNCH_KNOCKBACK_INTERVAL = 15000; // ms
export const PUNCH_KNOCKBACK_RADIUS = 150;
export const PUNCH_KNOCKBACK_FORCE = 200;
export const PUNCH_SELF_HEAL_RATE = 1; // HP/s when no enemies nearby
export const PUNCH_SAFE_RADIUS = 120;

// Kidnap mechanic
export const KIDNAP_GRAB_RANGE = 60; // how close attacker must be to grab Punch
export const KIDNAPPER_SPEED_PENALTY = 0.45; // kidnapper moves at 45% speed
export const KIDNAP_DROP_STUN = 1500; // ms Punch is immune after being dropped
export const EXTRACTION_ZONE_RADIUS = 70;
// Four extraction zones at arena edges
export const EXTRACTION_ZONES = [
  { x: 60, y: ARENA_HEIGHT / 2 },
  { x: ARENA_WIDTH - 60, y: ARENA_HEIGHT / 2 },
  { x: ARENA_WIDTH / 2, y: 60 },
  { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 60 },
];
export const RESCUE_RETURN_RANGE = 80; // defenders carry Punch back within this range of center

// Respawn
export const RESPAWN_TIME = 5000; // ms

// Round
export const ROUND_DURATION = 300; // seconds (5 minutes)
export const LOBBY_MIN_PLAYERS = 2;
export const LOBBY_MAX_PLAYERS = 20;
export const COUNTDOWN_DURATION = 3; // seconds
export const RESULTS_DURATION = 10; // seconds

// Rubber-banding
export const RUBBER_BAND_KIDNAPPED_DEFENDER_SPEED_BUFF = 0.25; // defenders faster when Punch is kidnapped
export const RUBBER_BAND_TIME_THRESHOLD = 30;
export const RUBBER_BAND_ATTACKER_DAMAGE_BUFF = 0.15;

// Map walls (Among Us style rooms with doorway gaps)
export const MAP_WALLS: Array<{ x: number; y: number; w: number; h: number }> = [
  // Horizontal dividers (top and bottom thirds)
  { x: 0, y: 340, w: 480, h: 20 },
  { x: 720, y: 340, w: 480, h: 20 },
  { x: 0, y: 840, w: 480, h: 20 },
  { x: 720, y: 840, w: 480, h: 20 },

  // Vertical dividers (left and right thirds)
  { x: 340, y: 0, w: 20, h: 480 },
  { x: 340, y: 720, w: 20, h: 480 },
  { x: 840, y: 0, w: 20, h: 480 },
  { x: 840, y: 720, w: 20, h: 480 },

  // Corner tables/obstacles in rooms
  { x: 120, y: 120, w: 80, h: 16 },
  { x: 120, y: 120, w: 16, h: 80 },
  { x: 1000, y: 120, w: 80, h: 16 },
  { x: 1064, y: 120, w: 16, h: 80 },
  { x: 120, y: 1064, w: 80, h: 16 },
  { x: 120, y: 1000, w: 16, h: 80 },
  { x: 1000, y: 1064, w: 80, h: 16 },
  { x: 1064, y: 1000, w: 16, h: 80 },

  // Reactor room walls (4 doorway openings — N, S, E, W)
  { x: 460, y: 460, w: 16, h: 100 },   // west wall top
  { x: 460, y: 640, w: 16, h: 100 },   // west wall bottom
  { x: 724, y: 460, w: 16, h: 100 },   // east wall top
  { x: 724, y: 640, w: 16, h: 100 },   // east wall bottom
  { x: 520, y: 460, w: 70, h: 16 },    // north wall left
  { x: 610, y: 460, w: 70, h: 16 },    // north wall right
  { x: 520, y: 724, w: 70, h: 16 },    // south wall left
  { x: 610, y: 724, w: 70, h: 16 },    // south wall right
];

// Room definitions for floor coloring
export const MAP_ROOMS: Array<{ x: number; y: number; w: number; h: number; color: number; name: string }> = [
  { x: 476, y: 476, w: 248, h: 248, color: 0x2a3a50, name: 'REACTOR' },
  { x: 20, y: 20, w: 300, h: 300, color: 0x1e3828, name: 'MEDBAY' },
  { x: 880, y: 20, w: 300, h: 300, color: 0x382828, name: 'WEAPONS' },
  { x: 20, y: 880, w: 300, h: 300, color: 0x28281e, name: 'SHIELDS' },
  { x: 880, y: 880, w: 300, h: 300, color: 0x381e28, name: 'ENGINES' },
];

// Safe spawn points (away from walls, at arena edges in corridor gaps)
export const SAFE_SPAWN_POINTS = [
  // Left edge (in corridor gap between walls)
  { x: 20, y: 200 }, { x: 20, y: 600 }, { x: 20, y: 1000 },
  // Right edge
  { x: 1180, y: 200 }, { x: 1180, y: 600 }, { x: 1180, y: 1000 },
  // Top edge
  { x: 200, y: 20 }, { x: 600, y: 20 }, { x: 1000, y: 20 },
  // Bottom edge
  { x: 200, y: 1180 }, { x: 600, y: 1180 }, { x: 1000, y: 1180 },
];

// Player
export const PLAYER_RADIUS = 15;
export const PLAYER_NAME_ADJECTIVES = [
  'Brave', 'Swift', 'Mighty', 'Noble', 'Fierce', 'Bold', 'Wild', 'Loyal',
  'Proud', 'Quick', 'Sneaky', 'Wise', 'Tiny', 'Giant', 'Lucky', 'Crafty'
];
export const PLAYER_NAME_NOUNS = [
  'Monkey', 'Tiger', 'Eagle', 'Wolf', 'Bear', 'Fox', 'Hawk', 'Lion',
  'Panda', 'Otter', 'Falcon', 'Badger', 'Gecko', 'Cobra', 'Raven', 'Lynx'
];

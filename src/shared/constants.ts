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
export const TEAM_SWAP_RATIO = 0.3;

// Defender stats
export const DEFENDER_HP = 120;
export const DEFENDER_SPEED = 3;
export const DEFENDER_MELEE_DAMAGE = 15;
export const DEFENDER_MELEE_RANGE = 50;
export const DEFENDER_MELEE_COOLDOWN = 500; // ms
export const DEFENDER_MAX_BARRIERS = 3;
export const DEFENDER_HEAL_RANGE = 100;
export const DEFENDER_HEAL_RATE = 2; // HP/s to Punch

// Attacker stats
export const ATTACKER_HP = 80;
export const ATTACKER_SPEED = 4.5;
export const ATTACKER_RANGED_DAMAGE = 10;
export const ATTACKER_RANGED_COOLDOWN = 800; // ms
export const ATTACKER_PROJECTILE_SPEED = 8;
export const ATTACKER_PROJECTILE_RANGE = 400;
export const ATTACKER_DASH_SPEED = 12;
export const ATTACKER_DASH_DURATION = 200; // ms
export const ATTACKER_DASH_COOLDOWN = 5000; // ms
export const ATTACKER_ATTACK_PUNCH_RANGE = 60;
export const ATTACKER_PUNCH_DAMAGE = 5;

// Punch (VIP) stats
export const PUNCH_HP = 100;
export const PUNCH_KNOCKBACK_INTERVAL = 15000; // ms
export const PUNCH_KNOCKBACK_RADIUS = 150;
export const PUNCH_KNOCKBACK_FORCE = 200;
export const PUNCH_SELF_HEAL_RATE = 1; // HP/s when no enemies nearby
export const PUNCH_SAFE_RADIUS = 120;

// Kidnap mechanic
export const KIDNAP_GRAB_RANGE = 45; // how close attacker must be to grab Punch
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

// Barriers
export const BARRIER_HP = 30;
export const BARRIER_WIDTH = 60;
export const BARRIER_HEIGHT = 15;

// Respawn
export const RESPAWN_TIME = 5000; // ms

// Round
export const ROUND_DURATION = 90; // seconds
export const LOBBY_MIN_PLAYERS = 1;
export const LOBBY_MAX_PLAYERS = 20;
export const COUNTDOWN_DURATION = 3; // seconds
export const RESULTS_DURATION = 10; // seconds

// Rubber-banding
export const RUBBER_BAND_KIDNAPPED_DEFENDER_SPEED_BUFF = 0.25; // defenders faster when Punch is kidnapped
export const RUBBER_BAND_TIME_THRESHOLD = 30;
export const RUBBER_BAND_ATTACKER_DAMAGE_BUFF = 0.15;

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

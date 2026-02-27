// Arena
export const ARENA_WIDTH = 1200;
export const ARENA_HEIGHT = 1200;

// Tick rate
export const SERVER_TICK_RATE = 20; // Hz
export const TICK_MS = 1000 / SERVER_TICK_RATE;

// Round
export const ROUND_DURATION = 300; // seconds
export const LOBBY_MIN_PLAYERS = 2;
export const LOBBY_MAX_PLAYERS = 20;
export const COUNTDOWN_DURATION = 3; // seconds
export const RESULTS_DURATION = 10; // seconds

// Player
export const PLAYER_RADIUS = 15;
export const PLAYER_SPEED = 3.0;

// Kill mechanics
export const KILL_RANGE = 50; // px
export const KILL_COOLDOWN = 30000; // ms

// Vision (fog of war)
export const VISION_RADIUS = 220; // px crewmate vision
export const IMPOSTOR_VISION_RADIUS = 280; // px impostor vision

// Tasks
export const TASK_INTERACT_DURATION = 2500; // ms to hold for task completion
export const TASK_INTERACT_RANGE = 60; // px to be near a task station
export const TASKS_PER_PLAYER = 3;

// Meeting
export const MEETING_DISCUSSION_TIME = 30; // seconds
export const MEETING_VOTE_TIME = 30; // seconds

// Vents
export const VENT_RANGE = 45; // px to enter/exit a vent

// Reporting
export const REPORT_RANGE = 80; // px to report a body

// Emergency button
export const EMERGENCY_BUTTON = { x: 600, y: 600 };
export const EMERGENCY_BUTTON_RANGE = 60; // px

// Impostor count by player count
export function getImpostorCount(playerCount: number): number {
  if (playerCount <= 6) return 1;
  if (playerCount <= 9) return 2;
  return 3;
}

// Task definitions (9 tasks around the map)
export const TASK_DEFINITIONS: Array<{
  id: string; name: string; room: string; x: number; y: number;
}> = [
  { id: 'medbay_scan',   name: 'Medbay Scan',       room: 'MEDBAY',   x: 150,  y: 205  },
  { id: 'weapons_fix',   name: 'Fix Weapons',        room: 'WEAPONS',  x: 1050, y: 205  },
  { id: 'shields_cal',   name: 'Calibrate Shields',  room: 'SHIELDS',  x: 150,  y: 995  },
  { id: 'engines_fuel',  name: 'Fuel Engines',        room: 'ENGINES',  x: 1050, y: 995  },
  { id: 'reactor_start', name: 'Start Reactor',       room: 'REACTOR',  x: 470,  y: 470  },
  { id: 'elec_wiring',   name: 'Fix Wiring',          room: 'HALLWAY',  x: 390,  y: 600  },
  { id: 'comms_reset',   name: 'Reset Comms',         room: 'HALLWAY',  x: 810,  y: 600  },
  { id: 'nav_chart',     name: 'Chart Course',        room: 'HALLWAY',  x: 600,  y: 390  },
  { id: 'admin_upload',  name: 'Upload Data',         room: 'HALLWAY',  x: 600,  y: 810  },
];

// Vent graph — 8 vents with adjacency connections
export const VENT_GRAPH: Array<{
  id: number; x: number; y: number; connections: number[];
}> = [
  { id: 0, x: 170,  y: 170,  connections: [4, 6] }, // Medbay       → top corridor, left corridor
  { id: 1, x: 1030, y: 170,  connections: [4, 7] }, // Weapons      → top corridor, right corridor
  { id: 2, x: 170,  y: 1030, connections: [5, 6] }, // Shields      → bottom corridor, left corridor
  { id: 3, x: 1030, y: 1030, connections: [5, 7] }, // Engines      → bottom corridor, right corridor
  { id: 4, x: 600,  y: 210,  connections: [0, 1] }, // Top corridor  → Medbay, Weapons
  { id: 5, x: 600,  y: 990,  connections: [2, 3] }, // Bottom corr   → Shields, Engines
  { id: 6, x: 210,  y: 600,  connections: [0, 2] }, // Left corridor → Medbay, Shields
  { id: 7, x: 990,  y: 600,  connections: [1, 3] }, // Right corridor→ Weapons, Engines
];

// Quick phrases for meeting chat
export const QUICK_PHRASES = [
  "I saw it!",
  "It wasn't me",
  "Suspicious...",
  "Vote them out!",
  "I was in [room]",
  "Skip vote",
];

// Map layout constants
export const MAP_WALLS: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 105,  y: 130,  w: 90, h: 18 }, // MedBay console
  { x: 1005, y: 130,  w: 90, h: 18 }, // Weapons rack
  { x: 105,  y: 1052, w: 90, h: 18 }, // Shields panel
  { x: 1005, y: 1052, w: 90, h: 18 }, // Engine console
];

// Room definitions for floor coloring
export const MAP_ROOMS: Array<{
  x: number; y: number; w: number; h: number; color: number; name: string;
}> = [
  { x: 440, y: 440, w: 320, h: 320, color: 0x2a3a50, name: 'REACTOR'  },
  { x: 40,  y: 40,  w: 260, h: 260, color: 0x1e3828, name: 'MEDBAY'   },
  { x: 900, y: 40,  w: 260, h: 260, color: 0x382020, name: 'WEAPONS'  },
  { x: 40,  y: 900, w: 260, h: 260, color: 0x1e2838, name: 'SHIELDS'  },
  { x: 900, y: 900, w: 260, h: 260, color: 0x30203a, name: 'ENGINES'  },
];

// Safe spawn points — inside corridors
export const SAFE_SPAWN_POINTS = [
  { x: 150, y: 420 }, { x: 150, y: 600 }, { x: 150, y: 780 },
  { x: 1050, y: 420 }, { x: 1050, y: 600 }, { x: 1050, y: 780 },
  { x: 420, y: 150 }, { x: 600, y: 150 }, { x: 780, y: 150 },
  { x: 420, y: 1050 }, { x: 600, y: 1050 }, { x: 780, y: 1050 },
];

export const PLAYER_NAME_ADJECTIVES = [
  'Brave', 'Swift', 'Mighty', 'Noble', 'Fierce', 'Bold', 'Wild', 'Loyal',
  'Proud', 'Quick', 'Sneaky', 'Wise', 'Tiny', 'Giant', 'Lucky', 'Crafty',
];
export const PLAYER_NAME_NOUNS = [
  'Monkey', 'Tiger', 'Eagle', 'Wolf', 'Bear', 'Fox', 'Hawk', 'Lion',
  'Panda', 'Otter', 'Falcon', 'Badger', 'Gecko', 'Cobra', 'Raven', 'Lynx',
];

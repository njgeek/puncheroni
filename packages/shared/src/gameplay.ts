export type Role = "zookeeper" | "monkey";
export type Phase = "social" | "operation";

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface InputState {
  moveX: number;
  moveZ: number;
}

// --- Networking ---
export const ROOM_NAME = "puncheroni_room";
export const SERVER_PORT = 2567;

// --- World ---
export const WORLD_HALF_EXTENT = 22;

// --- Team sizes (8 monkeys vs 4 zookeepers) ---
export const TARGET_MONKEYS = 8;
export const TARGET_ZOOKEEPERS = 4;
export const MONKEY_TO_ZOOKEEPER_RATIO = 2;

// --- Movement ---
export const PLAYER_SPEED = 5.75;
export const ZOOKEEPER_SPEED_BONUS = 0.35;
export const PUNCH_SPEED = 4.4;
export const PUNCH_RETREAT_SPEED = 5.1;

// --- Interaction ranges ---
export const TOY_PICKUP_RANGE = 1.8;
export const PUNCH_FOLLOW_RANGE = 7;
export const PUNCH_CALM_RANGE = 2.8;
export const PUNCH_GUARD_STRESS_RANGE = 4.5;
export const ZOOKEEPER_TAG_RANGE = 1.65;
export const EXTRACTION_RADIUS = 3.25;

// --- Phase timing ---
export const SOCIAL_PHASE_MS = 60_000;
export const OPERATION_PHASE_MS = 180_000;
export const ROUND_RESULT_MS = 5_000;

// --- Key positions ---
export const PUNCH_HOME: Vector3Like = { x: 0, y: 0.8, z: -1.5 };
export const TOY_HOME: Vector3Like = { x: -2, y: 0.45, z: 0.5 };
export const EXTRACTION_POINT: Vector3Like = { x: -16, y: 0.2, z: 16 };

export const ZOOKEEPER_SPAWNS: Vector3Like[] = [
  { x: 5, y: 0.75, z: 4 },
  { x: -5, y: 0.75, z: 4 },
  { x: 8, y: 0.75, z: -3 },
  { x: -8, y: 0.75, z: -3 },
];

export const MONKEY_SPAWNS: Vector3Like[] = [
  { x: -18, y: 0.75, z: 14 },
  { x: -14, y: 0.75, z: 18 },
  { x: -20, y: 0.75, z: 10 },
  { x: -12, y: 0.75, z: 16 },
  { x: 18, y: 0.75, z: 14 },
  { x: 14, y: 0.75, z: 18 },
  { x: 20, y: 0.75, z: 10 },
  { x: 16, y: 0.75, z: 16 },
];

export const ROLE_COLORS: Record<Role, string> = {
  zookeeper: "#4a9e4a",
  monkey: "#c75b39",
};

// --- Math utilities ---

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const distanceSquared = (a: Vector3Like, b: Vector3Like): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};

export const distanceTo = (a: Vector3Like, b: Vector3Like): number =>
  Math.sqrt(distanceSquared(a, b));

export const normalizeInput = (moveX: number, moveZ: number): InputState => {
  const length = Math.hypot(moveX, moveZ);
  if (length < 0.001) {
    return { moveX: 0, moveZ: 0 };
  }
  return { moveX: moveX / length, moveZ: moveZ / length };
};

export const clampWorldPosition = (position: Vector3Like): Vector3Like => ({
  x: clamp(position.x, -WORLD_HALF_EXTENT, WORLD_HALF_EXTENT),
  y: position.y,
  z: clamp(position.z, -WORLD_HALF_EXTENT, WORLD_HALF_EXTENT),
});

export const moveToward = (
  current: Vector3Like,
  target: Vector3Like,
  maxDistance: number
): Vector3Like => {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dy, dz);

  if (distance < 0.0001 || distance <= maxDistance) {
    return { x: target.x, y: target.y, z: target.z };
  }

  const scale = maxDistance / distance;
  return {
    x: current.x + dx * scale,
    y: current.y + dy * scale,
    z: current.z + dz * scale,
  };
};

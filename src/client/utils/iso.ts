// Isometric coordinate transforms
// Game logic uses flat cartesian (x, y). Rendering transforms to isometric screen coords.
// The 1200x1200 square arena becomes a diamond on screen (~2400px wide x 1200px tall).

export function toIso(x: number, y: number): { x: number; y: number } {
  return { x: x - y, y: (x + y) / 2 };
}

export function fromIso(sx: number, sy: number): { x: number; y: number } {
  return { x: sx / 2 + sy, y: sy - sx / 2 };
}

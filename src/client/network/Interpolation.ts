interface EntityState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

const LERP_SPEED = 0.2;

export class Interpolation {
  private entities = new Map<string, EntityState>();

  updateTarget(id: string, x: number, y: number) {
    const entity = this.entities.get(id);
    if (entity) {
      entity.targetX = x;
      entity.targetY = y;
    } else {
      this.entities.set(id, { x, y, targetX: x, targetY: y });
    }
  }

  getPosition(id: string): { x: number; y: number } | null {
    return this.entities.get(id) || null;
  }

  interpolate(localPlayerId: string) {
    this.entities.forEach((entity, id) => {
      // Don't interpolate local player — use server position directly
      if (id === localPlayerId) {
        entity.x = entity.targetX;
        entity.y = entity.targetY;
        return;
      }
      entity.x += (entity.targetX - entity.x) * LERP_SPEED;
      entity.y += (entity.targetY - entity.y) * LERP_SPEED;
    });
  }

  remove(id: string) {
    this.entities.delete(id);
  }
}

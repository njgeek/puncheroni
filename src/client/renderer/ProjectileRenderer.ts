import { Graphics, Container } from 'pixi.js';

interface ProjSprite {
  gfx: Graphics;
}

export class ProjectileRenderer {
  container = new Container();
  private sprites = new Map<string, ProjSprite>();
  private knownIds = new Set<string>();

  update(projectiles: Array<{ id: string; x: number; y: number; dx: number; dy: number }>) {
    this.knownIds.clear();

    for (const p of projectiles) {
      this.knownIds.add(p.id);
      let sprite = this.sprites.get(p.id);

      if (!sprite) {
        const gfx = new Graphics();
        gfx.circle(0, 0, 4);
        gfx.fill(0xff6644);
        gfx.circle(0, 0, 2);
        gfx.fill(0xffcc44);

        sprite = { gfx };
        this.sprites.set(p.id, sprite);
        this.container.addChild(gfx);
      }

      sprite.gfx.x = p.x;
      sprite.gfx.y = p.y;
      sprite.gfx.rotation = Math.atan2(p.dy, p.dx);
    }

    // Remove stale
    this.sprites.forEach((sprite, id) => {
      if (!this.knownIds.has(id)) {
        this.container.removeChild(sprite.gfx);
        this.sprites.delete(id);
      }
    });
  }
}

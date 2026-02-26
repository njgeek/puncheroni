import { Graphics, Container } from 'pixi.js';
import { toIso } from '../utils/iso';

interface ProjSprite {
  gfx: Graphics;
  shadow: Graphics;
  gameY: number;
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
        // Shadow on ground
        const shadow = new Graphics();
        shadow.ellipse(0, 0, 3, 1.5);
        shadow.fill({ color: 0x000000, alpha: 0.15 });
        this.container.addChild(shadow);

        // Projectile glow
        const gfx = new Graphics();
        gfx.circle(0, 0, 5);
        gfx.fill({ color: 0xff6644, alpha: 0.6 });
        gfx.circle(0, 0, 3);
        gfx.fill(0xff6644);
        gfx.circle(0, 0, 1.5);
        gfx.fill(0xffcc44);
        this.container.addChild(gfx);

        sprite = { gfx, shadow, gameY: 0 };
        this.sprites.set(p.id, sprite);
      }

      const iso = toIso(p.x, p.y);
      sprite.gfx.x = iso.x;
      sprite.gfx.y = iso.y - 8; // float slightly above ground
      sprite.shadow.x = iso.x;
      sprite.shadow.y = iso.y;
      sprite.gameY = p.y;
      sprite.gfx.rotation = Math.atan2(p.dy, p.dx);
    }

    // Remove stale
    this.sprites.forEach((sprite, id) => {
      if (!this.knownIds.has(id)) {
        this.container.removeChild(sprite.gfx);
        this.container.removeChild(sprite.shadow);
        this.sprites.delete(id);
      }
    });
  }
}

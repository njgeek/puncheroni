import { Graphics, Container } from 'pixi.js';
import { toIso } from '../utils/iso';

interface Particle {
  gfx: Graphics;
  shadow: Graphics | null;
  // game-space position
  gameX: number;
  gameY: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
}

export class EffectsRenderer {
  container = new Container();
  private particles: Particle[] = [];

  spawnHit(gameX: number, gameY: number, color: number = 0xff6644) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      const gfx = new Graphics();
      const size = 2 + Math.random() * 3;
      gfx.circle(0, 0, size);
      gfx.fill(color);

      const iso = toIso(gameX, gameY);
      gfx.x = iso.x;
      gfx.y = iso.y;
      this.container.addChild(gfx);

      this.particles.push({
        gfx, shadow: null,
        gameX, gameY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.5 + Math.random() * 0.3,
        color,
        size,
      });
    }
  }

  spawnBarrierBreak(gameX: number, gameY: number) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      const gfx = new Graphics();
      const w = 3 + Math.random() * 5;
      const h = 2 + Math.random() * 3;
      gfx.rect(-w / 2, -h / 2, w, h);
      gfx.fill(0x8b7355);

      const iso = toIso(gameX, gameY);
      gfx.x = iso.x;
      gfx.y = iso.y;
      gfx.rotation = Math.random() * Math.PI;
      this.container.addChild(gfx);

      // Shadow on ground
      const shadow = new Graphics();
      shadow.ellipse(0, 0, 3, 1.5);
      shadow.fill({ color: 0x000000, alpha: 0.12 });
      shadow.x = iso.x;
      shadow.y = iso.y + 4;
      this.container.addChild(shadow);

      this.particles.push({
        gfx, shadow,
        gameX, gameY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8,
        maxLife: 0.8,
        color: 0x8b7355,
        size: w,
      });
    }
  }

  spawnHealGlow(gameX: number, gameY: number) {
    for (let i = 0; i < 3; i++) {
      const gfx = new Graphics();
      gfx.circle(0, 0, 3);
      gfx.fill(0x44ff44);

      const offsetX = (Math.random() - 0.5) * 20;
      const iso = toIso(gameX + offsetX, gameY);
      gfx.x = iso.x;
      gfx.y = iso.y;
      this.container.addChild(gfx);

      this.particles.push({
        gfx, shadow: null,
        gameX: gameX + offsetX,
        gameY,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -1 - Math.random(),
        life: 0.8,
        maxLife: 0.8,
        color: 0x44ff44,
        size: 3,
      });
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.gameX += p.vx;
      p.gameY += p.vy;
      const iso = toIso(p.gameX, p.gameY);
      p.gfx.x = iso.x;
      p.gfx.y = iso.y;
      p.gfx.alpha = Math.max(0, p.life / p.maxLife);

      if (p.shadow) {
        p.shadow.x = iso.x;
        p.shadow.y = iso.y + 4;
        p.shadow.alpha = p.gfx.alpha * 0.5;
      }

      if (p.life <= 0) {
        this.container.removeChild(p.gfx);
        if (p.shadow) this.container.removeChild(p.shadow);
        this.particles.splice(i, 1);
      }
    }
  }
}

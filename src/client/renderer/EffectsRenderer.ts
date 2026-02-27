import { Graphics, Container } from 'pixi.js';

interface Particle {
  gfx: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
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
      gfx.x = gameX;
      gfx.y = gameY;
      this.container.addChild(gfx);

      this.particles.push({
        gfx,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.5 + Math.random() * 0.3,
      });
    }
  }

  /** Spawn task completion sparkles */
  spawnTaskComplete(gameX: number, gameY: number) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2;
      const gfx = new Graphics();
      gfx.circle(0, 0, 3);
      gfx.fill(0x44ffaa);
      gfx.x = gameX;
      gfx.y = gameY;
      this.container.addChild(gfx);

      this.particles.push({
        gfx,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 0.8,
        maxLife: 0.8,
      });
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.gfx.x += p.vx;
      p.gfx.y += p.vy;
      p.gfx.alpha = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        this.container.removeChild(p.gfx);
        this.particles.splice(i, 1);
      }
    }
  }
}

import { Graphics, Container } from 'pixi.js';

interface Particle {
  gfx: Graphics;
  x: number;
  y: number;
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

  spawnHit(x: number, y: number, color: number = 0xff6644) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      const gfx = new Graphics();
      const size = 2 + Math.random() * 3;
      gfx.circle(0, 0, size);
      gfx.fill(color);
      gfx.x = x;
      gfx.y = y;
      this.container.addChild(gfx);

      this.particles.push({
        gfx, x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.5 + Math.random() * 0.3,
        color,
        size,
      });
    }
  }

  spawnBarrierBreak(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      const gfx = new Graphics();
      const w = 3 + Math.random() * 5;
      const h = 2 + Math.random() * 3;
      gfx.rect(-w / 2, -h / 2, w, h);
      gfx.fill(0x8b7355);
      gfx.x = x;
      gfx.y = y;
      gfx.rotation = Math.random() * Math.PI;
      this.container.addChild(gfx);

      this.particles.push({
        gfx, x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8,
        maxLife: 0.8,
        color: 0x8b7355,
        size: w,
      });
    }
  }

  spawnHealGlow(x: number, y: number) {
    for (let i = 0; i < 3; i++) {
      const gfx = new Graphics();
      gfx.circle(0, 0, 3);
      gfx.fill(0x44ff44);
      gfx.x = x + (Math.random() - 0.5) * 20;
      gfx.y = y;
      this.container.addChild(gfx);

      this.particles.push({
        gfx,
        x: gfx.x,
        y: gfx.y,
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
      p.x += p.vx;
      p.y += p.vy;
      p.gfx.x = p.x;
      p.gfx.y = p.y;
      p.gfx.alpha = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        this.container.removeChild(p.gfx);
        this.particles.splice(i, 1);
      }
    }
  }
}

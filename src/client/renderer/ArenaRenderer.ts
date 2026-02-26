import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import {
  ARENA_WIDTH, ARENA_HEIGHT, PUNCH_X, PUNCH_Y, PUNCH_ZONE_RADIUS,
  EXTRACTION_ZONES, EXTRACTION_ZONE_RADIUS, RESCUE_RETURN_RANGE,
} from '@shared/constants';

export class ArenaRenderer {
  container = new Container();
  private extractionZones: Graphics[] = [];
  private homeZone!: Graphics;
  private animTime = 0;

  init() {
    // Ground
    const bg = new Graphics();
    bg.rect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    bg.fill(0x1a3a1a);
    this.container.addChild(bg);

    // Grid lines
    const grid = new Graphics();
    for (let x = 0; x <= ARENA_WIDTH; x += 60) {
      grid.moveTo(x, 0);
      grid.lineTo(x, ARENA_HEIGHT);
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += 60) {
      grid.moveTo(0, y);
      grid.lineTo(ARENA_WIDTH, y);
    }
    grid.stroke({ width: 1, color: 0x224422, alpha: 0.3 });
    this.container.addChild(grid);

    // Punch home zone (center)
    this.homeZone = new Graphics();
    this.container.addChild(this.homeZone);
    this.drawHomeZone(false);

    // Extraction zones (enemy goal areas at edges)
    for (const zone of EXTRACTION_ZONES) {
      const g = new Graphics();
      g.x = zone.x;
      g.y = zone.y;
      this.extractionZones.push(g);
      this.container.addChild(g);
    }

    this.drawBushes();
    this.drawTrees();
  }

  private drawHomeZone(punchIsAway: boolean) {
    this.homeZone.clear();

    // Clearing
    this.homeZone.circle(PUNCH_X, PUNCH_Y, PUNCH_ZONE_RADIUS + 40);
    this.homeZone.fill({ color: 0x2a4a2a, alpha: 0.5 });

    if (punchIsAway) {
      // Pulsing return zone when Punch needs to be brought back
      this.homeZone.circle(PUNCH_X, PUNCH_Y, RESCUE_RETURN_RANGE);
      this.homeZone.stroke({ width: 3, color: 0x44aaff, alpha: 0.6 });

      // "RETURN HERE" marker
      this.homeZone.circle(PUNCH_X, PUNCH_Y, 10);
      this.homeZone.fill({ color: 0x44aaff, alpha: 0.4 });
    } else {
      this.homeZone.circle(PUNCH_X, PUNCH_Y, PUNCH_ZONE_RADIUS);
      this.homeZone.stroke({ width: 2, color: 0x66aa66, alpha: 0.4 });
    }
  }

  update(dt: number, punchIsKidnapped: boolean) {
    this.animTime += dt;

    // Animate extraction zones
    const pulse = Math.sin(this.animTime * 3) * 0.3 + 0.7;
    for (const g of this.extractionZones) {
      g.clear();

      // Outer danger glow
      g.circle(0, 0, EXTRACTION_ZONE_RADIUS);
      g.fill({ color: 0xff2222, alpha: 0.08 * pulse });
      g.circle(0, 0, EXTRACTION_ZONE_RADIUS);
      g.stroke({ width: 2, color: 0xff4444, alpha: 0.4 * pulse });

      // Inner skull/danger marker
      g.circle(0, 0, 15);
      g.stroke({ width: 2, color: 0xff6666, alpha: 0.5 });

      // X mark
      g.moveTo(-8, -8);
      g.lineTo(8, 8);
      g.moveTo(8, -8);
      g.lineTo(-8, 8);
      g.stroke({ width: 2, color: 0xff4444, alpha: 0.6 });
    }

    this.drawHomeZone(punchIsKidnapped);
  }

  private drawBushes() {
    const bushes = new Graphics();
    const positions = [
      { x: PUNCH_X - 180, y: PUNCH_Y - 160 },
      { x: PUNCH_X + 200, y: PUNCH_Y - 140 },
      { x: PUNCH_X - 160, y: PUNCH_Y + 180 },
      { x: PUNCH_X + 170, y: PUNCH_Y + 160 },
      { x: 200, y: 200 }, { x: 1000, y: 200 },
      { x: 200, y: 1000 }, { x: 1000, y: 1000 },
      { x: 600, y: 150 }, { x: 600, y: 1050 },
      { x: 150, y: 600 }, { x: 1050, y: 600 },
    ];
    for (const p of positions) {
      const size = 15 + Math.random() * 15;
      bushes.circle(p.x, p.y, size);
      bushes.fill({ color: 0x2d5a2d + Math.floor(Math.random() * 0x102010), alpha: 0.6 });
    }
    this.container.addChild(bushes);
  }

  private drawTrees() {
    const treePositions = [
      { x: 50, y: 50 }, { x: ARENA_WIDTH - 50, y: 50 },
      { x: 50, y: ARENA_HEIGHT - 50 }, { x: ARENA_WIDTH - 50, y: ARENA_HEIGHT - 50 },
      { x: 300, y: 50 }, { x: 900, y: 50 },
      { x: 300, y: ARENA_HEIGHT - 50 }, { x: 900, y: ARENA_HEIGHT - 50 },
      { x: 50, y: 300 }, { x: 50, y: 900 },
      { x: ARENA_WIDTH - 50, y: 300 }, { x: ARENA_WIDTH - 50, y: 900 },
    ];
    for (const p of treePositions) {
      const tree = new Graphics();
      tree.rect(p.x - 5, p.y - 5, 10, 20);
      tree.fill(0x4a3520);
      tree.circle(p.x, p.y - 10, 20);
      tree.fill({ color: 0x1d6b1d, alpha: 0.7 });
      this.container.addChild(tree);
    }
  }
}

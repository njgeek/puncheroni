import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { toIso } from '../utils/iso';
import {
  ARENA_WIDTH, ARENA_HEIGHT, PUNCH_X, PUNCH_Y, PUNCH_ZONE_RADIUS,
  EXTRACTION_ZONES, EXTRACTION_ZONE_RADIUS, RESCUE_RETURN_RANGE,
} from '@shared/constants';

export class ArenaRenderer {
  container = new Container();
  private extractionZones: { g: Graphics; label: Text; gameX: number; gameY: number }[] = [];
  private homeZone!: Graphics;
  private animTime = 0;

  init() {
    // Diamond ground (iso-transformed arena corners)
    const bg = new Graphics();
    const tl = toIso(0, 0);
    const tr = toIso(ARENA_WIDTH, 0);
    const br = toIso(ARENA_WIDTH, ARENA_HEIGHT);
    const bl = toIso(0, ARENA_HEIGHT);

    bg.moveTo(tl.x, tl.y);
    bg.lineTo(tr.x, tr.y);
    bg.lineTo(br.x, br.y);
    bg.lineTo(bl.x, bl.y);
    bg.closePath();
    bg.fill(0x1a3a1a);
    this.container.addChild(bg);

    // Diamond grid lines
    const grid = new Graphics();
    const step = 60;
    for (let x = 0; x <= ARENA_WIDTH; x += step) {
      const s = toIso(x, 0);
      const e = toIso(x, ARENA_HEIGHT);
      grid.moveTo(s.x, s.y);
      grid.lineTo(e.x, e.y);
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += step) {
      const s = toIso(0, y);
      const e = toIso(ARENA_WIDTH, y);
      grid.moveTo(s.x, s.y);
      grid.lineTo(e.x, e.y);
    }
    grid.stroke({ width: 1, color: 0x224422, alpha: 0.25 });
    this.container.addChild(grid);

    // Arena border (darker edge with fence segments)
    const border = new Graphics();
    border.moveTo(tl.x, tl.y);
    border.lineTo(tr.x, tr.y);
    border.lineTo(br.x, br.y);
    border.lineTo(bl.x, bl.y);
    border.closePath();
    border.stroke({ width: 4, color: 0x112211, alpha: 0.8 });
    this.container.addChild(border);

    // Home zone (center)
    this.homeZone = new Graphics();
    this.container.addChild(this.homeZone);
    this.drawHomeZone(false);

    // Extraction zones at edges
    for (const zone of EXTRACTION_ZONES) {
      const g = new Graphics();
      const isoPos = toIso(zone.x, zone.y);
      g.x = isoPos.x;
      g.y = isoPos.y;

      const label = new Text({
        text: 'EXIT',
        style: new TextStyle({
          fontSize: 14,
          fontWeight: 'bold',
          fill: '#ff4444',
          stroke: { color: '#000000', width: 3 },
        }),
      });
      label.anchor.set(0.5);
      label.x = isoPos.x;
      label.y = isoPos.y - 35;

      this.extractionZones.push({ g, label, gameX: zone.x, gameY: zone.y });
      this.container.addChild(g);
      this.container.addChild(label);
    }

    this.drawBushes();
    this.drawTrees();
  }

  private drawHomeZone(punchIsAway: boolean) {
    this.homeZone.clear();
    const center = toIso(PUNCH_X, PUNCH_Y);

    // Iso circle = ellipse (wider than tall)
    const clearingR = PUNCH_ZONE_RADIUS + 40;
    this.homeZone.ellipse(center.x, center.y, clearingR * 1.4, clearingR * 0.7);
    this.homeZone.fill({ color: 0x2a4a2a, alpha: 0.5 });

    if (punchIsAway) {
      const rr = RESCUE_RETURN_RANGE;
      this.homeZone.ellipse(center.x, center.y, rr * 1.4, rr * 0.7);
      this.homeZone.stroke({ width: 3, color: 0x44aaff, alpha: 0.6 });

      this.homeZone.ellipse(center.x, center.y, 14, 7);
      this.homeZone.fill({ color: 0x44aaff, alpha: 0.4 });
    } else {
      const r = PUNCH_ZONE_RADIUS;
      this.homeZone.ellipse(center.x, center.y, r * 1.4, r * 0.7);
      this.homeZone.stroke({ width: 2, color: 0x66aa66, alpha: 0.4 });
    }
  }

  update(dt: number, punchIsKidnapped: boolean) {
    this.animTime += dt;

    const pulse = Math.sin(this.animTime * 3) * 0.3 + 0.7;
    for (const ez of this.extractionZones) {
      ez.g.clear();

      // Iso ellipse for extraction zone
      const r = EXTRACTION_ZONE_RADIUS;
      ez.g.ellipse(0, 0, r * 1.4, r * 0.7);
      ez.g.fill({ color: 0xff2222, alpha: 0.08 * pulse });
      ez.g.ellipse(0, 0, r * 1.4, r * 0.7);
      ez.g.stroke({ width: 2, color: 0xff4444, alpha: 0.4 * pulse });

      // X mark
      ez.g.moveTo(-10, -5);
      ez.g.lineTo(10, 5);
      ez.g.moveTo(10, -5);
      ez.g.lineTo(-10, 5);
      ez.g.stroke({ width: 2, color: 0xff4444, alpha: 0.6 });

      // Pulsing EXIT label
      ez.label.alpha = 0.5 + 0.5 * pulse;
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
      const iso = toIso(p.x, p.y);
      const size = 15 + Math.random() * 15;

      // Shadow ellipse beneath
      bushes.ellipse(iso.x, iso.y + 3, size * 1.2, size * 0.5);
      bushes.fill({ color: 0x000000, alpha: 0.15 });

      // Bush ellipse (wider in iso view)
      bushes.ellipse(iso.x, iso.y - 4, size * 1.3, size * 0.7);
      bushes.fill({ color: 0x2d5a2d + Math.floor(Math.random() * 0x102010), alpha: 0.6 });
    }
    this.container.addChild(bushes);
  }

  private drawTrees() {
    const treePositions = [
      { x: 80, y: 80 }, { x: ARENA_WIDTH - 80, y: 80 },
      { x: 80, y: ARENA_HEIGHT - 80 }, { x: ARENA_WIDTH - 80, y: ARENA_HEIGHT - 80 },
      { x: 300, y: 60 }, { x: 900, y: 60 },
      { x: 300, y: ARENA_HEIGHT - 60 }, { x: 900, y: ARENA_HEIGHT - 60 },
      { x: 60, y: 300 }, { x: 60, y: 900 },
      { x: ARENA_WIDTH - 60, y: 300 }, { x: ARENA_WIDTH - 60, y: 900 },
    ];
    for (const p of treePositions) {
      const iso = toIso(p.x, p.y);
      const tree = new Graphics();

      // Shadow ellipse on ground
      tree.ellipse(iso.x, iso.y + 5, 22, 10);
      tree.fill({ color: 0x000000, alpha: 0.2 });

      // Trunk (taller in iso view)
      tree.rect(iso.x - 4, iso.y - 30, 8, 32);
      tree.fill(0x4a3520);

      // Canopy (iso-perspective triangle/ellipse)
      tree.ellipse(iso.x, iso.y - 36, 22, 16);
      tree.fill({ color: 0x1d6b1d, alpha: 0.7 });
      tree.ellipse(iso.x, iso.y - 46, 16, 12);
      tree.fill({ color: 0x228822, alpha: 0.65 });

      this.container.addChild(tree);
    }
  }
}

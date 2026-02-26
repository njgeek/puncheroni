import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import {
  ARENA_WIDTH, ARENA_HEIGHT, PUNCH_X, PUNCH_Y, PUNCH_ZONE_RADIUS,
  EXTRACTION_ZONES, EXTRACTION_ZONE_RADIUS, RESCUE_RETURN_RANGE,
  MAP_WALLS, MAP_ROOMS,
} from '@shared/constants';

export class ArenaRenderer {
  container = new Container();
  private extractionZones: { g: Graphics; label: Text; gameX: number; gameY: number }[] = [];
  private homeZone!: Graphics;
  private animTime = 0;

  init() {
    // Main floor
    const bg = new Graphics();
    bg.rect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    bg.fill(0x1a1e2a);
    this.container.addChild(bg);

    // Floor grid (Among Us style tile pattern)
    const grid = new Graphics();
    const step = 60;
    for (let x = 0; x <= ARENA_WIDTH; x += step) {
      grid.moveTo(x, 0);
      grid.lineTo(x, ARENA_HEIGHT);
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += step) {
      grid.moveTo(0, y);
      grid.lineTo(ARENA_WIDTH, y);
    }
    grid.stroke({ width: 1, color: 0x252a38, alpha: 0.5 });
    this.container.addChild(grid);

    // Colored room floors
    for (const room of MAP_ROOMS) {
      const roomGfx = new Graphics();
      roomGfx.rect(room.x, room.y, room.w, room.h);
      roomGfx.fill({ color: room.color, alpha: 0.6 });
      roomGfx.rect(room.x, room.y, room.w, room.h);
      roomGfx.stroke({ width: 1, color: 0x3a4a6a, alpha: 0.3 });
      this.container.addChild(roomGfx);

      // Room label
      const label = new Text({
        text: room.name,
        style: new TextStyle({
          fontSize: 11,
          fill: '#3a5580',
          fontWeight: 'bold',
          stroke: { color: '#0a0e17', width: 2 },
        }),
      });
      label.anchor.set(0.5);
      label.x = room.x + room.w / 2;
      label.y = room.y + room.h / 2;
      this.container.addChild(label);
    }

    // Corridor floor highlights (connecting rooms)
    const corridors = new Graphics();
    // Top corridor
    corridors.rect(360, 150, 480, 140);
    corridors.fill({ color: 0x1e2230, alpha: 0.4 });
    // Bottom corridor
    corridors.rect(360, 910, 480, 140);
    corridors.fill({ color: 0x1e2230, alpha: 0.4 });
    // Left corridor
    corridors.rect(150, 360, 140, 480);
    corridors.fill({ color: 0x1e2230, alpha: 0.4 });
    // Right corridor
    corridors.rect(910, 360, 140, 480);
    corridors.fill({ color: 0x1e2230, alpha: 0.4 });
    this.container.addChild(corridors);

    // Walls (thick, Among Us style)
    const walls = new Graphics();
    for (const wall of MAP_WALLS) {
      // Wall shadow
      walls.rect(wall.x + 2, wall.y + 2, wall.w, wall.h);
      walls.fill({ color: 0x000000, alpha: 0.3 });
      // Wall body
      walls.rect(wall.x, wall.y, wall.w, wall.h);
      walls.fill(0x3a4255);
      // Wall highlight (top edge)
      walls.rect(wall.x, wall.y, wall.w, 2);
      walls.fill({ color: 0x5a6a80, alpha: 0.5 });
    }
    this.container.addChild(walls);

    // Arena border (thick outer wall)
    const border = new Graphics();
    border.rect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    border.stroke({ width: 8, color: 0x3a4255 });
    this.container.addChild(border);

    // Vents (Among Us style dark circles)
    const vents = [
      { x: 170, y: 170 }, { x: 1030, y: 170 },
      { x: 170, y: 1030 }, { x: 1030, y: 1030 },
      { x: 600, y: 250 }, { x: 600, y: 950 },
    ];
    const ventGfx = new Graphics();
    for (const v of vents) {
      ventGfx.circle(v.x, v.y, 16);
      ventGfx.fill({ color: 0x0a0e14, alpha: 0.8 });
      ventGfx.circle(v.x, v.y, 16);
      ventGfx.stroke({ width: 2, color: 0x333844 });
      // Vent slats
      ventGfx.rect(v.x - 10, v.y - 2, 20, 2);
      ventGfx.fill({ color: 0x333844, alpha: 0.6 });
      ventGfx.rect(v.x - 8, v.y + 3, 16, 2);
      ventGfx.fill({ color: 0x333844, alpha: 0.4 });
    }
    this.container.addChild(ventGfx);

    // Console stations (colored interactive panels)
    const consoles = [
      { x: 200, y: 250, color: 0x22aa66 },
      { x: 1000, y: 250, color: 0xaa2222 },
      { x: 200, y: 950, color: 0x2266aa },
      { x: 1000, y: 950, color: 0xaa8822 },
      { x: 400, y: 600, color: 0x22aa66 },
      { x: 800, y: 600, color: 0x22aa66 },
    ];
    const consoleGfx = new Graphics();
    for (const c of consoles) {
      consoleGfx.rect(c.x - 14, c.y - 8, 28, 16);
      consoleGfx.fill(0x2a3a50);
      consoleGfx.rect(c.x - 14, c.y - 8, 28, 16);
      consoleGfx.stroke({ width: 1, color: 0x4a5a70 });
      consoleGfx.rect(c.x - 10, c.y - 5, 20, 8);
      consoleGfx.fill({ color: c.color, alpha: 0.4 });
    }
    this.container.addChild(consoleGfx);

    // Wire conduits on floor
    const wires = new Graphics();
    const wireDefs = [
      { x1: 350, y1: 170, x2: 480, y2: 480, color: 0xcc3333 },
      { x1: 850, y1: 170, x2: 720, y2: 480, color: 0x33cc33 },
      { x1: 350, y1: 1030, x2: 480, y2: 720, color: 0x3388ff },
      { x1: 850, y1: 1030, x2: 720, y2: 720, color: 0xcccc33 },
    ];
    for (const w of wireDefs) {
      wires.moveTo(w.x1, w.y1);
      wires.lineTo(w.x2, w.y2);
      wires.stroke({ width: 3, color: w.color, alpha: 0.15 });
    }
    this.container.addChild(wires);

    // Home zone (reactor core)
    this.homeZone = new Graphics();
    this.container.addChild(this.homeZone);
    this.drawHomeZone(false);

    // Extraction zones (airlocks at edges)
    for (const zone of EXTRACTION_ZONES) {
      const g = new Graphics();
      g.x = zone.x;
      g.y = zone.y;

      const label = new Text({
        text: 'EXIT',
        style: new TextStyle({
          fontSize: 13,
          fontWeight: 'bold',
          fill: '#ff4444',
          stroke: { color: '#000000', width: 3 },
        }),
      });
      label.anchor.set(0.5);
      label.x = zone.x;
      label.y = zone.y - 30;

      this.extractionZones.push({ g, label, gameX: zone.x, gameY: zone.y });
      this.container.addChild(g);
      this.container.addChild(label);
    }
  }

  private drawHomeZone(punchIsAway: boolean) {
    this.homeZone.clear();

    // Reactor core platform
    const clearingR = PUNCH_ZONE_RADIUS + 40;
    this.homeZone.circle(PUNCH_X, PUNCH_Y, clearingR);
    this.homeZone.fill({ color: 0x2a3550, alpha: 0.4 });
    this.homeZone.circle(PUNCH_X, PUNCH_Y, clearingR);
    this.homeZone.stroke({ width: 2, color: 0x225588, alpha: 0.3 });

    if (punchIsAway) {
      this.homeZone.circle(PUNCH_X, PUNCH_Y, RESCUE_RETURN_RANGE);
      this.homeZone.stroke({ width: 3, color: 0x44aaff, alpha: 0.6 });
      this.homeZone.circle(PUNCH_X, PUNCH_Y, 10);
      this.homeZone.fill({ color: 0x44aaff, alpha: 0.4 });
    } else {
      this.homeZone.circle(PUNCH_X, PUNCH_Y, PUNCH_ZONE_RADIUS);
      this.homeZone.fill({ color: 0x1a3355, alpha: 0.3 });
      this.homeZone.circle(PUNCH_X, PUNCH_Y, PUNCH_ZONE_RADIUS);
      this.homeZone.stroke({ width: 2, color: 0x4488aa, alpha: 0.3 });
    }
  }

  update(dt: number, punchIsKidnapped: boolean) {
    this.animTime += dt;

    const pulse = Math.sin(this.animTime * 3) * 0.3 + 0.7;
    for (const ez of this.extractionZones) {
      ez.g.clear();
      const r = EXTRACTION_ZONE_RADIUS;
      ez.g.circle(0, 0, r);
      ez.g.fill({ color: 0x441111, alpha: 0.15 * pulse });
      ez.g.circle(0, 0, r);
      ez.g.stroke({ width: 3, color: 0xff3333, alpha: 0.4 * pulse });
      // Hazard stripes
      ez.g.rect(-15, -2, 30, 3);
      ez.g.fill({ color: 0xff4444, alpha: 0.3 * pulse });
      ez.label.alpha = 0.5 + 0.5 * pulse;
    }

    this.drawHomeZone(punchIsKidnapped);
  }
}

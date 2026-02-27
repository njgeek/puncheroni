import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import {
  ARENA_WIDTH, ARENA_HEIGHT, PUNCH_X, PUNCH_Y, PUNCH_ZONE_RADIUS,
  EXTRACTION_ZONES, EXTRACTION_ZONE_RADIUS, RESCUE_RETURN_RANGE,
  MAP_WALLS, MAP_ROOMS,
} from '@shared/constants';

// Room/corridor layout (for visual reference — all areas are physically walkable):
//  Corner rooms: 40-300 or 900-1160, y = same
//  Corridors: left (x=40-300, y=300-900), right, top (x=300-900, y=40-300), bottom
//  Center: x=300-900, y=300-900 (contains Reactor at 440-760)

export class ArenaRenderer {
  container = new Container();
  private extractionZones: { g: Graphics; label: Text }[] = [];
  private homeZone!: Graphics;
  private animTime = 0;

  init() {
    // ── 1. Outer hull (very dark — the "outside space" border) ──────────────
    const hull = new Graphics();
    hull.rect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    hull.fill(0x0d1018);
    this.container.addChild(hull);

    // ── 2. Interior floor — the full walkable cross + corner rooms ──────────
    const floor = new Graphics();
    const floorColor = 0x1a1e2a;

    // 4 corner rooms
    floor.rect(40, 40, 260, 260);   floor.fill(floorColor); // top-left
    floor.rect(900, 40, 260, 260);  floor.fill(floorColor); // top-right
    floor.rect(40, 900, 260, 260);  floor.fill(floorColor); // bottom-left
    floor.rect(900, 900, 260, 260); floor.fill(floorColor); // bottom-right

    // Horizontal corridor (connects left ↔ right through center)
    floor.rect(40, 300, 1120, 600); floor.fill(floorColor);
    // Vertical corridor (connects top ↔ bottom through center)
    floor.rect(300, 40, 600, 1120); floor.fill(floorColor);

    this.container.addChild(floor);

    // ── 3. Hull wall panels (thick dark borders around the interior) ─────────
    // These are purely visual — 20px thick inner panels that line the interior edge
    const panels = new Graphics();
    const panelColor = 0x1e2535;
    // Top wall strip
    panels.rect(40, 40, 1120, 20);    panels.fill(panelColor);
    panels.rect(40, 1140, 1120, 20);  panels.fill(panelColor);
    // Left/right wall strips
    panels.rect(40, 40, 20, 1120);    panels.fill(panelColor);
    panels.rect(1140, 40, 20, 1120);  panels.fill(panelColor);
    // The "hull gap" areas (dark outside the cross shape but inside the outer hull)
    // These are decorative fills that show where the ship's hull is, not walkable walls
    panels.rect(0, 0, 40, 40);   panels.fill(0x0d1018); // corner shadows
    panels.rect(1160, 0, 40, 40); panels.fill(0x0d1018);
    panels.rect(0, 1160, 40, 40); panels.fill(0x0d1018);
    panels.rect(1160, 1160, 40, 40); panels.fill(0x0d1018);
    this.container.addChild(panels);

    // ── 4. Floor tile grid (subtle) ──────────────────────────────────────────
    const grid = new Graphics();
    const step = 60;
    for (let x = 0; x <= ARENA_WIDTH; x += step) {
      grid.moveTo(x, 0); grid.lineTo(x, ARENA_HEIGHT);
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += step) {
      grid.moveTo(0, y); grid.lineTo(ARENA_WIDTH, y);
    }
    grid.stroke({ width: 1, color: 0x222838, alpha: 0.35 });
    this.container.addChild(grid);

    // ── 5. Room divider lines (visual only — corridor borders) ──────────────
    const dividers = new Graphics();
    const dColor = 0x2a3548;
    const dAlpha = 0.6;
    // Horizontal dividers between corner rooms and corridors
    dividers.rect(40, 300, 260, 3);   dividers.fill({ color: dColor, alpha: dAlpha }); // top-left bottom
    dividers.rect(40, 597, 260, 3);   dividers.fill({ color: dColor, alpha: dAlpha }); // left room top
    dividers.rect(40, 900, 260, 3);   dividers.fill({ color: dColor, alpha: dAlpha }); // bottom-left top
    dividers.rect(900, 300, 260, 3);  dividers.fill({ color: dColor, alpha: dAlpha }); // right rooms
    dividers.rect(900, 597, 260, 3);  dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(900, 900, 260, 3);  dividers.fill({ color: dColor, alpha: dAlpha });
    // Vertical dividers between corner rooms and corridors
    dividers.rect(300, 40, 3, 260);   dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(597, 40, 3, 260);   dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(900, 40, 3, 260);   dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(300, 900, 3, 260);  dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(597, 900, 3, 260);  dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(900, 900, 3, 260);  dividers.fill({ color: dColor, alpha: dAlpha });
    this.container.addChild(dividers);

    // ── 6. Colored room floors ───────────────────────────────────────────────
    for (const room of MAP_ROOMS) {
      const g = new Graphics();
      g.rect(room.x, room.y, room.w, room.h);
      g.fill({ color: room.color, alpha: 0.55 });
      this.container.addChild(g);

      const label = new Text({
        text: room.name,
        style: new TextStyle({
          fontSize: 10,
          fill: '#3a5075',
          fontWeight: 'bold',
          letterSpacing: 1,
        }),
      });
      label.anchor.set(0.5);
      label.x = room.x + room.w / 2;
      label.y = room.y + room.h / 2;
      this.container.addChild(label);
    }

    // ── 7. Corridor center light strips (Among Us aesthetic) ────────────────
    const lights = new Graphics();
    // Left corridor center strip
    lights.rect(160, 310, 3, 580); lights.fill({ color: 0x4a6a8a, alpha: 0.12 });
    // Right corridor
    lights.rect(1037, 310, 3, 580); lights.fill({ color: 0x4a6a8a, alpha: 0.12 });
    // Top corridor
    lights.rect(310, 160, 580, 3); lights.fill({ color: 0x4a6a8a, alpha: 0.12 });
    // Bottom corridor
    lights.rect(310, 1037, 580, 3); lights.fill({ color: 0x4a6a8a, alpha: 0.12 });
    this.container.addChild(lights);

    // ── 8. Table/console obstacles (match MAP_WALLS exactly) ─────────────────
    const tables = new Graphics();
    for (const wall of MAP_WALLS) {
      // Shadow
      tables.rect(wall.x + 2, wall.y + 2, wall.w, wall.h);
      tables.fill({ color: 0x000000, alpha: 0.35 });
      // Table body
      tables.rect(wall.x, wall.y, wall.w, wall.h);
      tables.fill(0x2a3548);
      // Top highlight edge
      tables.rect(wall.x, wall.y, wall.w, 3);
      tables.fill({ color: 0x4a6280, alpha: 0.8 });
      // Screen glow (green)
      tables.rect(wall.x + 10, wall.y + 5, wall.w - 20, 7);
      tables.fill({ color: 0x22cc66, alpha: 0.3 });
    }
    this.container.addChild(tables);

    // ── 9. Vents (iconic Among Us feature) ───────────────────────────────────
    const ventPositions = [
      { x: 170, y: 170 }, { x: 1030, y: 170 },
      { x: 170, y: 1030 }, { x: 1030, y: 1030 },
      { x: 600, y: 210 }, { x: 600, y: 990 },
      { x: 210, y: 600 }, { x: 990, y: 600 },
    ];
    const vents = new Graphics();
    for (const v of ventPositions) {
      vents.ellipse(v.x, v.y, 20, 13);
      vents.fill({ color: 0x080c12, alpha: 0.85 });
      vents.ellipse(v.x, v.y, 20, 13);
      vents.stroke({ width: 2, color: 0x2a3548 });
      // Horizontal slats
      for (let i = -1; i <= 1; i++) {
        vents.rect(v.x - 13, v.y + i * 4 - 1, 26, 2);
        vents.fill({ color: 0x2a3548, alpha: 0.6 });
      }
    }
    this.container.addChild(vents);

    // ── 10. Arena outer border ────────────────────────────────────────────────
    const border = new Graphics();
    border.rect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    border.stroke({ width: 8, color: 0x1a2030 });
    this.container.addChild(border);

    // ── 11. Home zone (Reactor core) ─────────────────────────────────────────
    this.homeZone = new Graphics();
    this.container.addChild(this.homeZone);
    this.drawHomeZone(false);

    // ── 12. Extraction zones (airlock doors at corridor exits) ────────────────
    for (const zone of EXTRACTION_ZONES) {
      const g = new Graphics();
      g.x = zone.x;
      g.y = zone.y;

      const label = new Text({
        text: 'EXIT',
        style: new TextStyle({
          fontSize: 12,
          fontWeight: 'bold',
          fill: '#ff4444',
          stroke: { color: '#000000', width: 3 },
        }),
      });
      label.anchor.set(0.5);
      label.x = zone.x;
      label.y = zone.y - 32;

      this.extractionZones.push({ g, label });
      this.container.addChild(g);
      this.container.addChild(label);
    }
  }

  private drawHomeZone(punchIsAway: boolean) {
    this.homeZone.clear();

    // Reactor platform glow
    const clearingR = PUNCH_ZONE_RADIUS + 40;
    this.homeZone.circle(PUNCH_X, PUNCH_Y, clearingR);
    this.homeZone.fill({ color: 0x2a3a55, alpha: 0.4 });
    this.homeZone.circle(PUNCH_X, PUNCH_Y, clearingR);
    this.homeZone.stroke({ width: 2, color: 0x335588, alpha: 0.35 });

    if (punchIsAway) {
      // Rescue beacon
      this.homeZone.circle(PUNCH_X, PUNCH_Y, RESCUE_RETURN_RANGE);
      this.homeZone.stroke({ width: 3, color: 0x44aaff, alpha: 0.7 });
      this.homeZone.circle(PUNCH_X, PUNCH_Y, 10);
      this.homeZone.fill({ color: 0x44aaff, alpha: 0.45 });
    } else {
      this.homeZone.circle(PUNCH_X, PUNCH_Y, PUNCH_ZONE_RADIUS);
      this.homeZone.fill({ color: 0x1a3355, alpha: 0.35 });
      this.homeZone.circle(PUNCH_X, PUNCH_Y, PUNCH_ZONE_RADIUS);
      this.homeZone.stroke({ width: 2, color: 0x4488aa, alpha: 0.35 });
    }
  }

  update(dt: number, punchIsKidnapped: boolean) {
    this.animTime += dt;

    const pulse = Math.sin(this.animTime * 3) * 0.3 + 0.7;
    for (const ez of this.extractionZones) {
      ez.g.clear();
      const r = EXTRACTION_ZONE_RADIUS;
      ez.g.circle(0, 0, r);
      ez.g.fill({ color: 0x440808, alpha: 0.2 * pulse });
      ez.g.circle(0, 0, r);
      ez.g.stroke({ width: 3, color: 0xff2222, alpha: 0.5 * pulse });
      // Hazard stripes
      ez.g.rect(-16, -2, 32, 3);
      ez.g.fill({ color: 0xff4444, alpha: 0.3 * pulse });
      ez.label.alpha = 0.5 + 0.5 * pulse;
    }

    this.drawHomeZone(punchIsKidnapped);
  }
}

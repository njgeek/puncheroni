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
    // Diamond floor — dark metallic space station
    const bg = new Graphics();
    const tl = toIso(0, 0);
    const tr = toIso(ARENA_WIDTH, 0);
    const br = toIso(ARENA_WIDTH, ARENA_HEIGHT);
    const bl = toIso(0, ARENA_HEIGHT);

    // Main floor
    bg.moveTo(tl.x, tl.y);
    bg.lineTo(tr.x, tr.y);
    bg.lineTo(br.x, br.y);
    bg.lineTo(bl.x, bl.y);
    bg.closePath();
    bg.fill(0x1a1e2a);
    this.container.addChild(bg);

    // Floor panel grid (Among Us style metal panels)
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
    grid.stroke({ width: 1, color: 0x2a3040, alpha: 0.4 });
    this.container.addChild(grid);

    // Colored floor zones (room-like areas, Among Us vibe)
    this.drawRooms();

    // Arena border — thick wall
    const border = new Graphics();
    border.moveTo(tl.x, tl.y);
    border.lineTo(tr.x, tr.y);
    border.lineTo(br.x, br.y);
    border.lineTo(bl.x, bl.y);
    border.closePath();
    border.stroke({ width: 5, color: 0x0e1118, alpha: 0.9 });
    this.container.addChild(border);

    // Wall inner highlight
    const wallInner = new Graphics();
    wallInner.moveTo(tl.x, tl.y);
    wallInner.lineTo(tr.x, tr.y);
    wallInner.lineTo(br.x, br.y);
    wallInner.lineTo(bl.x, bl.y);
    wallInner.closePath();
    wallInner.stroke({ width: 2, color: 0x3a4460, alpha: 0.5 });
    this.container.addChild(wallInner);

    // Home zone (center — reactor room)
    this.homeZone = new Graphics();
    this.container.addChild(this.homeZone);
    this.drawHomeZone(false);

    // Extraction zones — airlocks at edges
    for (const zone of EXTRACTION_ZONES) {
      const g = new Graphics();
      const isoPos = toIso(zone.x, zone.y);
      g.x = isoPos.x;
      g.y = isoPos.y;

      const label = new Text({
        text: 'AIRLOCK',
        style: new TextStyle({
          fontSize: 12,
          fontWeight: 'bold',
          fill: '#ff4444',
          stroke: { color: '#000000', width: 3 },
        }),
      });
      label.anchor.set(0.5);
      label.x = isoPos.x;
      label.y = isoPos.y - 30;

      this.extractionZones.push({ g, label, gameX: zone.x, gameY: zone.y });
      this.container.addChild(g);
      this.container.addChild(label);
    }

    // Station decorations (consoles, vents, wires)
    this.drawDecorations();
  }

  private drawRooms() {
    const rooms = new Graphics();
    const cx = ARENA_WIDTH / 2;
    const cy = ARENA_HEIGHT / 2;

    // Center reactor room — slightly lighter floor
    const reactorPts = [
      toIso(cx - 150, cy - 150),
      toIso(cx + 150, cy - 150),
      toIso(cx + 150, cy + 150),
      toIso(cx - 150, cy + 150),
    ];
    rooms.moveTo(reactorPts[0].x, reactorPts[0].y);
    for (let i = 1; i < reactorPts.length; i++) {
      rooms.lineTo(reactorPts[i].x, reactorPts[i].y);
    }
    rooms.closePath();
    rooms.fill({ color: 0x222840, alpha: 0.6 });
    rooms.moveTo(reactorPts[0].x, reactorPts[0].y);
    for (let i = 1; i < reactorPts.length; i++) {
      rooms.lineTo(reactorPts[i].x, reactorPts[i].y);
    }
    rooms.closePath();
    rooms.stroke({ width: 2, color: 0x3a4a6a, alpha: 0.4 });

    // Corner rooms (slightly tinted)
    const roomDefs = [
      { x: 150, y: 150, w: 200, h: 200, color: 0x1e2838 },   // top-left: storage
      { x: 850, y: 150, w: 200, h: 200, color: 0x1e2838 },   // top-right: medbay
      { x: 150, y: 850, w: 200, h: 200, color: 0x1e2838 },   // bottom-left: shields
      { x: 850, y: 850, w: 200, h: 200, color: 0x1e2838 },   // bottom-right: engines
    ];
    for (const r of roomDefs) {
      const pts = [
        toIso(r.x, r.y),
        toIso(r.x + r.w, r.y),
        toIso(r.x + r.w, r.y + r.h),
        toIso(r.x, r.y + r.h),
      ];
      rooms.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) rooms.lineTo(pts[i].x, pts[i].y);
      rooms.closePath();
      rooms.fill({ color: r.color, alpha: 0.5 });
      rooms.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) rooms.lineTo(pts[i].x, pts[i].y);
      rooms.closePath();
      rooms.stroke({ width: 1, color: 0x3a4a6a, alpha: 0.3 });
    }

    this.container.addChild(rooms);

    // Room labels
    const labelStyle = new TextStyle({
      fontSize: 10,
      fill: '#3a5580',
      fontWeight: 'bold',
      stroke: { color: '#0a0e17', width: 2 },
    });
    const labels = [
      { text: 'STORAGE', x: 250, y: 250 },
      { text: 'MEDBAY', x: 950, y: 250 },
      { text: 'SHIELDS', x: 250, y: 950 },
      { text: 'ENGINES', x: 950, y: 950 },
      { text: 'REACTOR', x: cx, y: cy - 120 },
    ];
    for (const l of labels) {
      const iso = toIso(l.x, l.y);
      const t = new Text({ text: l.text, style: labelStyle });
      t.anchor.set(0.5);
      t.x = iso.x;
      t.y = iso.y;
      this.container.addChild(t);
    }
  }

  private drawHomeZone(punchIsAway: boolean) {
    this.homeZone.clear();
    const center = toIso(PUNCH_X, PUNCH_Y);

    // Reactor core platform
    const clearingR = PUNCH_ZONE_RADIUS + 40;
    this.homeZone.ellipse(center.x, center.y, clearingR * 1.4, clearingR * 0.7);
    this.homeZone.fill({ color: 0x2a3550, alpha: 0.5 });

    // Reactor ring (glowing cyan)
    this.homeZone.ellipse(center.x, center.y, clearingR * 1.1, clearingR * 0.55);
    this.homeZone.stroke({ width: 2, color: 0x225588, alpha: 0.3 });

    if (punchIsAway) {
      const rr = RESCUE_RETURN_RANGE;
      this.homeZone.ellipse(center.x, center.y, rr * 1.4, rr * 0.7);
      this.homeZone.stroke({ width: 3, color: 0x44aaff, alpha: 0.6 });
      this.homeZone.ellipse(center.x, center.y, 14, 7);
      this.homeZone.fill({ color: 0x44aaff, alpha: 0.4 });
    } else {
      const r = PUNCH_ZONE_RADIUS;
      // Inner reactor glow
      this.homeZone.ellipse(center.x, center.y, r * 1.0, r * 0.5);
      this.homeZone.fill({ color: 0x1a3355, alpha: 0.3 });
      this.homeZone.ellipse(center.x, center.y, r * 1.4, r * 0.7);
      this.homeZone.stroke({ width: 2, color: 0x4488aa, alpha: 0.3 });
    }
  }

  update(dt: number, punchIsKidnapped: boolean) {
    this.animTime += dt;

    const pulse = Math.sin(this.animTime * 3) * 0.3 + 0.7;
    for (const ez of this.extractionZones) {
      ez.g.clear();

      // Airlock door frame
      const r = EXTRACTION_ZONE_RADIUS;
      ez.g.ellipse(0, 0, r * 1.4, r * 0.7);
      ez.g.fill({ color: 0x441111, alpha: 0.15 * pulse });
      ez.g.ellipse(0, 0, r * 1.4, r * 0.7);
      ez.g.stroke({ width: 2, color: 0xff3333, alpha: 0.4 * pulse });

      // Danger stripes (hazard lines)
      ez.g.rect(-15, -3, 30, 2);
      ez.g.fill({ color: 0xff4444, alpha: 0.3 * pulse });
      ez.g.rect(-10, 2, 20, 2);
      ez.g.fill({ color: 0xff4444, alpha: 0.2 * pulse });

      ez.label.alpha = 0.5 + 0.5 * pulse;
    }

    this.drawHomeZone(punchIsKidnapped);
  }

  private drawDecorations() {
    const deco = new Graphics();

    // Console stations (rectangular panels at various locations)
    const consoles = [
      { x: 200, y: 400 }, { x: 400, y: 200 },
      { x: 1000, y: 400 }, { x: 800, y: 200 },
      { x: 200, y: 800 }, { x: 400, y: 1000 },
      { x: 1000, y: 800 }, { x: 800, y: 1000 },
      { x: 500, y: 500 }, { x: 700, y: 700 },
    ];
    for (const c of consoles) {
      const iso = toIso(c.x, c.y);
      // Console base
      deco.rect(iso.x - 12, iso.y - 4, 24, 8);
      deco.fill({ color: 0x2a3a50, alpha: 0.7 });
      deco.rect(iso.x - 12, iso.y - 4, 24, 8);
      deco.stroke({ width: 1, color: 0x4a5a70, alpha: 0.5 });
      // Screen glow
      deco.rect(iso.x - 8, iso.y - 3, 16, 4);
      deco.fill({ color: 0x22aa66, alpha: 0.3 });
    }

    // Vents (small dark circles — Among Us style)
    const vents = [
      { x: 300, y: 300 }, { x: 900, y: 300 },
      { x: 300, y: 900 }, { x: 900, y: 900 },
      { x: 600, y: 400 }, { x: 600, y: 800 },
    ];
    for (const v of vents) {
      const iso = toIso(v.x, v.y);
      deco.ellipse(iso.x, iso.y, 14, 7);
      deco.fill({ color: 0x111118, alpha: 0.6 });
      deco.ellipse(iso.x, iso.y, 14, 7);
      deco.stroke({ width: 1, color: 0x333344, alpha: 0.5 });
      // Vent slats
      deco.rect(iso.x - 10, iso.y - 1, 20, 1);
      deco.fill({ color: 0x333344, alpha: 0.4 });
      deco.rect(iso.x - 8, iso.y + 2, 16, 1);
      deco.fill({ color: 0x333344, alpha: 0.3 });
    }

    // Wire conduits (colored lines on floor, running between rooms)
    const wires = [
      { x1: 350, y1: 350, x2: 500, y2: 500, color: 0xcc3333 },
      { x1: 850, y1: 350, x2: 700, y2: 500, color: 0x33cc33 },
      { x1: 350, y1: 850, x2: 500, y2: 700, color: 0x3388ff },
      { x1: 850, y1: 850, x2: 700, y2: 700, color: 0xcccc33 },
    ];
    for (const w of wires) {
      const s = toIso(w.x1, w.y1);
      const e = toIso(w.x2, w.y2);
      deco.moveTo(s.x, s.y);
      deco.lineTo(e.x, e.y);
      deco.stroke({ width: 2, color: w.color, alpha: 0.2 });
    }

    this.container.addChild(deco);
  }
}

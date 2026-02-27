import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import {
  ARENA_WIDTH, ARENA_HEIGHT,
  MAP_WALLS, MAP_ROOMS,
  TASK_DEFINITIONS, VENT_GRAPH, EMERGENCY_BUTTON,
} from '@shared/constants';

export class ArenaRenderer {
  container = new Container();
  private animTime = 0;
  private emergencyBtn!: Graphics;
  private taskMarkers: { g: Graphics; label: Text }[] = [];

  init() {
    // ── 1. Outer hull ─────────────────────────────────────────────────────────
    const hull = new Graphics();
    hull.rect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    hull.fill(0x0d1018);
    this.container.addChild(hull);

    // ── 2. Interior floor (cross + corner rooms) ──────────────────────────────
    const floor = new Graphics();
    const floorColor = 0x1a1e2a;
    floor.rect(40, 40, 260, 260);   floor.fill(floorColor);
    floor.rect(900, 40, 260, 260);  floor.fill(floorColor);
    floor.rect(40, 900, 260, 260);  floor.fill(floorColor);
    floor.rect(900, 900, 260, 260); floor.fill(floorColor);
    floor.rect(40, 300, 1120, 600); floor.fill(floorColor);
    floor.rect(300, 40, 600, 1120); floor.fill(floorColor);
    this.container.addChild(floor);

    // ── 3. Hull panels ────────────────────────────────────────────────────────
    const panels = new Graphics();
    const panelColor = 0x1e2535;
    panels.rect(40, 40, 1120, 20);   panels.fill(panelColor);
    panels.rect(40, 1140, 1120, 20); panels.fill(panelColor);
    panels.rect(40, 40, 20, 1120);   panels.fill(panelColor);
    panels.rect(1140, 40, 20, 1120); panels.fill(panelColor);
    panels.rect(0, 0, 40, 40);       panels.fill(0x0d1018);
    panels.rect(1160, 0, 40, 40);    panels.fill(0x0d1018);
    panels.rect(0, 1160, 40, 40);    panels.fill(0x0d1018);
    panels.rect(1160, 1160, 40, 40); panels.fill(0x0d1018);
    this.container.addChild(panels);

    // ── 4. Floor grid ─────────────────────────────────────────────────────────
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

    // ── 5. Room dividers ──────────────────────────────────────────────────────
    const dividers = new Graphics();
    const dColor = 0x2a3548;
    const dAlpha = 0.6;
    dividers.rect(40, 300, 260, 3);  dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(40, 597, 260, 3);  dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(40, 900, 260, 3);  dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(900, 300, 260, 3); dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(900, 597, 260, 3); dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(900, 900, 260, 3); dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(300, 40, 3, 260);  dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(597, 40, 3, 260);  dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(900, 40, 3, 260);  dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(300, 900, 3, 260); dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(597, 900, 3, 260); dividers.fill({ color: dColor, alpha: dAlpha });
    dividers.rect(900, 900, 3, 260); dividers.fill({ color: dColor, alpha: dAlpha });
    this.container.addChild(dividers);

    // ── 6. Colored room floors ────────────────────────────────────────────────
    for (const room of MAP_ROOMS) {
      const g = new Graphics();
      g.rect(room.x, room.y, room.w, room.h);
      g.fill({ color: room.color, alpha: 0.55 });
      this.container.addChild(g);

      const label = new Text({
        text: room.name,
        style: new TextStyle({ fontSize: 10, fill: '#3a5075', fontWeight: 'bold', letterSpacing: 1 }),
      });
      label.anchor.set(0.5);
      label.x = room.x + room.w / 2;
      label.y = room.y + room.h / 2;
      this.container.addChild(label);
    }

    // ── 7. Corridor light strips ──────────────────────────────────────────────
    const lights = new Graphics();
    lights.rect(160, 310, 3, 580);   lights.fill({ color: 0x4a6a8a, alpha: 0.12 });
    lights.rect(1037, 310, 3, 580);  lights.fill({ color: 0x4a6a8a, alpha: 0.12 });
    lights.rect(310, 160, 580, 3);   lights.fill({ color: 0x4a6a8a, alpha: 0.12 });
    lights.rect(310, 1037, 580, 3);  lights.fill({ color: 0x4a6a8a, alpha: 0.12 });
    this.container.addChild(lights);

    // ── 8. Table/console obstacles ────────────────────────────────────────────
    const tables = new Graphics();
    for (const wall of MAP_WALLS) {
      tables.rect(wall.x + 2, wall.y + 2, wall.w, wall.h); tables.fill({ color: 0x000000, alpha: 0.35 });
      tables.rect(wall.x, wall.y, wall.w, wall.h);          tables.fill(0x2a3548);
      tables.rect(wall.x, wall.y, wall.w, 3);               tables.fill({ color: 0x4a6280, alpha: 0.8 });
      tables.rect(wall.x + 10, wall.y + 5, wall.w - 20, 7); tables.fill({ color: 0x22cc66, alpha: 0.3 });
    }
    this.container.addChild(tables);

    // ── 9. Vents ──────────────────────────────────────────────────────────────
    const vents = new Graphics();
    for (const v of VENT_GRAPH) {
      vents.ellipse(v.x, v.y, 20, 13);
      vents.fill({ color: 0x080c12, alpha: 0.85 });
      vents.ellipse(v.x, v.y, 20, 13);
      vents.stroke({ width: 2, color: 0x2a3548 });
      for (let i = -1; i <= 1; i++) {
        vents.rect(v.x - 13, v.y + i * 4 - 1, 26, 2);
        vents.fill({ color: 0x2a3548, alpha: 0.6 });
      }
    }
    this.container.addChild(vents);

    // ── 10. Border ────────────────────────────────────────────────────────────
    const border = new Graphics();
    border.rect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    border.stroke({ width: 8, color: 0x1a2030 });
    this.container.addChild(border);

    // ── 11. Task station markers ──────────────────────────────────────────────
    for (const task of TASK_DEFINITIONS) {
      const g = new Graphics();
      // Console panel (glow)
      g.roundRect(task.x - 14, task.y - 10, 28, 20, 4);
      g.fill({ color: 0x1a2a3a, alpha: 0.9 });
      g.roundRect(task.x - 14, task.y - 10, 28, 20, 4);
      g.stroke({ width: 2, color: 0x44aaff, alpha: 0.7 });
      // Screen glow
      g.roundRect(task.x - 9, task.y - 6, 18, 12, 2);
      g.fill({ color: 0x22aaff, alpha: 0.25 });
      // Glow dot
      g.circle(task.x, task.y, 4);
      g.fill({ color: 0x44ccff, alpha: 0.6 });
      this.container.addChild(g);

      const label = new Text({
        text: task.name.toUpperCase(),
        style: new TextStyle({
          fontSize: 8,
          fill: '#44aaff',
          fontWeight: 'bold',
          letterSpacing: 0.5,
          stroke: { color: '#000000', width: 2 },
        }),
      });
      label.anchor.set(0.5);
      label.x = task.x;
      label.y = task.y + 16;
      this.container.addChild(label);

      this.taskMarkers.push({ g, label });
    }

    // ── 12. Emergency button ──────────────────────────────────────────────────
    this.emergencyBtn = new Graphics();
    this.container.addChild(this.emergencyBtn);
    this.drawEmergencyButton(0);

    const emergencyLabel = new Text({
      text: '!',
      style: new TextStyle({
        fontSize: 20,
        fontWeight: '900',
        fill: '#ff2222',
        stroke: { color: '#000000', width: 3 },
      }),
    });
    emergencyLabel.anchor.set(0.5);
    emergencyLabel.x = EMERGENCY_BUTTON.x;
    emergencyLabel.y = EMERGENCY_BUTTON.y;
    this.container.addChild(emergencyLabel);

    const emergencyTextLabel = new Text({
      text: 'EMERGENCY',
      style: new TextStyle({
        fontSize: 9,
        fill: '#ff6666',
        fontWeight: 'bold',
        stroke: { color: '#000000', width: 2 },
      }),
    });
    emergencyTextLabel.anchor.set(0.5);
    emergencyTextLabel.x = EMERGENCY_BUTTON.x;
    emergencyTextLabel.y = EMERGENCY_BUTTON.y + 22;
    this.container.addChild(emergencyTextLabel);
  }

  private drawEmergencyButton(pulse: number) {
    this.emergencyBtn.clear();
    const x = EMERGENCY_BUTTON.x;
    const y = EMERGENCY_BUTTON.y;
    // Outer ring
    this.emergencyBtn.circle(x, y, 22 + pulse * 4);
    this.emergencyBtn.fill({ color: 0x440000, alpha: 0.4 + pulse * 0.2 });
    this.emergencyBtn.circle(x, y, 22);
    this.emergencyBtn.fill({ color: 0xcc1111, alpha: 0.8 });
    this.emergencyBtn.circle(x, y, 22);
    this.emergencyBtn.stroke({ width: 3, color: 0xff4444, alpha: 0.9 });
    // Inner button
    this.emergencyBtn.circle(x, y, 14);
    this.emergencyBtn.fill({ color: 0xff2222, alpha: 0.9 });
  }

  update(dt: number) {
    this.animTime += dt;
    const pulse = Math.sin(this.animTime * 2) * 0.5 + 0.5;
    this.drawEmergencyButton(pulse);
  }
}

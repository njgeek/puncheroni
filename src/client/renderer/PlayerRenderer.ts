import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { PLAYER_RADIUS } from '@shared/constants';

interface PlayerSprite {
  container: Container;
  body: Graphics;
  hpBar: Graphics;
  hpBarBg: Graphics;
  nameText: Text;
  team: string;
  carrierIndicator: Graphics;
  carrierLabel: Text;
  deathMarker: Graphics;
  gameY: number;
}

export class PlayerRenderer {
  container = new Container();
  private sprites = new Map<string, PlayerSprite>();

  getOrCreate(
    id: string,
    name: string,
    team: string,
    isLocal: boolean,
  ): PlayerSprite {
    let sprite = this.sprites.get(id);
    if (sprite) {
      if (sprite.team !== team) {
        this.container.removeChild(sprite.container);
        this.sprites.delete(id);
        sprite = undefined;
      }
    }

    if (!sprite) {
      const c = new Container();
      const isDefender = team === 'defender';

      const body = new Graphics();
      if (isDefender) {
        this.drawCrewmate(body, 0x3b7dd8, 0x5599ee, isLocal);
      } else {
        this.drawCrewmate(body, 0xc43a3a, 0xee5555, isLocal);
      }
      c.addChild(body);

      // Carrier indicator
      const carrierIndicator = new Graphics();
      carrierIndicator.alpha = 0;
      c.addChild(carrierIndicator);

      const carrierLabel = new Text({
        text: 'CARRIER',
        style: new TextStyle({
          fontSize: 9,
          fontWeight: 'bold',
          fill: '#ffffff',
          stroke: { color: '#000000', width: 2 },
        }),
      });
      carrierLabel.anchor.set(0.5);
      carrierLabel.y = -30;
      carrierLabel.visible = false;
      c.addChild(carrierLabel);

      // Death marker
      const deathMarker = new Graphics();
      deathMarker.visible = false;
      c.addChild(deathMarker);

      // HP bar bg
      const hpBarBg = new Graphics();
      hpBarBg.roundRect(-PLAYER_RADIUS, -26, PLAYER_RADIUS * 2, 5, 2);
      hpBarBg.fill(0x222222);
      c.addChild(hpBarBg);

      // HP bar
      const hpBar = new Graphics();
      c.addChild(hpBar);

      // Name
      const nameText = new Text({
        text: name,
        style: new TextStyle({
          fontSize: 10,
          fill: isLocal ? '#ffffff' : '#cccccc',
          fontWeight: isLocal ? 'bold' : 'normal',
          stroke: { color: '#000000', width: 3 },
        }),
      });
      nameText.anchor.set(0.5);
      nameText.y = PLAYER_RADIUS + 8;
      c.addChild(nameText);

      sprite = {
        container: c, body, hpBar, hpBarBg, nameText, team,
        carrierIndicator, carrierLabel, deathMarker, gameY: 0,
      };
      this.sprites.set(id, sprite);
      this.container.addChild(c);
    }

    return sprite;
  }

  /** Draw an Among Us crewmate (top-down view) */
  private drawCrewmate(g: Graphics, bodyColor: number, lightColor: number, isLocal: boolean) {
    // Shadow
    g.ellipse(0, 2, PLAYER_RADIUS + 2, PLAYER_RADIUS - 2);
    g.fill({ color: 0x000000, alpha: 0.25 });

    // Body (bean/capsule shape — rounded rectangle)
    g.roundRect(-10, -14, 20, 28, 8);
    g.fill(bodyColor);

    // Backpack (bump on back/bottom)
    g.roundRect(-13, 0, 6, 12, 3);
    g.fill(bodyColor);

    // Visor (front-facing, lighter color)
    g.roundRect(-6, -12, 12, 8, 3);
    g.fill(0xc8e6ff);
    // Visor shine
    g.roundRect(-4, -11, 4, 3, 1);
    g.fill({ color: 0xffffff, alpha: 0.5 });

    // Legs (two small bumps at bottom, visible in top-down)
    g.ellipse(-4, 14, 4, 3);
    g.fill(bodyColor);
    g.ellipse(4, 14, 4, 3);
    g.fill(bodyColor);

    // Direction indicator (small line from front)
    g.moveTo(0, -14);
    g.lineTo(0, -20);
    g.stroke({ width: 2, color: lightColor, alpha: 0.6 });

    // Local player ring
    if (isLocal) {
      g.circle(0, 0, PLAYER_RADIUS + 4);
      g.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    }
  }

  update(
    id: string,
    gameX: number,
    gameY: number,
    hp: number,
    maxHp: number,
    alive: boolean,
    attackAngle: number,
    isAttacking: boolean,
    isCarryingPunch: boolean = false,
    isCarryingPunchHome: boolean = false,
  ) {
    const sprite = this.sprites.get(id);
    if (!sprite) return;

    sprite.gameY = gameY;
    sprite.container.x = gameX;
    sprite.container.y = gameY;

    // Alive/dead
    if (!alive) {
      sprite.container.alpha = 0.35;
      sprite.body.tint = 0x888888;
      sprite.deathMarker.visible = true;
      sprite.deathMarker.clear();
      // Among Us death: body splits in half
      sprite.deathMarker.rect(-8, -6, 16, 3);
      sprite.deathMarker.fill(0xff4444);
      // Bone sticking out
      sprite.deathMarker.circle(0, -8, 3);
      sprite.deathMarker.fill(0xeeeeee);
    } else {
      sprite.container.alpha = 1;
      sprite.body.tint = 0xffffff;
      sprite.deathMarker.visible = false;
    }

    // Rotate body to face attack direction
    sprite.body.rotation = attackAngle + Math.PI / 2; // offset because body faces "up" by default

    // HP bar
    const ratio = Math.max(0, hp / maxHp);
    const barWidth = (PLAYER_RADIUS * 2 - 4) * ratio;
    const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xccaa22 : 0xcc3333;
    sprite.hpBar.clear();
    if (barWidth > 0) {
      sprite.hpBar.roundRect(-PLAYER_RADIUS + 2, -25, barWidth, 3, 1);
      sprite.hpBar.fill(color);
    }

    // Carrier indicator
    if (isCarryingPunch || isCarryingPunchHome) {
      const ringColor = isCarryingPunch ? 0xff4444 : 0x44aaff;
      sprite.carrierIndicator.clear();
      sprite.carrierIndicator.circle(0, 0, PLAYER_RADIUS + 8);
      sprite.carrierIndicator.stroke({ width: 3, color: ringColor, alpha: 0.8 });
      sprite.carrierIndicator.alpha = 1;
      sprite.carrierLabel.visible = true;
      sprite.carrierLabel.style.fill = isCarryingPunch ? '#ff6666' : '#66bbff';
    } else if (isAttacking) {
      sprite.carrierIndicator.clear();
      // Melee swing arc
      const arcColor = sprite.team === 'defender' ? 0x88bbff : 0xff6666;
      sprite.carrierIndicator.arc(0, 0, PLAYER_RADIUS + 18, attackAngle - 0.6, attackAngle + 0.6);
      sprite.carrierIndicator.stroke({ width: 4, color: arcColor, alpha: 0.7 });
      // Impact flash
      const flashX = Math.cos(attackAngle) * (PLAYER_RADIUS + 14);
      const flashY = Math.sin(attackAngle) * (PLAYER_RADIUS + 14);
      sprite.carrierIndicator.circle(flashX, flashY, 6);
      sprite.carrierIndicator.fill({ color: 0xffffff, alpha: 0.5 });
      sprite.carrierIndicator.alpha = 1;
      sprite.carrierLabel.visible = false;
    } else {
      if (sprite.carrierIndicator.alpha > 0) {
        sprite.carrierIndicator.alpha -= 0.15;
      }
      sprite.carrierLabel.visible = false;
    }
  }

  getGameY(id: string): number {
    return this.sprites.get(id)?.gameY ?? 0;
  }

  remove(id: string) {
    const sprite = this.sprites.get(id);
    if (sprite) {
      this.container.removeChild(sprite.container);
      this.sprites.delete(id);
    }
  }

  clear() {
    this.sprites.forEach((s) => this.container.removeChild(s.container));
    this.sprites.clear();
  }
}

import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { PLAYER_RADIUS } from '@shared/constants';
import { toIso } from '../utils/iso';

interface PlayerSprite {
  container: Container;
  body: Graphics;
  shadow: Graphics;
  hpBar: Graphics;
  hpBarBg: Graphics;
  nameText: Text;
  team: string;
  carrierIndicator: Graphics;
  carrierLabel: Text;
  deathMarker: Graphics;
  /** game-space Y for depth sorting */
  gameY: number;
}

export class PlayerRenderer {
  container = new Container();
  private sprites = new Map<string, PlayerSprite>();

  getOrCreate(
    id: string,
    name: string,
    team: string,
    isLocal: boolean
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
      const baseColor = isDefender ? 0x4a9eff : 0xff4a4a;
      const darkColor = isDefender ? 0x2a6ecc : 0xcc2a2a;

      // Shadow ellipse on ground plane
      const shadow = new Graphics();
      shadow.ellipse(0, 0, PLAYER_RADIUS * 1.3, PLAYER_RADIUS * 0.5);
      shadow.fill({ color: 0x000000, alpha: 0.25 });
      c.addChild(shadow);

      // Body: iso-perspective oval (wider than tall)
      const body = new Graphics();
      // Outer ring (team color)
      body.ellipse(0, -8, PLAYER_RADIUS * 1.1, PLAYER_RADIUS * 0.8);
      body.fill(baseColor);
      // Inner darker fill
      body.ellipse(0, -8, PLAYER_RADIUS * 0.85, PLAYER_RADIUS * 0.6);
      body.fill(darkColor);

      // Head (small circle above body, suggesting 3D from above)
      body.circle(0, -20, 7);
      body.fill(isDefender ? 0x6ab8ff : 0xff7a7a);

      // Direction indicator
      body.moveTo(PLAYER_RADIUS - 2, -8);
      body.lineTo(PLAYER_RADIUS + 8, -8);
      body.stroke({ width: 3, color: 0xffffff, alpha: 0.7 });

      // Local player marker
      if (isLocal) {
        body.ellipse(0, -8, PLAYER_RADIUS * 1.3, PLAYER_RADIUS * 1.0);
        body.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
      }

      c.addChild(body);

      // Carrier indicator (ring + label)
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
      carrierLabel.y = -36;
      carrierLabel.visible = false;
      c.addChild(carrierLabel);

      // Death marker
      const deathMarker = new Graphics();
      deathMarker.visible = false;
      c.addChild(deathMarker);

      // HP bar background
      const hpBarBg = new Graphics();
      hpBarBg.roundRect(-PLAYER_RADIUS, -32, PLAYER_RADIUS * 2, 5, 2);
      hpBarBg.fill(0x222222);
      c.addChild(hpBarBg);

      // HP bar
      const hpBar = new Graphics();
      c.addChild(hpBar);

      // Name text (screen-space, always readable)
      const nameText = new Text({
        text: name,
        style: new TextStyle({
          fontSize: 11,
          fill: isLocal ? '#ffffff' : '#cccccc',
          fontWeight: isLocal ? 'bold' : 'normal',
          stroke: { color: '#000000', width: 3 },
        }),
      });
      nameText.anchor.set(0.5);
      nameText.y = PLAYER_RADIUS * 0.5 + 6;
      c.addChild(nameText);

      sprite = {
        container: c, body, shadow, hpBar, hpBarBg, nameText, team,
        carrierIndicator, carrierLabel, deathMarker, gameY: 0,
      };
      this.sprites.set(id, sprite);
      this.container.addChild(c);
    }

    return sprite;
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

    // Store game-Y for depth sorting
    sprite.gameY = gameY;

    // Position at isometric coordinates
    const iso = toIso(gameX, gameY);
    sprite.container.x = iso.x;
    sprite.container.y = iso.y;

    // Alive/dead state
    if (!alive) {
      sprite.container.alpha = 0.35;
      sprite.body.tint = 0x888888;
      sprite.shadow.scale.set(1.2, 0.3);
      sprite.deathMarker.visible = true;
      sprite.deathMarker.clear();
      // Small X above flattened body
      sprite.deathMarker.moveTo(-5, -28);
      sprite.deathMarker.lineTo(5, -18);
      sprite.deathMarker.moveTo(5, -28);
      sprite.deathMarker.lineTo(-5, -18);
      sprite.deathMarker.stroke({ width: 2, color: 0xff4444, alpha: 0.8 });
    } else {
      sprite.container.alpha = 1;
      sprite.body.tint = 0xffffff;
      sprite.shadow.scale.set(1, 1);
      sprite.deathMarker.visible = false;
    }

    sprite.body.rotation = attackAngle;

    // Update HP bar
    const ratio = Math.max(0, hp / maxHp);
    const barWidth = (PLAYER_RADIUS * 2 - 4) * ratio;
    const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xccaa22 : 0xcc3333;
    sprite.hpBar.clear();
    if (barWidth > 0) {
      sprite.hpBar.roundRect(-PLAYER_RADIUS + 2, -31, barWidth, 3, 1);
      sprite.hpBar.fill(color);
    }

    // Carrier indicator
    if (isCarryingPunch || isCarryingPunchHome) {
      const ringColor = isCarryingPunch ? 0xff4444 : 0x44aaff;
      sprite.carrierIndicator.clear();
      sprite.carrierIndicator.ellipse(0, -8, PLAYER_RADIUS * 1.5, PLAYER_RADIUS * 1.1);
      sprite.carrierIndicator.stroke({ width: 3, color: ringColor, alpha: 0.8 });
      sprite.carrierIndicator.alpha = 1;
      sprite.carrierLabel.visible = true;
      sprite.carrierLabel.style.fill = isCarryingPunch ? '#ff6666' : '#66bbff';
    } else if (isAttacking) {
      sprite.carrierIndicator.clear();
      if (sprite.team === 'defender') {
        sprite.carrierIndicator.arc(0, -8, PLAYER_RADIUS + 15, attackAngle - 0.4, attackAngle + 0.4);
        sprite.carrierIndicator.stroke({ width: 3, color: 0xffffff, alpha: 0.6 });
      }
      sprite.carrierIndicator.alpha = 1;
      sprite.carrierLabel.visible = false;
    } else {
      if (sprite.carrierIndicator.alpha > 0) {
        sprite.carrierIndicator.alpha -= 0.15;
      }
      sprite.carrierLabel.visible = false;
    }
  }

  /** Get game-Y for a player sprite (used for depth sorting) */
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

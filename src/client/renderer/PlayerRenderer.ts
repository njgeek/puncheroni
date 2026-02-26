import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { PLAYER_RADIUS } from '@shared/constants';

interface PlayerSprite {
  container: Container;
  body: Graphics;
  hpBar: Graphics;
  hpBarBg: Graphics;
  nameText: Text;
  team: string;
  attackIndicator: Graphics;
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
        // Team changed — recreate
        this.container.removeChild(sprite.container);
        this.sprites.delete(id);
        sprite = undefined;
      }
    }

    if (!sprite) {
      const c = new Container();
      const body = new Graphics();
      const isDefender = team === 'defender';
      const baseColor = isDefender ? 0x4a9eff : 0xff4a4a;
      const darkColor = isDefender ? 0x2a6ecc : 0xcc2a2a;

      // Body circle
      body.circle(0, 0, PLAYER_RADIUS);
      body.fill(baseColor);
      body.circle(0, 0, PLAYER_RADIUS - 3);
      body.fill(darkColor);

      // Direction indicator
      body.moveTo(PLAYER_RADIUS - 2, 0);
      body.lineTo(PLAYER_RADIUS + 6, 0);
      body.stroke({ width: 3, color: 0xffffff, alpha: 0.7 });

      // Local player marker
      if (isLocal) {
        body.circle(0, 0, PLAYER_RADIUS + 4);
        body.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
      }

      c.addChild(body);

      // Attack indicator (melee arc or ranged aim)
      const attackIndicator = new Graphics();
      attackIndicator.alpha = 0;
      c.addChild(attackIndicator);

      // HP bar background
      const hpBarBg = new Graphics();
      hpBarBg.roundRect(-PLAYER_RADIUS, -PLAYER_RADIUS - 10, PLAYER_RADIUS * 2, 5, 2);
      hpBarBg.fill(0x222222);
      c.addChild(hpBarBg);

      // HP bar
      const hpBar = new Graphics();
      c.addChild(hpBar);

      // Name — slightly bigger for readability on mobile
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
      nameText.y = PLAYER_RADIUS + 10;
      c.addChild(nameText);

      sprite = { container: c, body, hpBar, hpBarBg, nameText, team, attackIndicator };
      this.sprites.set(id, sprite);
      this.container.addChild(c);
    }

    return sprite;
  }

  update(
    id: string,
    x: number,
    y: number,
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

    sprite.container.x = x;
    sprite.container.y = y;
    sprite.container.alpha = alive ? 1 : 0.2;
    sprite.body.rotation = attackAngle;

    // Update HP bar
    const ratio = Math.max(0, hp / maxHp);
    const barWidth = (PLAYER_RADIUS * 2 - 4) * ratio;
    const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xccaa22 : 0xcc3333;
    sprite.hpBar.clear();
    if (barWidth > 0) {
      sprite.hpBar.roundRect(-PLAYER_RADIUS + 2, -PLAYER_RADIUS - 9, barWidth, 3, 1);
      sprite.hpBar.fill(color);
    }

    // Carrier indicator — glowing ring around player carrying Punch
    if (isCarryingPunch || isCarryingPunchHome) {
      const ringColor = isCarryingPunch ? 0xff4444 : 0x44aaff;
      sprite.attackIndicator.clear();
      sprite.attackIndicator.circle(0, 0, PLAYER_RADIUS + 8);
      sprite.attackIndicator.stroke({ width: 3, color: ringColor, alpha: 0.7 });
      sprite.attackIndicator.alpha = 1;
    } else if (isAttacking) {
      sprite.attackIndicator.clear();
      if (sprite.team === 'defender') {
        sprite.attackIndicator.arc(0, 0, PLAYER_RADIUS + 15, attackAngle - 0.4, attackAngle + 0.4);
        sprite.attackIndicator.stroke({ width: 3, color: 0xffffff, alpha: 0.6 });
      }
      sprite.attackIndicator.alpha = 1;
    } else if (sprite.attackIndicator.alpha > 0) {
      sprite.attackIndicator.alpha -= 0.15;
    }
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

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

      // Shadow
      const shadow = new Graphics();
      shadow.ellipse(0, 0, PLAYER_RADIUS * 1.3, PLAYER_RADIUS * 0.5);
      shadow.fill({ color: 0x000000, alpha: 0.25 });
      c.addChild(shadow);

      const body = new Graphics();

      if (isDefender) {
        this.drawHuman(body, isLocal);
      } else {
        this.drawNinja(body, isLocal);
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
      carrierLabel.y = -46;
      carrierLabel.visible = false;
      c.addChild(carrierLabel);

      // Death marker
      const deathMarker = new Graphics();
      deathMarker.visible = false;
      c.addChild(deathMarker);

      // HP bar bg
      const hpBarBg = new Graphics();
      hpBarBg.roundRect(-PLAYER_RADIUS, -42, PLAYER_RADIUS * 2, 5, 2);
      hpBarBg.fill(0x222222);
      c.addChild(hpBarBg);

      // HP bar
      const hpBar = new Graphics();
      c.addChild(hpBar);

      // Name
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
      nameText.y = PLAYER_RADIUS * 0.5 + 8;
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

  /** Draw a friendly human protector — blue outfit, visible face, shield-like stance */
  private drawHuman(g: Graphics, isLocal: boolean) {
    // Legs (iso perspective — two short ovals below body)
    g.ellipse(-5, 4, 5, 3);
    g.fill(0x2255aa); // blue pants
    g.ellipse(5, 4, 5, 3);
    g.fill(0x2255aa);

    // Body / torso (blue uniform)
    g.ellipse(0, -6, 10, 12);
    g.fill(0x3377cc);
    // Uniform detail stripe
    g.rect(-1.5, -14, 3, 12);
    g.fill({ color: 0x55aaff, alpha: 0.4 });

    // Arms
    g.ellipse(-12, -4, 4, 7);
    g.fill(0x3377cc);
    g.ellipse(12, -4, 4, 7);
    g.fill(0x3377cc);
    // Hands (skin)
    g.circle(-12, 2, 3);
    g.fill(0xe8c4a0);
    g.circle(12, 2, 3);
    g.fill(0xe8c4a0);

    // Head (skin tone)
    g.circle(0, -22, 9);
    g.fill(0xe8c4a0);

    // Hair (brown)
    g.arc(0, -24, 9, Math.PI + 0.3, -0.3);
    g.fill(0x5c3a1e);
    // Hair top bump
    g.ellipse(0, -31, 7, 3);
    g.fill(0x5c3a1e);

    // Eyes
    g.circle(-3.5, -23, 2);
    g.fill(0x222222);
    g.circle(3.5, -23, 2);
    g.fill(0x222222);
    // Eye highlights
    g.circle(-3, -23.5, 0.8);
    g.fill(0xffffff);
    g.circle(4, -23.5, 0.8);
    g.fill(0xffffff);

    // Mouth (friendly smile)
    g.arc(0, -19, 3, 0.2, Math.PI - 0.2);
    g.stroke({ width: 1.2, color: 0x884433 });

    // Shield emblem on chest
    g.moveTo(0, -14);
    g.lineTo(-4, -10);
    g.lineTo(-4, -6);
    g.lineTo(0, -4);
    g.lineTo(4, -6);
    g.lineTo(4, -10);
    g.closePath();
    g.fill({ color: 0xffcc44, alpha: 0.7 });
    g.stroke({ width: 1, color: 0xddaa22, alpha: 0.8 });

    // Direction indicator
    g.moveTo(PLAYER_RADIUS - 2, -6);
    g.lineTo(PLAYER_RADIUS + 6, -6);
    g.stroke({ width: 2.5, color: 0x88bbff, alpha: 0.6 });

    // Local player white ring
    if (isLocal) {
      g.ellipse(0, -6, PLAYER_RADIUS * 1.3, PLAYER_RADIUS * 1.0);
      g.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    }
  }

  /** Draw a sneaky ninja foe — dark outfit, mask, red headband */
  private drawNinja(g: Graphics, isLocal: boolean) {
    // Legs (dark, crouched stance)
    g.ellipse(-5, 4, 5, 3);
    g.fill(0x222222);
    g.ellipse(5, 4, 5, 3);
    g.fill(0x222222);

    // Body / torso (dark gray ninja suit)
    g.ellipse(0, -6, 9, 11);
    g.fill(0x2a2a2a);
    // Belt/sash (dark red)
    g.rect(-9, -4, 18, 3);
    g.fill(0x882222);

    // Arms (dark, slightly extended for action pose)
    g.ellipse(-11, -5, 4, 6);
    g.fill(0x2a2a2a);
    g.ellipse(11, -5, 4, 6);
    g.fill(0x2a2a2a);
    // Wrapped hands
    g.circle(-11, 0, 3);
    g.fill(0x333333);
    g.circle(11, 0, 3);
    g.fill(0x333333);

    // Head (wrapped in dark cloth)
    g.circle(0, -22, 9);
    g.fill(0x333333);

    // Red headband
    g.rect(-10, -26, 20, 4);
    g.fill(0xcc2222);
    // Headband tails flowing right
    g.moveTo(9, -26);
    g.lineTo(16, -28);
    g.lineTo(15, -24);
    g.lineTo(9, -22);
    g.fill(0xcc2222);

    // Mask (covers lower face — only eyes visible)
    // Dark cloth wrapping lower face
    g.arc(0, -20, 8, 0.1, Math.PI - 0.1);
    g.fill(0x222222);

    // Narrow menacing eyes (white slits)
    g.ellipse(-3.5, -24, 2.5, 1.2);
    g.fill(0xffffff);
    g.ellipse(3.5, -24, 2.5, 1.2);
    g.fill(0xffffff);
    // Red irises
    g.ellipse(-3.5, -24, 1.2, 1);
    g.fill(0xcc3333);
    g.ellipse(3.5, -24, 1.2, 1);
    g.fill(0xcc3333);
    // Dark pupils
    g.circle(-3.5, -24, 0.6);
    g.fill(0x111111);
    g.circle(3.5, -24, 0.6);
    g.fill(0x111111);

    // Shuriken on belt (small X shape)
    g.moveTo(-2, -3);
    g.lineTo(2, -5);
    g.moveTo(2, -3);
    g.lineTo(-2, -5);
    g.stroke({ width: 1.5, color: 0x888888, alpha: 0.6 });

    // Direction indicator
    g.moveTo(PLAYER_RADIUS - 2, -6);
    g.lineTo(PLAYER_RADIUS + 6, -6);
    g.stroke({ width: 2.5, color: 0xff6666, alpha: 0.6 });

    // Local player white ring
    if (isLocal) {
      g.ellipse(0, -6, PLAYER_RADIUS * 1.3, PLAYER_RADIUS * 1.0);
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

    const iso = toIso(gameX, gameY);
    sprite.container.x = iso.x;
    sprite.container.y = iso.y;

    // Alive/dead
    if (!alive) {
      sprite.container.alpha = 0.35;
      sprite.body.tint = 0x888888;
      sprite.shadow.scale.set(1.2, 0.3);
      sprite.deathMarker.visible = true;
      sprite.deathMarker.clear();
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

    // HP bar
    const ratio = Math.max(0, hp / maxHp);
    const barWidth = (PLAYER_RADIUS * 2 - 4) * ratio;
    const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xccaa22 : 0xcc3333;
    sprite.hpBar.clear();
    if (barWidth > 0) {
      sprite.hpBar.roundRect(-PLAYER_RADIUS + 2, -41, barWidth, 3, 1);
      sprite.hpBar.fill(color);
    }

    // Carrier indicator
    if (isCarryingPunch || isCarryingPunchHome) {
      const ringColor = isCarryingPunch ? 0xff4444 : 0x44aaff;
      sprite.carrierIndicator.clear();
      sprite.carrierIndicator.ellipse(0, -6, PLAYER_RADIUS * 1.5, PLAYER_RADIUS * 1.1);
      sprite.carrierIndicator.stroke({ width: 3, color: ringColor, alpha: 0.8 });
      sprite.carrierIndicator.alpha = 1;
      sprite.carrierLabel.visible = true;
      sprite.carrierLabel.style.fill = isCarryingPunch ? '#ff6666' : '#66bbff';
    } else if (isAttacking) {
      sprite.carrierIndicator.clear();
      if (sprite.team === 'defender') {
        sprite.carrierIndicator.arc(0, -6, PLAYER_RADIUS + 15, attackAngle - 0.4, attackAngle + 0.4);
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

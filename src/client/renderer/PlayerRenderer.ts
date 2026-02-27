import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { PLAYER_RADIUS } from '@shared/constants';

interface PlayerSprite {
  container: Container;
  body: Graphics;
  hpBar: Graphics;
  hpBarBg: Graphics;
  nameText: Text;
  role: string;
  deathBody: Graphics;
  ventScale: number;  // 0 = fully in vent, 1 = fully out
  ventScaleTarget: number;
  gameY: number;
}

export class PlayerRenderer {
  container = new Container();
  private sprites = new Map<string, PlayerSprite>();

  getOrCreate(
    id: string,
    name: string,
    role: string,
    isLocal: boolean,
  ): PlayerSprite {
    let sprite = this.sprites.get(id);
    if (sprite && sprite.role !== role) {
      this.container.removeChild(sprite.container);
      this.sprites.delete(id);
      sprite = undefined;
    }

    if (!sprite) {
      const c = new Container();

      const body = new Graphics();
      const bodyColor = role === 'impostor' ? 0xcc3333 : 0x3b7dd8;
      const lightColor = role === 'impostor' ? 0xee5555 : 0x5599ee;
      this.drawCrewmate(body, bodyColor, lightColor, isLocal);
      c.addChild(body);

      // Dead body silhouette (shown when ghost)
      const deathBody = new Graphics();
      deathBody.visible = false;
      c.addChild(deathBody);

      // HP bar background
      const hpBarBg = new Graphics();
      hpBarBg.roundRect(-PLAYER_RADIUS, -26, PLAYER_RADIUS * 2, 5, 2);
      hpBarBg.fill(0x222222);
      c.addChild(hpBarBg);

      // HP bar fill
      const hpBar = new Graphics();
      c.addChild(hpBar);

      // Name label
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
        container: c, body, hpBar, hpBarBg, nameText, role,
        deathBody, ventScale: 1, ventScaleTarget: 1, gameY: 0,
      };
      this.sprites.set(id, sprite);
      this.container.addChild(c);
    }

    return sprite;
  }

  private drawCrewmate(g: Graphics, bodyColor: number, lightColor: number, isLocal: boolean) {
    g.ellipse(0, 2, PLAYER_RADIUS + 2, PLAYER_RADIUS - 2);
    g.fill({ color: 0x000000, alpha: 0.25 });

    g.roundRect(-10, -14, 20, 28, 8);
    g.fill(bodyColor);

    g.roundRect(-13, 0, 6, 12, 3);
    g.fill(bodyColor);

    g.roundRect(-6, -12, 12, 8, 3);
    g.fill(0xc8e6ff);
    g.roundRect(-4, -11, 4, 3, 1);
    g.fill({ color: 0xffffff, alpha: 0.5 });

    g.ellipse(-4, 14, 4, 3);
    g.fill(bodyColor);
    g.ellipse(4, 14, 4, 3);
    g.fill(bodyColor);

    g.moveTo(0, -14); g.lineTo(0, -20);
    g.stroke({ width: 2, color: lightColor, alpha: 0.6 });

    if (isLocal) {
      g.circle(0, 0, PLAYER_RADIUS + 4);
      g.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    }
  }

  update(
    id: string,
    gameX: number,
    gameY: number,
    alive: boolean,
    isGhost: boolean,
    inVent: boolean,
    isLocal: boolean,
    dt: number,
  ) {
    const sprite = this.sprites.get(id);
    if (!sprite) return;

    sprite.gameY = gameY;
    sprite.container.x = gameX;
    sprite.container.y = gameY;

    // Vent scale animation
    sprite.ventScaleTarget = inVent ? 0 : 1;
    sprite.ventScale += (sprite.ventScaleTarget - sprite.ventScale) * 0.2;
    sprite.container.scale.set(sprite.ventScale);

    if (inVent) {
      sprite.container.visible = false;
      return;
    }
    sprite.container.visible = true;

    if (isGhost) {
      // Ghosts: crewmates barely see them (shown as faint shadow)
      // The VisionRenderer handles full black fog; isLocal ghost sees full map
      sprite.body.visible = true;
      sprite.deathBody.visible = true;
      sprite.body.alpha = 0.0; // hide the standing sprite
      // Draw flat lying body silhouette
      sprite.deathBody.clear();
      sprite.deathBody.ellipse(0, 6, 12, 6);
      sprite.deathBody.fill({ color: 0x222222, alpha: 0.9 });
      // Crewmate bean shape lying flat
      sprite.deathBody.roundRect(-12, 2, 24, 10, 5);
      sprite.deathBody.fill(sprite.role === 'impostor' ? 0x661111 : 0x1a3a66);
      sprite.deathBody.roundRect(-9, 4, 8, 6, 3);
      sprite.deathBody.fill(0x4488bb);
      sprite.container.alpha = isLocal ? 0.25 : 0.15;
      sprite.hpBarBg.visible = false;
      sprite.hpBar.clear();
    } else if (!alive) {
      // Legacy dead state (shouldn't normally hit this in Among Us)
      sprite.container.alpha = 0.3;
      sprite.body.visible = true;
      sprite.deathBody.visible = false;
      sprite.hpBarBg.visible = false;
      sprite.hpBar.clear();
    } else {
      sprite.container.alpha = 1;
      sprite.body.visible = true;
      sprite.deathBody.visible = false;
      sprite.body.alpha = 1;
      sprite.hpBarBg.visible = false; // no HP bars in Among Us
      sprite.hpBar.clear();
    }
  }

  /** Flash a red burst at a world position (kill effect). */
  spawnKillFlash(gameX: number, gameY: number) {
    const g = new Graphics();
    g.circle(0, 0, 22);
    g.fill({ color: 0xff2222, alpha: 0.7 });
    g.circle(0, 0, 14);
    g.fill({ color: 0xff8888, alpha: 0.8 });
    g.x = gameX;
    g.y = gameY;
    this.container.addChild(g);

    let life = 0.5;
    const fade = () => {
      life -= 1 / 60;
      g.alpha = Math.max(0, life / 0.5);
      g.scale.set(1 + (0.5 - life));
      if (life > 0) requestAnimationFrame(fade);
      else this.container.removeChild(g);
    };
    requestAnimationFrame(fade);
  }

  getGameY(id: string): number {
    return this.sprites.get(id)?.gameY ?? 0;
  }

  remove(id: string) {
    const s = this.sprites.get(id);
    if (s) { this.container.removeChild(s.container); this.sprites.delete(id); }
  }

  clear() {
    this.sprites.forEach(s => this.container.removeChild(s.container));
    this.sprites.clear();
  }
}

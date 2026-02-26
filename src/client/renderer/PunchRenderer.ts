import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { PUNCH_X, PUNCH_Y } from '@shared/constants';
import { toIso } from '../utils/iso';

export class PunchRenderer {
  container = new Container();
  private bodyGroup = new Container();
  private shadow!: Graphics;
  private hpBar!: Graphics;
  private hpBarBg!: Graphics;
  private knockbackRing!: Graphics;
  private statusLabel!: Text;
  private buddyCryContainer = new Container();
  private animTime = 0;

  /** Game-space Y for depth sorting */
  gameY = PUNCH_Y;

  // Buddy stays at center when Punch is taken
  buddyAtCenter = new Container();
  buddyGameY = PUNCH_Y;

  init() {
    const isoPos = toIso(PUNCH_X, PUNCH_Y);
    this.container.x = isoPos.x;
    this.container.y = isoPos.y;

    this.drawShadow();
    this.drawPunchAndBuddy();
    this.drawHPBar();
    this.drawKnockbackRing();
    this.drawStatusLabel();
    this.drawBuddyAlone();
  }

  private drawShadow() {
    this.shadow = new Graphics();
    this.shadow.ellipse(0, 5, 26, 10);
    this.shadow.fill({ color: 0x000000, alpha: 0.25 });
    this.container.addChild(this.shadow);
  }

  private drawPunchAndBuddy() {
    const body = new Graphics();

    // Body (iso-perspective: wider oval)
    body.ellipse(0, 3, 20, 16);
    body.fill(0xc4956a);

    // Head (above body)
    body.circle(0, -16, 16);
    body.fill(0xd4a574);

    // Ears
    body.circle(-14, -20, 6);
    body.fill(0xc49060);
    body.circle(-14, -20, 3.5);
    body.fill(0xeab8a0);
    body.circle(14, -20, 6);
    body.fill(0xc49060);
    body.circle(14, -20, 3.5);
    body.fill(0xeab8a0);

    // Face
    body.circle(0, -12, 10);
    body.fill(0xecd0b8);

    // Eyes
    body.circle(-4, -15, 3);
    body.fill(0x111111);
    body.circle(4, -15, 3);
    body.fill(0x111111);
    body.circle(-3.5, -15.5, 1);
    body.fill(0xffffff);
    body.circle(4.5, -15.5, 1);
    body.fill(0xffffff);

    // Nose
    body.circle(0, -10, 1.8);
    body.fill(0x8b6040);

    // Mouth
    body.arc(0, -8, 3.5, 0.1, Math.PI - 0.1);
    body.stroke({ width: 1.5, color: 0x8b6040 });

    // Arms
    body.moveTo(-16, -2);
    body.quadraticCurveTo(-20, 12, -9, 17);
    body.stroke({ width: 3.5, color: 0xc4956a });
    body.moveTo(16, -2);
    body.quadraticCurveTo(20, 12, 9, 17);
    body.stroke({ width: 3.5, color: 0xc4956a });

    // Buddy (held)
    const buddy = new Graphics();
    buddy.circle(0, 18, 9);
    buddy.fill(0xf5e6c8);
    buddy.circle(-2.5, 16, 1.8);
    buddy.fill(0x333333);
    buddy.circle(2.5, 16, 1.8);
    buddy.fill(0x333333);
    buddy.circle(0, 19, 1.3);
    buddy.fill(0xff9999);
    buddy.circle(-6, 13, 3.5);
    buddy.fill(0xf0d8b0);
    buddy.circle(6, 13, 3.5);
    buddy.fill(0xf0d8b0);

    this.bodyGroup.addChild(body);
    this.bodyGroup.addChild(buddy);
    this.container.addChild(this.bodyGroup);

    // Label (screen-space)
    const label = new Text({
      text: 'PUNCH',
      style: new TextStyle({
        fontSize: 12,
        fontWeight: 'bold',
        fill: '#ffcc00',
        stroke: { color: '#000000', width: 2 },
      }),
    });
    label.anchor.set(0.5);
    label.y = -42;
    this.container.addChild(label);
  }

  private drawBuddyAlone() {
    const isoPos = toIso(PUNCH_X, PUNCH_Y);
    this.buddyAtCenter.x = isoPos.x;
    this.buddyAtCenter.y = isoPos.y;
    this.buddyAtCenter.visible = false;

    // Shadow
    const shadow = new Graphics();
    shadow.ellipse(0, 4, 16, 6);
    shadow.fill({ color: 0x000000, alpha: 0.2 });
    this.buddyAtCenter.addChild(shadow);

    const buddy = new Graphics();
    buddy.circle(0, 0, 14);
    buddy.fill(0xf5e6c8);
    buddy.circle(-4, -3, 3);
    buddy.fill(0x333333);
    buddy.circle(4, -3, 3);
    buddy.fill(0x333333);
    buddy.circle(-7, 0, 2);
    buddy.fill({ color: 0x6688ff, alpha: 0.7 });
    buddy.circle(7, 0, 2);
    buddy.fill({ color: 0x6688ff, alpha: 0.7 });
    buddy.arc(0, 5, 3, Math.PI + 0.3, -0.3);
    buddy.stroke({ width: 1.5, color: 0x8b6040 });
    buddy.circle(-10, -8, 5);
    buddy.fill(0xf0d8b0);
    buddy.circle(10, -8, 5);
    buddy.fill(0xf0d8b0);

    this.buddyAtCenter.addChild(buddy);

    const cryText = new Text({
      text: 'BUDDY',
      style: new TextStyle({
        fontSize: 10,
        fontWeight: 'bold',
        fill: '#ffaaaa',
        stroke: { color: '#000000', width: 2 },
      }),
    });
    cryText.anchor.set(0.5);
    cryText.y = -22;
    this.buddyAtCenter.addChild(cryText);

    this.buddyAtCenter.addChild(this.buddyCryContainer);
  }

  private drawHPBar() {
    this.hpBarBg = new Graphics();
    this.hpBarBg.roundRect(-30, -52, 60, 8, 4);
    this.hpBarBg.fill(0x333333);
    this.container.addChild(this.hpBarBg);

    this.hpBar = new Graphics();
    this.container.addChild(this.hpBar);
  }

  private drawKnockbackRing() {
    this.knockbackRing = new Graphics();
    this.knockbackRing.alpha = 0;
    this.container.addChild(this.knockbackRing);
  }

  private drawStatusLabel() {
    this.statusLabel = new Text({
      text: '',
      style: new TextStyle({
        fontSize: 11,
        fontWeight: 'bold',
        fill: '#ff4444',
        stroke: { color: '#000000', width: 2 },
      }),
    });
    this.statusLabel.anchor.set(0.5);
    this.statusLabel.y = 28;
    this.container.addChild(this.statusLabel);
  }

  update(
    punchX: number,
    punchY: number,
    hp: number,
    maxHp: number,
    isKnockbackActive: boolean,
    isKidnapped: boolean,
    isHome: boolean,
    carriedBy: string,
    dt: number,
  ) {
    this.animTime += dt;
    this.gameY = punchY;

    // Move to iso position
    const isoPos = toIso(punchX, punchY);
    this.container.x = isoPos.x;
    this.container.y = isoPos.y;
    this.container.visible = true;

    // Buddy at center when Punch is away
    this.buddyAtCenter.visible = !isHome;
    if (!isHome) {
      const shiver = Math.sin(this.animTime * 15) * 2;
      this.buddyAtCenter.children[1].x = shiver; // buddy gfx is child[1] (shadow is child[0])

      if (Math.random() < 0.08) {
        const tear = new Graphics();
        const side = Math.random() > 0.5 ? 1 : -1;
        tear.circle(0, 0, 2);
        tear.fill({ color: 0x6688ff, alpha: 0.8 });
        tear.x = side * 7;
        tear.y = 0;
        (tear as any)._vy = 0.5 + Math.random();
        (tear as any)._life = 1;
        this.buddyCryContainer.addChild(tear);
      }
      for (let i = this.buddyCryContainer.children.length - 1; i >= 0; i--) {
        const tear = this.buddyCryContainer.children[i] as any;
        tear.y += tear._vy;
        tear._life -= dt * 2;
        tear.alpha = Math.max(0, tear._life);
        if (tear._life <= 0) {
          this.buddyCryContainer.removeChildAt(i);
        }
      }
    }

    // Animations
    if (isKidnapped && carriedBy) {
      const struggle = Math.sin(this.animTime * 10) * 0.08;
      this.bodyGroup.rotation = struggle;
      this.bodyGroup.scale.set(0.85);
    } else {
      const breathe = Math.sin(this.animTime * 2) * 0.02;
      this.bodyGroup.scale.set(1 + breathe, 1 - breathe);
      this.bodyGroup.rotation = 0;
    }

    // Status label
    if (isKidnapped && carriedBy) {
      this.statusLabel.text = 'KIDNAPPED!';
      this.statusLabel.style.fill = '#ff4444';
    } else if (!isHome && !carriedBy) {
      this.statusLabel.text = 'DROPPED!';
      this.statusLabel.style.fill = '#ffaa44';
    } else if (!isHome && carriedBy) {
      this.statusLabel.text = 'RESCUING...';
      this.statusLabel.style.fill = '#44aaff';
    } else {
      this.statusLabel.text = '';
    }

    // HP bar
    const ratio = Math.max(0, hp / maxHp);
    const barWidth = 56 * ratio;
    const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xccaa22 : 0xcc3333;
    this.hpBar.clear();
    this.hpBar.roundRect(-28, -51, barWidth, 6, 3);
    this.hpBar.fill(color);

    // Knockback ring (iso ellipse)
    if (isKnockbackActive) {
      this.knockbackRing.clear();
      this.knockbackRing.ellipse(0, 0, 150 * 1.4, 150 * 0.7);
      this.knockbackRing.stroke({ width: 3, color: 0xffaa00, alpha: 0.6 });
      this.knockbackRing.alpha = 0.8;
    } else if (this.knockbackRing.alpha > 0) {
      this.knockbackRing.alpha -= dt * 3;
    }
  }
}

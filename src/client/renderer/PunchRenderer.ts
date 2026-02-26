import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { PUNCH_X, PUNCH_Y } from '@shared/constants';

export class PunchRenderer {
  container = new Container();
  private bodyGroup = new Container();
  private hpBar!: Graphics;
  private hpBarBg!: Graphics;
  private knockbackRing!: Graphics;
  private statusLabel!: Text;
  private buddyCryContainer = new Container();
  private animTime = 0;

  // Buddy stays at center when Punch is taken
  buddyAtCenter = new Container();

  init() {
    this.container.x = PUNCH_X;
    this.container.y = PUNCH_Y;

    this.drawPunchAndBuddy();
    this.drawHPBar();
    this.drawKnockbackRing();
    this.drawStatusLabel();
    this.drawBuddyAlone();
  }

  private drawPunchAndBuddy() {
    const body = new Graphics();

    // Body
    body.circle(0, 5, 22);
    body.fill(0xc4956a);

    // Head
    body.circle(0, -18, 18);
    body.fill(0xd4a574);

    // Ears
    body.circle(-16, -22, 7);
    body.fill(0xc49060);
    body.circle(-16, -22, 4);
    body.fill(0xeab8a0);
    body.circle(16, -22, 7);
    body.fill(0xc49060);
    body.circle(16, -22, 4);
    body.fill(0xeab8a0);

    // Face
    body.circle(0, -14, 12);
    body.fill(0xecd0b8);

    // Eyes (will be overridden for scared look when kidnapped)
    body.circle(-5, -17, 3.5);
    body.fill(0x111111);
    body.circle(5, -17, 3.5);
    body.fill(0x111111);
    body.circle(-4, -17.5, 1.2);
    body.fill(0xffffff);
    body.circle(6, -17.5, 1.2);
    body.fill(0xffffff);

    // Nose
    body.circle(0, -12, 2);
    body.fill(0x8b6040);

    // Mouth
    body.arc(0, -10, 4, 0.1, Math.PI - 0.1);
    body.stroke({ width: 1.5, color: 0x8b6040 });

    // Arms
    body.moveTo(-18, 0);
    body.quadraticCurveTo(-22, 15, -10, 20);
    body.stroke({ width: 4, color: 0xc4956a });
    body.moveTo(18, 0);
    body.quadraticCurveTo(22, 15, 10, 20);
    body.stroke({ width: 4, color: 0xc4956a });

    // Buddy (held)
    const buddy = new Graphics();
    buddy.circle(0, 22, 10);
    buddy.fill(0xf5e6c8);
    buddy.circle(-3, 20, 2);
    buddy.fill(0x333333);
    buddy.circle(3, 20, 2);
    buddy.fill(0x333333);
    buddy.circle(0, 23, 1.5);
    buddy.fill(0xff9999);
    buddy.circle(-7, 16, 4);
    buddy.fill(0xf0d8b0);
    buddy.circle(7, 16, 4);
    buddy.fill(0xf0d8b0);

    this.bodyGroup.addChild(body);
    this.bodyGroup.addChild(buddy);
    this.container.addChild(this.bodyGroup);

    // Label
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
    label.y = -45;
    this.container.addChild(label);
  }

  private drawBuddyAlone() {
    // Buddy stays at center when Punch is kidnapped
    this.buddyAtCenter.x = PUNCH_X;
    this.buddyAtCenter.y = PUNCH_Y;
    this.buddyAtCenter.visible = false;

    const buddy = new Graphics();
    // Bigger buddy when alone and scared
    buddy.circle(0, 0, 14);
    buddy.fill(0xf5e6c8);
    // Sad eyes (looking around)
    buddy.circle(-4, -3, 3);
    buddy.fill(0x333333);
    buddy.circle(4, -3, 3);
    buddy.fill(0x333333);
    // Tears
    buddy.circle(-7, 0, 2);
    buddy.fill({ color: 0x6688ff, alpha: 0.7 });
    buddy.circle(7, 0, 2);
    buddy.fill({ color: 0x6688ff, alpha: 0.7 });
    // Sad mouth
    buddy.arc(0, 5, 3, Math.PI + 0.3, -0.3);
    buddy.stroke({ width: 1.5, color: 0x8b6040 });
    // Ears
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

    // Cry particles container
    this.buddyAtCenter.addChild(this.buddyCryContainer);
  }

  private drawHPBar() {
    this.hpBarBg = new Graphics();
    this.hpBarBg.roundRect(-30, -55, 60, 8, 4);
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
    this.statusLabel.y = 40;
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

    // Move Punch container to actual position
    this.container.x = punchX;
    this.container.y = punchY;
    this.container.visible = true;

    // Show Buddy at center when Punch is away
    this.buddyAtCenter.visible = !isHome;
    if (!isHome) {
      // Buddy shivering animation
      const shiver = Math.sin(this.animTime * 15) * 2;
      this.buddyAtCenter.children[0].x = shiver;

      // Spawn cry particles occasionally
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
      // Animate cry particles
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

    // Breathing/struggling animation
    if (isKidnapped && carriedBy) {
      // Struggling when kidnapped
      const struggle = Math.sin(this.animTime * 10) * 0.08;
      this.bodyGroup.rotation = struggle;
      this.bodyGroup.scale.set(0.85); // squished a bit
    } else {
      // Gentle breathing when home
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
    this.hpBar.roundRect(-28, -54, barWidth, 6, 3);
    this.hpBar.fill(color);

    // Knockback ring
    if (isKnockbackActive) {
      this.knockbackRing.clear();
      this.knockbackRing.circle(0, 0, 150);
      this.knockbackRing.stroke({ width: 3, color: 0xffaa00, alpha: 0.6 });
      this.knockbackRing.alpha = 0.8;
    } else if (this.knockbackRing.alpha > 0) {
      this.knockbackRing.alpha -= dt * 3;
    }
  }
}

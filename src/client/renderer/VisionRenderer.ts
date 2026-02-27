import { Graphics, Container } from 'pixi.js';

/**
 * Fog-of-war renderer.
 * Sits in screen space (app.stage), above the world layer but below the HUD.
 * Draws a full-screen black overlay and erases a circular hole at the local
 * player's screen position.
 */
export class VisionRenderer {
  container = new Container();
  private fogBg!: Graphics;
  private visionHole!: Graphics;

  private screenWidth = 800;
  private screenHeight = 600;

  init(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    // Make this container an isolated render group so that 'erase' blend mode
    // punches a hole only in the fog layer, not the world behind it.
    (this.container as any).isRenderGroup = true;

    // Opaque fog layer
    this.fogBg = new Graphics();
    this.container.addChild(this.fogBg);

    // Vision cut-out — drawn with 'erase' blend mode to punch hole in fogBg
    this.visionHole = new Graphics();
    (this.visionHole as any).blendMode = 'erase';
    this.container.addChild(this.visionHole);

    this.drawFogBg();
  }

  resize(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.drawFogBg();
  }

  private drawFogBg() {
    this.fogBg.clear();
    this.fogBg.rect(0, 0, this.screenWidth, this.screenHeight);
    this.fogBg.fill({ color: 0x000000, alpha: 0.95 });
  }

  /**
   * Update each frame.
   * @param screenX  Local player screen-space X
   * @param screenY  Local player screen-space Y
   * @param radius   Vision radius in screen pixels
   * @param enabled  False for ghosts / impostors (full map visible)
   */
  update(screenX: number, screenY: number, radius: number, enabled: boolean) {
    this.container.visible = enabled;
    if (!enabled) return;

    this.visionHole.clear();
    this.visionHole.circle(screenX, screenY, radius);
    this.visionHole.fill({ color: 0xffffff, alpha: 1 });
  }
}

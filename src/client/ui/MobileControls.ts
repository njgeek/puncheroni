// Mobile controls are handled directly in TouchInput.ts
// This file just manages visibility
export class MobileControls {
  private container: HTMLElement;

  constructor() {
    this.container = document.getElementById('mobile-controls')!;
  }

  show() {
    this.container.classList.remove('hidden');
  }

  hide() {
    this.container.classList.add('hidden');
  }

  get isMobile(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
}

export class Scoreboard {
  private overlay: HTMLElement;
  private title: HTMLElement;
  private stats: HTMLElement;

  constructor() {
    this.overlay = document.getElementById('results-overlay')!;
    this.title = document.getElementById('results-title')!;
    this.stats = document.getElementById('results-stats')!;
  }

  show(data: {
    winningTeam: string | null;
    mvpName: string;
    mvpDamage: number;
    defenderKills: number;
    attackerKills: number;
    punchHpRemaining: number;
    roundDuration: number;
  }) {
    const isDefWin = data.winningTeam === 'defender';
    this.title.textContent = isDefWin
      ? 'PUNCH IS SAFE!'
      : 'PUNCH WAS KIDNAPPED!';
    this.title.style.color = isDefWin ? '#4a9eff' : '#ff4a4a';

    this.stats.innerHTML = `
      ${isDefWin ? "Punch's Friends protected him!" : "Punch's Foes kidnapped him!"}<br><br>
      <strong>MVP:</strong> ${data.mvpName} (${Math.round(data.mvpDamage)} dmg)<br>
      <strong>Time:</strong> ${Math.round(data.roundDuration)}s<br>
      <strong>Kills:</strong> Friends ${data.defenderKills} — Foes ${data.attackerKills}
    `;

    this.overlay.classList.remove('hidden');
  }

  hide() {
    this.overlay.classList.add('hidden');
  }
}

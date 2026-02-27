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
    winner?: string;
    reason?: string;
    tasksDone?: number;
    tasksTotal?: number;
    // legacy compat fields
    winningTeam?: string;
    defenderKills?: number;
    attackerKills?: number;
  }) {
    const winner = data.winner ?? (data.winningTeam === 'defender' ? 'crewmate' : 'impostor');
    const isCrewWin = winner === 'crewmate';

    this.title.textContent = isCrewWin ? 'CREWMATES WIN!' : 'IMPOSTORS WIN!';
    this.title.style.color = isCrewWin ? '#44ff88' : '#ff4444';

    const reason = data.reason ?? '';
    const tasksDone = data.tasksDone ?? data.defenderKills ?? 0;
    const tasksTotal = data.tasksTotal ?? data.attackerKills ?? 0;

    this.stats.innerHTML = `
      ${isCrewWin ? 'The crew worked together and survived!' : 'The impostors took over the ship!'}<br><br>
      ${reason ? `<strong>Reason:</strong> ${reason}<br>` : ''}
      ${tasksTotal > 0 ? `<strong>Tasks completed:</strong> ${tasksDone}/${tasksTotal}` : ''}
    `;

    this.overlay.classList.remove('hidden');
  }

  hide() {
    this.overlay.classList.add('hidden');
  }
}

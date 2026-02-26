export class LobbyScene {
  private overlay: HTMLElement;
  private teamLabel: HTMLElement;
  private playerCount: HTMLElement;

  constructor() {
    this.overlay = document.getElementById('lobby-overlay')!;
    this.teamLabel = document.getElementById('lobby-team')!;
    this.playerCount = document.getElementById('lobby-players')!;
  }

  show() {
    this.overlay.classList.remove('hidden');
  }

  hide() {
    this.overlay.classList.add('hidden');
  }

  setTeam(team: string) {
    this.teamLabel.textContent = team === 'defender' ? 'PUNCH ARMY' : 'ENEMY FORCE';
    this.teamLabel.className = `team-name ${team}`;
  }

  setPlayerCount(count: number) {
    if (count < 2) {
      this.playerCount.textContent = `${count}/2 players — waiting for more...`;
    } else {
      this.playerCount.textContent = `${count} player${count !== 1 ? 's' : ''} — starting soon!`;
    }
  }
}

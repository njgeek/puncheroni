export class LobbyScene {
  private overlay: HTMLElement;
  private playerCount: HTMLElement;
  private lobbyStatus: HTMLElement;
  private cardDefend: HTMLElement;
  private cardAttack: HTMLElement;

  onTeamSelect: ((team: string) => void) | null = null;

  constructor() {
    this.overlay = document.getElementById('lobby-overlay')!;
    this.playerCount = document.getElementById('lobby-players')!;
    this.lobbyStatus = document.getElementById('lobby-status')!;
    this.cardDefend = document.getElementById('card-defend')!;
    this.cardAttack = document.getElementById('card-attack')!;

    this.cardDefend.addEventListener('click', () => {
      this.selectCard('defender');
      this.onTeamSelect?.('defender');
    });
    this.cardAttack.addEventListener('click', () => {
      this.selectCard('attacker');
      this.onTeamSelect?.('attacker');
    });
  }

  show() {
    this.overlay.classList.remove('hidden');
  }

  hide() {
    this.overlay.classList.add('hidden');
  }

  private selectCard(team: string) {
    this.cardDefend.classList.remove('selected');
    this.cardAttack.classList.remove('selected');
    if (team === 'defender') {
      this.cardDefend.classList.add('selected');
    } else {
      this.cardAttack.classList.add('selected');
    }
    this.lobbyStatus.textContent = 'Waiting for players...';
  }

  setTeam(team: string) {
    this.selectCard(team);
  }

  setPlayerCount(count: number) {
    if (count < 2) {
      this.playerCount.textContent = `${count}/2 players — waiting for more...`;
    } else {
      this.playerCount.textContent = `${count} player${count !== 1 ? 's' : ''} — starting soon!`;
    }
  }
}

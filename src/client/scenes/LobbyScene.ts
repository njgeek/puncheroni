export class LobbyScene {
  private overlay: HTMLElement;
  private playerCount: HTMLElement;
  private lobbyStatus: HTMLElement;

  constructor() {
    this.overlay = document.getElementById('lobby-overlay')!;
    this.playerCount = document.getElementById('lobby-players')!;
    this.lobbyStatus = document.getElementById('lobby-status')!;
  }

  show() {
    this.overlay.classList.remove('hidden');
  }

  hide() {
    this.overlay.classList.add('hidden');
  }

  setPlayerCount(count: number) {
    if (count < 2) {
      this.playerCount.textContent = `${count}/2 players — waiting for more...`;
    } else {
      this.playerCount.textContent = `${count} players — starting soon!`;
    }
  }

  // Stub for compatibility — no team selection in Among Us mode
  setTeam(_team: string) {}
  setTeamCounts(_friends: number, _foes: number) {}
  showAssignedMessage(_pref: string, _actual: string) {}
}

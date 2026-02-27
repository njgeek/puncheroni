import { Client, Room } from '@colyseus/sdk';

export class ClientConnection {
  private client: Client;
  private _room: Room | null = null;

  onStateChange: ((state: any) => void) | null = null;
  onPlayerCountChange: ((count: number) => void) | null = null;
  onWelcome: ((data: { name: string }) => void) | null = null;
  onRoleReveal: ((data: { role: string; tasks: any[]; impostorNames: string[] }) => void) | null = null;
  onMeetingStart: ((data: { reporterName: string; bodyName: string; discussionTime: number }) => void) | null = null;
  onMeetingPhaseChange: ((data: { phase: string }) => void) | null = null;
  onQuickPhrase: ((data: { name: string; phrase: string }) => void) | null = null;
  onVoteResult: ((data: { ejectedName: string; wasImpostor: boolean; ejectedRole: string }) => void) | null = null;
  onGameOver: ((data: { winner: string; reason: string; tasksDone: number; tasksTotal: number }) => void) | null = null;
  onVentOptions: ((data: { ventId: number; connections: { id: number; x: number; y: number }[] }) => void) | null = null;

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
    const host = window.location.hostname;

    let serverUrl: string;
    if (import.meta.env.DEV) {
      serverUrl = `${protocol}://${host}:3000`;
    } else {
      const port = window.location.port;
      serverUrl = `${protocol}://${host}${port ? ':' + port : ''}`;
    }

    console.log('Connecting to:', serverUrl);
    this.client = new Client(serverUrl);
  }

  get room() { return this._room; }
  get sessionId() { return this._room?.sessionId || ''; }

  async connect(): Promise<Room> {
    this._room = await this.client.joinOrCreate('game');
    console.log('Connected to room:', this._room.id);

    this._room.onStateChange((state) => this.onStateChange?.(state));

    if (this._room.state?.players) {
      this._room.state.players.onAdd(() => {
        this.onPlayerCountChange?.(this._room!.state.players.size);
      });
      this._room.state.players.onRemove(() => {
        this.onPlayerCountChange?.(this._room!.state.players.size);
      });
    }

    this._room.onMessage('welcome', (data) => this.onWelcome?.(data));
    this._room.onMessage('roleReveal', (data) => this.onRoleReveal?.(data));
    this._room.onMessage('meetingStart', (data) => this.onMeetingStart?.(data));
    this._room.onMessage('meetingPhaseChange', (data) => this.onMeetingPhaseChange?.(data));
    this._room.onMessage('quickPhrase', (data) => this.onQuickPhrase?.(data));
    this._room.onMessage('voteResult', (data) => this.onVoteResult?.(data));
    this._room.onMessage('gameOver', (data) => this.onGameOver?.(data));
    this._room.onMessage('ventOptions', (data) => this.onVentOptions?.(data));

    return this._room;
  }

  sendInput(input: any) { this._room?.send('input', input); }
  sendQuickPhrase(phrase: string) { this._room?.send('quickPhrase', { phrase }); }
  sendVote(targetId: string) { this._room?.send('vote', { targetId }); }
  sendEmergencyButton() { this._room?.send('emergencyButton', {}); }
  sendVentTravel(targetVentId: number) { this._room?.send('ventTravel', { targetVentId }); }
}

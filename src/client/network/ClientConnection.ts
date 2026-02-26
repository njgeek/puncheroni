import { Client, Room } from '@colyseus/sdk';

export class ClientConnection {
  private client: Client;
  private _room: Room | null = null;

  onStateChange: ((state: any) => void) | null = null;
  onPlayerCountChange: ((count: number) => void) | null = null;
  onWelcome: ((data: { name: string; team: string }) => void) | null = null;
  onRoundResults: ((data: any) => void) | null = null;
  onPunchRescued: (() => void) | null = null;
  onTeamUpdate: ((data: { team: string }) => void) | null = null;
  onPlayerEliminated: ((data: { victimId: string; victimName: string; killerId: string; killerName: string }) => void) | null = null;
  onTeamCounts: ((data: { friends: number; foes: number }) => void) | null = null;

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
    try {
      this._room = await this.client.joinOrCreate('game');
      console.log('Connected to room:', this._room.id);

      this._room.onStateChange((state) => {
        this.onStateChange?.(state);
      });

      // Reliable player count updates via schema callbacks
      // (onStateChange can miss MapSchema patches on mobile)
      if (this._room.state?.players) {
        this._room.state.players.onAdd(() => {
          this.onPlayerCountChange?.(this._room!.state.players.size);
        });
        this._room.state.players.onRemove(() => {
          this.onPlayerCountChange?.(this._room!.state.players.size);
        });
      }

      this._room.onMessage('welcome', (data) => {
        this.onWelcome?.(data);
      });

      this._room.onMessage('roundResults', (data) => {
        this.onRoundResults?.(data);
      });

      this._room.onMessage('punchRescued', () => {
        this.onPunchRescued?.();
      });

      this._room.onMessage('teamUpdate', (data) => {
        this.onTeamUpdate?.(data);
      });

      this._room.onMessage('playerEliminated', (data) => {
        this.onPlayerEliminated?.(data);
      });

      this._room.onMessage('teamCounts', (data) => {
        this.onTeamCounts?.(data);
      });

      return this._room;
    } catch (err) {
      console.error('Failed to connect:', err);
      throw err;
    }
  }

  sendInput(input: any) {
    this._room?.send('input', input);
  }

  sendTeamPreference(team: string) {
    this._room?.send('teamPreference', { team });
  }
}

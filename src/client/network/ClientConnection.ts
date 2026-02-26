import { Client, Room } from 'colyseus.js';

export class ClientConnection {
  private client: Client;
  private _room: Room | null = null;

  onStateChange: ((state: any) => void) | null = null;
  onWelcome: ((data: { name: string; team: string }) => void) | null = null;
  onRoundResults: ((data: any) => void) | null = null;
  onPunchRescued: (() => void) | null = null;

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
    const host = window.location.hostname;

    let serverUrl: string;
    if (import.meta.env.DEV) {
      // In dev, connect directly to Colyseus on port 3000
      serverUrl = `${protocol}://${host}:3000`;
    } else {
      // In production, same host
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

      this._room.onMessage('welcome', (data) => {
        this.onWelcome?.(data);
      });

      this._room.onMessage('roundResults', (data) => {
        this.onRoundResults?.(data);
      });

      this._room.onMessage('punchRescued', () => {
        this.onPunchRescued?.();
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
}

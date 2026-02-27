export interface PlayerInput {
  dx: number;     // -1 to 1
  dy: number;     // -1 to 1
  use: boolean;   // interact with task / enter-exit vent
  kill: boolean;  // impostor kill (one-shot)
  report: boolean; // report body (one-shot)
  vote: string;   // vote target sessionId or 'skip' (one-shot, used in meeting)
  seq: number;
}

export type GamePhase = 'lobby' | 'countdown' | 'active' | 'meeting' | 'results';

export interface GameOverStats {
  winner: 'crewmate' | 'impostor';
  reason: string;
  tasksDone: number;
  tasksTotal: number;
}

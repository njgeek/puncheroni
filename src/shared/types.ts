export enum Team {
  Defender = 'defender',
  Attacker = 'attacker',
}

export enum GamePhase {
  Lobby = 'lobby',
  Countdown = 'countdown',
  Active = 'active',
  Results = 'results',
}

export interface PlayerInput {
  dx: number; // -1 to 1
  dy: number; // -1 to 1
  attack: boolean;
  attackAngle: number; // radians
  dash: boolean;
  placeBarrier: boolean;
  seq: number;
}

export interface RoundStats {
  winningTeam: Team | null;
  roundDuration: number;
  mvpId: string;
  mvpName: string;
  mvpDamage: number;
  defenderKills: number;
  attackerKills: number;
  punchHpRemaining: number;
}

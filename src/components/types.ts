export interface ChainPlayer {
  name: string;
  score: number;
  time: number;
}

export interface ScoreState {
  seed: number;
  players: ChainPlayer[];
  maxPlayers: number;
  totalPlayers: number;
  remainingSlots: number;
}

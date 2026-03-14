export interface ChainPlayer {
  name: string;
  score: number;
  time: number;
}

export interface ChainState {
  seed: number;
  players: ChainPlayer[];
  maxPlayers: number;
}

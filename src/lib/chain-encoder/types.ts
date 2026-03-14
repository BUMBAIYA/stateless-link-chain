export interface ChainPlayer {
  name: string;
  score: number;
  time: number;
  /** Zip: player's solution path (cell indices) for novelty check and replay */
  path?: number[];
}

export interface ChainState {
  seed: number;
  players: ChainPlayer[];
  maxPlayers: number;
  /** "flow" | "zip" */
  gameType?: "flow" | "zip";
  /** Flow: 4|5. Zip: 4|5|7 */
  gridSize?: 4 | 5 | 7;
  /** Zip: number of waypoints (e.g. 12) */
  waypointCount?: number;
  /** Flow: flat grid, 0 = empty, 1..n = pair id. Zip: -1=blocked, 0=empty path, 1..K=waypoint */
  board?: number[];
  /** Flow/Zip: creation timestamp for 24h expiry */
  createdAt?: number;
  /** Zip: creator's solution path (cell indices) for novelty check */
  solution?: number[];
}

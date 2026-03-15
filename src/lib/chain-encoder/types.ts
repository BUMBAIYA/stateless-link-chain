export interface ChainPlayer {
  name: string;
  score: number;
  time: number;
  /** Zip: unique id for this player (nanoid), used to fetch solution from solution API */
  userId?: string;
  /** Zip: player's solution path (cell indices); stored in chain, not returned from score API */
  path?: number[];
}

export interface ChainState {
  seed: number;
  players: ChainPlayer[];
  maxPlayers: number;
  /** "flow" | "zip" */
  gameType?: "flow" | "zip";
  /** Flow: 4|5. Zip: 4..8 */
  gridSize?: number;
  /** Zip: number of waypoints (e.g. 12) */
  waypointCount?: number;
  /** Flow: flat grid, 0 = empty, 1..n = pair id. Zip: -1=blocked, 0=empty path, 1..K=waypoint */
  board?: number[];
  /** Flow/Zip: creation timestamp for 24h expiry */
  createdAt?: number;
  /** Zip: creator's solution path (cell indices) for novelty check */
  solution?: number[];
  /** Zip: deterministic path gradient seed (creatorId + game seed), same for all users */
  gradientSeed?: string;
}

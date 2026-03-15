import type { ChainState } from "@/lib/chain-encoder/types";
import type { GridSize } from "@/lib/zip/validate";
import { validateZipSolution } from "@/lib/zip/validate";

/**
 * If the stored creator solution is invalid (e.g. waypoints visited out of order),
 * clear it so we never return or use it for novelty. Valid solutions must visit
 * waypoints 1→2→…→K along the path.
 */
export function normalizeZipState(state: ChainState): ChainState {
  const size = state.gridSize;
  const board = state.board;
  const solution = state.solution;
  const k = state.waypointCount ?? 0;
  if (
    size === undefined ||
    board == null ||
    !Array.isArray(solution) ||
    solution.length === 0 ||
    k < 1
  ) {
    return state;
  }
  const res = validateZipSolution(size as GridSize, board, solution, k);
  if (!res.ok) {
    return { ...state, solution: undefined };
  }
  return state;
}

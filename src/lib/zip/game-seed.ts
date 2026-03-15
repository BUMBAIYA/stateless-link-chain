import LZString from "lz-string";

import { isValidGridSize, type GridSize } from "@/lib/zip/validate";

export interface GameSeedData {
  gridSize: number;
  board: number[];
  waypointCount: number;
  solution: number[];
}

/**
 * Encode a puzzle (board + solution) into a shareable seed string.
 * Same puzzle always produces the same seed. Users can share this to recreate the game after expiry.
 */
export function encodeGameSeed(data: GameSeedData): string {
  const json = JSON.stringify({
    g: data.gridSize,
    b: data.board,
    w: data.waypointCount,
    s: data.solution,
  });
  return LZString.compressToEncodedURIComponent(json) ?? "";
}

/**
 * Decode a game seed string back to puzzle data, or null if invalid.
 */
export function decodeGameSeed(seed: string): GameSeedData | null {
  if (typeof seed !== "string" || !seed.trim()) return null;
  const trimmed = seed.trim();
  const json = LZString.decompressFromEncodedURIComponent(trimmed);
  if (json == null || json === "") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const gridSize = o.g;
  const board = o.b;
  const waypointCount = o.w;
  const solution = o.s;
  if (!isValidGridSize(gridSize)) return null;
  if (!Array.isArray(board) || board.length !== (gridSize as number) ** 2)
    return null;
  const k = Number(waypointCount);
  if (!Number.isInteger(k) || k < 1 || k > 49) return null;
  if (!Array.isArray(solution) || solution.length === 0) return null;
  return {
    gridSize: gridSize as GridSize,
    board,
    waypointCount: k,
    solution,
  };
}

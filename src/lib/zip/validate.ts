/**
 * Zip game (LinkedIn-style): Grid with blocked cells (-1), empty path cells (0),
 * and waypoints 1..K. User path must visit every non-blocked cell exactly once,
 * passing through waypoints 1→2→…→K in order.
 */

export type GridSize = 4 | 5 | 7;

export const BLOCKED = -1;

export function getCellIndex(size: GridSize, row: number, col: number): number {
  return row * size + col;
}

export function indexToPos(
  size: GridSize,
  index: number,
): { row: number; col: number } {
  return { row: Math.floor(index / size), col: index % size };
}

export function neighbours(
  size: GridSize,
  row: number,
  col: number,
): [number, number][] {
  const out: [number, number][] = [];
  if (row > 0) out.push([row - 1, col]);
  if (row < size - 1) out.push([row + 1, col]);
  if (col > 0) out.push([row, col - 1]);
  if (col < size - 1) out.push([row, col + 1]);
  return out;
}

/** Count non-blocked cells. */
export function pathCellCount(size: GridSize, board: number[]): number {
  const total = size * size;
  let n = 0;
  for (let i = 0; i < total; i++) {
    if (board[i] !== BLOCKED) n++;
  }
  return n;
}

/**
 * Zip board: -1 = blocked, 0 = empty path cell, 1..K = waypoints (each once).
 * Valid: waypoints 1..K each appear exactly once; rest of non-blocked are 0.
 */
export function validateZipBoard(
  size: GridSize,
  board: number[],
  waypointCount: number,
): { ok: boolean; error?: string } {
  const total = size * size;
  if (board.length !== total) {
    return { ok: false, error: "Board length mismatch" };
  }
  const waypointIndices = new Map<number, number>();
  let emptyCount = 0;
  for (let i = 0; i < total; i++) {
    const v = board[i];
    if (v === BLOCKED) continue;
    if (v < 0 || v > waypointCount) {
      return {
        ok: false,
        error: `Cell value must be 0 or 1..${waypointCount}`,
      };
    }
    if (v === 0) {
      emptyCount++;
      continue;
    }
    if (waypointIndices.has(v)) {
      return { ok: false, error: `Duplicate waypoint ${v}` };
    }
    waypointIndices.set(v, i);
  }
  for (let k = 1; k <= waypointCount; k++) {
    if (!waypointIndices.has(k)) {
      return { ok: false, error: `Missing waypoint ${k}` };
    }
  }
  const expectedEmpty = pathCellCount(size, board) - waypointCount;
  if (emptyCount !== expectedEmpty) {
    return { ok: false, error: "Invalid cell counts" };
  }
  return { ok: true };
}

/** Get index of the cell containing waypoint k (1-based). */
export function indexOfWaypoint(board: number[], k: number): number {
  return board.indexOf(k);
}

/**
 * Validate a path that only fills the board (no waypoint order check).
 * Path must visit every non-blocked cell exactly once and move only to adjacent cells.
 */
export function validatePathOnly(
  size: GridSize,
  board: number[],
  path: number[],
): { ok: boolean; error?: string } {
  const total = size * size;
  const requiredLen = pathCellCount(size, board);
  if (path.length !== requiredLen) {
    return {
      ok: false,
      error: `Path must visit all ${requiredLen} path cells`,
    };
  }
  const visited = new Set<number>();
  for (let i = 0; i < path.length; i++) {
    const idx = path[i];
    if (idx < 0 || idx >= total) {
      return { ok: false, error: "Path out of bounds" };
    }
    if (board[idx] === BLOCKED) {
      return { ok: false, error: "Path cannot go through blocked cell" };
    }
    if (visited.has(idx)) {
      return { ok: false, error: "Path must not repeat cells" };
    }
    visited.add(idx);
    if (i > 0) {
      const prev = path[i - 1];
      const [pr, pc] = [Math.floor(prev / size), prev % size];
      const [r, c] = [Math.floor(idx / size), idx % size];
      const adj = neighbours(size, pr, pc);
      if (!adj.some(([nr, nc]) => nr === r && nc === c)) {
        return { ok: false, error: "Path must move to adjacent cell only" };
      }
    }
  }
  return { ok: true };
}

/**
 * Validate solution: path visits every non-blocked cell once, in order;
 * when we step on a waypoint it must be the next expected (1, then 2, … then K).
 */
export function validateZipSolution(
  size: GridSize,
  board: number[],
  path: number[],
  waypointCount: number,
): { ok: boolean; error?: string } {
  const total = size * size;
  const requiredLen = pathCellCount(size, board);
  if (path.length !== requiredLen) {
    return {
      ok: false,
      error: `Path must visit all ${requiredLen} path cells`,
    };
  }
  const visited = new Set<number>();
  let nextWaypoint = 1;
  for (let i = 0; i < path.length; i++) {
    const idx = path[i];
    if (idx < 0 || idx >= total) {
      return { ok: false, error: "Path out of bounds" };
    }
    if (board[idx] === BLOCKED) {
      return { ok: false, error: "Path cannot go through blocked cell" };
    }
    if (visited.has(idx)) {
      return { ok: false, error: "Path must not repeat cells" };
    }
    visited.add(idx);
    const cellValue = board[idx];
    if (cellValue > 0) {
      if (cellValue !== nextWaypoint) {
        return {
          ok: false,
          error: `Expected waypoint ${nextWaypoint}, got ${cellValue}`,
        };
      }
      nextWaypoint++;
    }
    if (i > 0) {
      const prev = path[i - 1];
      const [pr, pc] = [Math.floor(prev / size), prev % size];
      const [r, c] = [Math.floor(idx / size), idx % size];
      const adj = neighbours(size, pr, pc);
      if (!adj.some(([nr, nc]) => nr === r && nc === c)) {
        return { ok: false, error: "Path must move to adjacent cell only" };
      }
    }
  }
  if (nextWaypoint !== waypointCount + 1) {
    return { ok: false, error: "Path must visit all waypoints in order" };
  }
  return { ok: true };
}

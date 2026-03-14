/**
 * Validate flow puzzle board and solution.
 * Board: flat array, index = row * size + col, value = 0 (empty) or 1..n (pair id).
 * Solution: array of paths; each path = array of [row, col] for one pair (in order).
 */

export type GridSize = 4 | 5;

export function getCellIndex(size: GridSize, row: number, col: number): number {
  return row * size + col;
}

export function indexToPos(
  size: GridSize,
  index: number,
): { row: number; col: number } {
  return { row: Math.floor(index / size), col: index % size };
}

/** Check board has exactly two of each color 1..n and rest zeros. */
export function validateBoard(
  size: GridSize,
  board: number[],
): { ok: boolean; error?: string } {
  const total = size * size;
  if (board.length !== total) {
    return { ok: false, error: "Board length mismatch" };
  }
  const counts: Record<number, number> = {};
  for (let i = 0; i < total; i++) {
    const v = board[i];
    if (v < 0 || v > total) return { ok: false, error: "Invalid cell value" };
    if (v === 0) continue;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  const pairs = Object.entries(counts);
  if (pairs.some(([, c]) => c !== 2)) {
    return { ok: false, error: "Each color must appear exactly twice" };
  }
  const maxId = Math.max(0, ...board);
  for (let id = 1; id <= maxId; id++) {
    if (counts[id] !== 2) {
      return { ok: false, error: `Color ${id} must appear exactly twice` };
    }
  }
  return { ok: true };
}

/** Get endpoints per color from board: color -> [index1, index2] */
export function getEndpoints(
  size: GridSize,
  board: number[],
): Map<number, [number, number]> {
  const map = new Map<number, [number, number]>();
  const total = size * size;
  for (let i = 0; i < total; i++) {
    const v = board[i];
    if (v === 0) continue;
    if (!map.has(v)) map.set(v, [i, i]);
    else {
      const [a] = map.get(v)!;
      map.set(v, [a, i]);
    }
  }
  return map;
}

/** Neighbours (up, down, left, right) */
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

/**
 * Solution: array of paths. Each path is array of [row, col] connecting the two endpoints of one color.
 * Validate: every path connects correct endpoints, paths don't overlap, all cells used at most once.
 */
export function validateSolution(
  size: GridSize,
  board: number[],
  solution: [number, number][][],
): { ok: boolean; error?: string } {
  const boardRes = validateBoard(size, board);
  if (!boardRes.ok) return boardRes;
  const endpoints = getEndpoints(size, board);
  const used = new Set<number>();
  const total = size * size;

  for (let color = 1; color <= solution.length; color++) {
    const path = solution[color - 1];
    const ep = endpoints.get(color);
    if (!ep) return { ok: false, error: `No endpoints for color ${color}` };
    if (!path || path.length < 2) {
      return { ok: false, error: `Path for color ${color} too short` };
    }
    const [start, end] = ep;
    const startIdx = getCellIndex(size, path[0][0], path[0][1]);
    const endIdx = getCellIndex(
      size,
      path[path.length - 1][0],
      path[path.length - 1][1],
    );
    const startMatch = startIdx === start || startIdx === end;
    const endMatch = endIdx === start || endIdx === end;
    if (!startMatch || !endMatch) {
      return { ok: false, error: `Path ${color} does not connect endpoints` };
    }
    for (let i = 0; i < path.length; i++) {
      const [r, c] = path[i];
      if (r < 0 || r >= size || c < 0 || c >= size) {
        return { ok: false, error: `Path ${color} out of bounds` };
      }
      const idx = getCellIndex(size, r, c);
      if (used.has(idx)) return { ok: false, error: "Paths overlap" };
      used.add(idx);
      if (i > 0) {
        const [pr, pc] = path[i - 1];
        const adj = neighbours(size, pr, pc);
        if (!adj.some(([nr, nc]) => nr === r && nc === c)) {
          return { ok: false, error: `Path ${color} not contiguous` };
        }
      }
    }
  }

  if (used.size !== total) {
    return { ok: false, error: "Solution must fill all cells" };
  }
  return { ok: true };
}

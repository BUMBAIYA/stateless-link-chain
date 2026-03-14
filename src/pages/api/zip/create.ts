export const prerender = false;
import type { APIRoute } from "astro";

import { encode } from "@/lib/chain-encoder/encode";
import { sign } from "@/lib/chain-encoder/sign";
import type { GridSize } from "@/lib/zip/validate";
import { validateZipBoard, validateZipSolution } from "@/lib/zip/validate";

/**
 * Create a new zip game chain. Board: -1=blocked, 0=empty path, 1..waypointCount=waypoints.
 * Body: { gridSize: 4|5|7, board: number[], waypointCount: number, solution?: number[] }
 */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let body: {
    gridSize?: number;
    board?: number[];
    waypointCount?: number;
    solution?: number[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { gridSize, board, waypointCount, solution } = body;
  if (gridSize !== 4 && gridSize !== 5 && gridSize !== 7) {
    return Response.json(
      { error: "gridSize must be 4, 5, or 7" },
      { status: 400 },
    );
  }
  if (!Array.isArray(board)) {
    return Response.json({ error: "board required" }, { status: 400 });
  }
  const k = Number(waypointCount);
  if (!Number.isInteger(k) || k < 1 || k > 49) {
    return Response.json(
      { error: "waypointCount must be 1..49" },
      { status: 400 },
    );
  }

  const size = gridSize as GridSize;
  const res = validateZipBoard(size, board, k);
  if (!res.ok) {
    return Response.json({ error: res.error }, { status: 400 });
  }

  const solutionPath = Array.isArray(solution) ? solution : undefined;
  if (solutionPath != null) {
    const solRes = validateZipSolution(size, board, solutionPath, k);
    if (!solRes.ok) {
      return Response.json({ error: solRes.error }, { status: 400 });
    }
  }

  const state = {
    seed: 0,
    players: [],
    maxPlayers: 999,
    gameType: "zip" as const,
    gridSize: size,
    waypointCount: k,
    board,
    solution: solutionPath,
    createdAt: Date.now(),
  };

  const payload = encode(state);
  const sig = await sign(payload);
  const chain = `${payload}.${sig}`;

  return Response.json({
    chain,
    link: `/play/zip?g=${encodeURIComponent(chain)}`,
  });
};

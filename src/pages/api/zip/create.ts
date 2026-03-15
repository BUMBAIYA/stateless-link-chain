export const prerender = false;
import type { APIRoute } from "astro";

import { encode } from "@/lib/chain-encoder/encode";
import { sign } from "@/lib/chain-encoder/sign";
import {
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  type GridSize,
  isValidGridSize,
} from "@/lib/zip/validate";
import { validateZipBoard, validateZipSolution } from "@/lib/zip/validate";

/**
 * Create a new zip game chain. Board: -1=blocked, 0=empty path, 1..waypointCount=waypoints.
 * Body: { gridSize: 4..8, board: number[], waypointCount: number, solution?: number[], creatorId?: string }
 */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let body: {
    gridSize?: number;
    board?: number[];
    waypointCount?: number;
    solution?: number[];
    creatorId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { gridSize, board, waypointCount, solution, creatorId } = body;
  const gameSeed = Math.floor(Math.random() * 0xffff_ffff);
  const gradientSeed = `${typeof creatorId === "string" && creatorId ? creatorId : "anon"}\0${gameSeed}`;
  if (!isValidGridSize(gridSize)) {
    return Response.json(
      { error: `gridSize must be ${GRID_SIZE_MIN} to ${GRID_SIZE_MAX}` },
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
    // Only store solution when it visits waypoints 1→2→…→K in order.
  }

  const state = {
    seed: gameSeed,
    players: [],
    maxPlayers: 999,
    gameType: "zip" as const,
    gridSize: size,
    waypointCount: k,
    board,
    solution: solutionPath,
    createdAt: Date.now(),
    gradientSeed,
  };

  const payload = encode(state);
  const sig = await sign(payload);
  const chain = `${payload}.${sig}`;

  return Response.json({
    chain,
    link: `/play/zip?g=${encodeURIComponent(chain)}`,
  });
};

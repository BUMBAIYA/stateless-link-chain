export const prerender = false;
import type { APIRoute } from "astro";

import { decode } from "@/lib/chain-encoder/decode";
import { verify } from "@/lib/chain-encoder/verify";
import type { ChainState } from "@/lib/chain-encoder/types";
import { normalizeZipState } from "@/lib/zip/normalize-chain";

/**
 * Get a single player's solution path by chain and userId.
 * Query: g=<chain>, userId=<player userId>
 * Or POST body: { g, userId }
 * Returns { path, board, gridSize, name } for the viewer.
 */
async function getStateFromChain(g: string) {
  const lastDot = g.lastIndexOf(".");
  if (lastDot === -1) return { error: "Invalid chain" as const };
  const payload = g.slice(0, lastDot);
  const sig = g.slice(lastDot + 1);
  const valid = await verify(payload, sig);
  if (!valid) return { error: "Invalid chain" as const };
  let state: ChainState;
  try {
    state = decode(payload);
  } catch {
    return { error: "Invalid or corrupted payload" as const };
  }
  if (state.gameType !== "zip")
    return { error: "Not a zip game chain" as const };
  state = normalizeZipState(state);
  return { state, chain: g };
}

export const GET: APIRoute = async ({ url }): Promise<Response> => {
  const g = url.searchParams.get("g");
  const userId = url.searchParams.get("userId");
  if (!g || !userId) {
    return Response.json(
      { error: "Missing g (chain) or userId" },
      { status: 400 },
    );
  }
  const result = await getStateFromChain(g);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  const { state } = result;
  const player = state.players?.find(
    (p) => typeof p.userId === "string" && p.userId === userId,
  );
  if (!player) {
    return Response.json({ error: "Player not found" }, { status: 404 });
  }
  const path = Array.isArray(player.path) ? player.path : [];
  const solution = state.solution;
  // Novel = user's solution is different from the actual (creator's) solution
  const isNovel =
    Array.isArray(solution) &&
    path.length > 0 &&
    (solution.length !== path.length ||
      solution.some((v, i) => v !== path[i]));
  return Response.json({
    path,
    board: state.board,
    gridSize: state.gridSize,
    name: player.name,
    isNovel: !!isNovel,
  });
};

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let body: { g?: string; userId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const g = body.g;
  const userId = body.userId;
  if (typeof g !== "string" || !g || typeof userId !== "string" || !userId) {
    return Response.json(
      { error: "Missing g (chain) or userId" },
      { status: 400 },
    );
  }
  const result = await getStateFromChain(g);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  const { state } = result;
  const player = state.players?.find(
    (p) => typeof p.userId === "string" && p.userId === userId,
  );
  if (!player) {
    return Response.json({ error: "Player not found" }, { status: 404 });
  }
  const path = Array.isArray(player.path) ? player.path : [];
  const solution = state.solution;
  // Novel = user's solution is different from the actual (creator's) solution
  const isNovel =
    Array.isArray(solution) &&
    path.length > 0 &&
    (solution.length !== path.length ||
      solution.some((v, i) => v !== path[i]));
  return Response.json({
    path,
    board: state.board,
    gridSize: state.gridSize,
    name: player.name,
    isNovel: !!isNovel,
  });
};

export const prerender = false;
import type { APIRoute } from "astro";

import { decode } from "@/lib/chain-encoder/decode";
import { verify } from "@/lib/chain-encoder/verify";
import type { ChainState } from "@/lib/chain-encoder/types";
import { normalizeZipState } from "@/lib/zip/normalize-chain";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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

function pathsEqual(a: number[] | undefined, b: number[] | undefined): boolean {
  if (a == null || b == null) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Novel = user's solution path is different from the actual (creator's) solution.
 * Score API has full state (creator solution + each player's path) so we compute here.
 */
function scoreboardPlayers(
  players: {
    name: string;
    score: number;
    time: number;
    userId?: string;
    path?: number[];
  }[] = [],
  creatorSolution: number[] | undefined,
) {
  return players.map((p) => ({
    name: p.name,
    score: p.score,
    time: p.time,
    userId: typeof p.userId === "string" ? p.userId : undefined,
    isNovel:
      Array.isArray(creatorSolution) &&
      Array.isArray(p.path) &&
      p.path.length > 0 &&
      !pathsEqual(creatorSolution, p.path),
  }));
}

export const GET: APIRoute = async ({ url }): Promise<Response> => {
  const g = url.searchParams.get("g");
  if (!g) {
    return Response.json({ error: "Missing game chain" }, { status: 400 });
  }
  const result = await getStateFromChain(g);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  const { state, chain } = result;
  const createdAt = state.createdAt ?? 0;
  const expired = Date.now() - createdAt > ONE_DAY_MS;
  return Response.json({
    chain,
    gameType: "zip",
    gridSize: state.gridSize,
    waypointCount: state.waypointCount ?? 12,
    board: state.board,
    solution: state.solution,
    players: scoreboardPlayers(state.players, state.solution),
    createdAt,
    expired,
  });
};

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let body: { g?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const g = body.g;
  if (typeof g !== "string" || !g) {
    return Response.json({ error: "Missing game chain (g)" }, { status: 400 });
  }
  const result = await getStateFromChain(g);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  const { state, chain } = result;
  const createdAt = state.createdAt ?? 0;
  const expired = Date.now() - createdAt > ONE_DAY_MS;

  return Response.json({
    chain,
    gameType: "zip",
    gridSize: state.gridSize,
    waypointCount: state.waypointCount ?? 12,
    board: state.board,
    solution: state.solution,
    players: scoreboardPlayers(state.players, state.solution),
    createdAt,
    expired,
  });
};

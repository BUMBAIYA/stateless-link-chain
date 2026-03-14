export const prerender = false;
import type { APIRoute } from "astro";

import { decode } from "@/lib/chain-encoder/decode";
import { verify } from "@/lib/chain-encoder/verify";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Get zip game state. Returns expired: true if created > 24h ago.
 */
export const GET: APIRoute = async ({ url }): Promise<Response> => {
  const g = url.searchParams.get("g");
  if (!g) {
    return Response.json({ error: "Missing game chain" }, { status: 400 });
  }

  const lastDot = g.lastIndexOf(".");
  if (lastDot === -1) {
    return Response.json({ error: "Invalid chain" }, { status: 400 });
  }
  const payload = g.slice(0, lastDot);
  const sig = g.slice(lastDot + 1);
  const valid = await verify(payload, sig);
  if (!valid) {
    return Response.json({ error: "Invalid chain" }, { status: 400 });
  }

  let state;
  try {
    state = decode(payload);
  } catch {
    return Response.json(
      { error: "Invalid or corrupted payload" },
      { status: 400 },
    );
  }

  if (state.gameType !== "zip") {
    return Response.json({ error: "Not a zip game chain" }, { status: 400 });
  }

  const createdAt = state.createdAt ?? 0;
  const expired = Date.now() - createdAt > ONE_DAY_MS;

  return Response.json({
    chain: g,
    gameType: "zip",
    gridSize: state.gridSize,
    waypointCount: state.waypointCount ?? 12,
    board: state.board,
    players: state.players,
    createdAt,
    expired,
  });
};

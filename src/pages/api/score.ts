export const prerender = false;
import type { APIRoute } from "astro";

import { decode } from "@/lib/chain-encoder/decode";
import { verify } from "@/lib/chain-encoder/verify";

/**
 * Get the score of the game.
 * @param request - The request object.
 * @returns {Response} - The response object.
 */
export const GET: APIRoute = async ({ url }): Promise<Response> => {
  const searchParams = new URLSearchParams(url.search);
  const g = searchParams.get("g");

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

  return Response.json({
    chain: g,
    seed: state.seed,
    players: state.players,
    maxPlayers: state.maxPlayers,
    totalPlayers: state.players.length,
    remainingSlots: state.maxPlayers - state.players.length,
  });
};

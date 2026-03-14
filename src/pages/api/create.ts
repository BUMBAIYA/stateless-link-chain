export const prerender = false;
import type { APIRoute } from "astro";

import { encode } from "@/lib/chain-encoder/encode";
import { sign } from "@/lib/chain-encoder/sign";

/**
 * Create a new stateless link chain.
 * @returns {Response} - The response object with the link.
 */
export const POST: APIRoute = async (): Promise<Response> => {
  const state = {
    seed: Math.floor(Math.random() * 1000000),
    players: [],
    maxPlayers: 10,
  };

  const payload = encode(state);
  const sig = await sign(payload);
  const chain = `${payload}.${sig}`;

  return Response.json({
    link: `/play?g=${chain}`,
    payload,
    sig,
    chain,
  });
};

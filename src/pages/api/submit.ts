export const prerender = false;
import type { APIRoute } from "astro";

import { decode } from "@/lib/chain-encoder/decode";
import { encode } from "@/lib/chain-encoder/encode";
import { sign } from "@/lib/chain-encoder/sign";
import { verify } from "@/lib/chain-encoder/verify";

/**
 * Submit a new score to the stateless link chain.
 * @param request - The request object.
 * @returns {Response} - The response object.
 */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const body = await request.json();

  const { chain, name, score, time } = body;

  const lastDot = chain.lastIndexOf(".");
  if (lastDot === -1) {
    return Response.json({ error: "Invalid chain" }, { status: 401 });
  }
  const payload = chain.slice(0, lastDot);
  const sig = chain.slice(lastDot + 1);

  const valid = await verify(payload, sig);

  if (!valid) {
    return Response.json({ error: "Invalid chain" }, { status: 401 });
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

  if (state.players.length >= state.maxPlayers) {
    return Response.json({ error: "Game full" }, { status: 403 });
  }

  state.players.push({ name, score, time });

  const newPayload = encode(state);
  const newSig = await sign(newPayload);

  const newChain = `${newPayload}.${newSig}`;

  return Response.json({
    link: `/play?g=${encodeURIComponent(newChain)}`,
    payload: newPayload,
    sig: newSig,
    chain: newChain,
  });
};

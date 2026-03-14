export const prerender = false;
import type { APIRoute } from "astro";

import { decode } from "@/lib/chain-encoder/decode";
import { encode } from "@/lib/chain-encoder/encode";
import { sign } from "@/lib/chain-encoder/sign";
import { verify } from "@/lib/chain-encoder/verify";

/**
 * Submit a zip game score (name + score + time + path). Requires unique name.
 * Returns new chain with link to /play/zip.
 */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let body: {
    chain?: string;
    name?: string;
    score?: number;
    time?: number;
    path?: number[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { chain, name, score, time, path } = body;
  if (chain == null) {
    return Response.json({ error: "chain required" }, { status: 400 });
  }

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

  if (state.gameType !== "zip") {
    return Response.json(
      { error: "Not a zip game chain. Use the correct submit endpoint." },
      { status: 400 },
    );
  }

  if (state.players.length >= state.maxPlayers) {
    return Response.json({ error: "Game full" }, { status: 403 });
  }

  const nameLower = String(name).trim().toLowerCase();
  if (!nameLower) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }
  const taken = state.players.some(
    (p) => p.name.trim().toLowerCase() === nameLower,
  );
  if (taken) {
    return Response.json({ error: "Name already taken" }, { status: 400 });
  }

  state.players.push({
    name: String(name).trim(),
    score: Number(score) || 0,
    time: Number(time) || 0,
    path: Array.isArray(path) ? path : undefined,
  });

  const newPayload = encode(state);
  const newSig = await sign(newPayload);
  const newChain = `${newPayload}.${newSig}`;

  return Response.json({
    link: `/play/zip?g=${encodeURIComponent(newChain)}`,
    payload: newPayload,
    sig: newSig,
    chain: newChain,
  });
};

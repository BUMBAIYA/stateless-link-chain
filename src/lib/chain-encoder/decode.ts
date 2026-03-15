import LZString from "lz-string";

import type { ChainState } from "@/lib/chain-encoder/types";

/**
 * Decompress and decode the payload into chain state.
 * @param payload - The LZString-compressed, URL-safe payload.
 * @returns The decoded chain state.
 */
export function decode(payload: string): ChainState {
  const json = LZString.decompressFromEncodedURIComponent(payload);
  if (json == null || json === "") {
    throw new Error("Invalid or empty payload");
  }
  return JSON.parse(json) as ChainState;
}

import { SECRET } from "@/lib/chain-encoder/secret";

/**
 * Sign the payload using the encoding secret.
 * @param payload - The payload to sign.
 * @returns The signed payload.
 */
export async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  const bytes = new Uint8Array(sig);

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
    .slice(0, 16);
}

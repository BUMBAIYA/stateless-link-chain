import { sign } from "@/lib/chain-encoder/sign";

/**
 * Verify the signed payload using the encoding secret.
 * @param payload - The payload to verify.
 * @param sig - The signed payload.
 * @returns True if the payload is verified, false otherwise.
 */
export async function verify(payload: string, sig: string) {
  const expected = await sign(payload);
  return expected === sig;
}

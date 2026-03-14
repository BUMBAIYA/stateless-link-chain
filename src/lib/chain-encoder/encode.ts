import LZString from "lz-string";

/**
 * Encode and compress the data for use in URLs (LZString for shorter chains).
 * @param data - The data to encode.
 * @returns The encoded, URL-safe string.
 */
export function encode(data: unknown): string {
  const json = JSON.stringify(data);
  return LZString.compressToEncodedURIComponent(json) ?? "";
}

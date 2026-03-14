/**
 * Encode the data into a base64 string.
 * @param data - The data to encode.
 * @returns The encoded data.
 */
export function encode(data: any) {
  return btoa(JSON.stringify(data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

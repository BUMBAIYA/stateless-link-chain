/**
 * Decode the base64 string into a data object.
 * @param payload - The base64 string to decode.
 * @returns The decoded data.
 */
export function decode(payload: string) {
  payload = payload.replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(payload);
  return JSON.parse(json);
}

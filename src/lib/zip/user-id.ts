import { nanoid } from "nanoid";

const ZIP_USER_ID_COOKIE = "p_id";
const ZIP_USER_ID_MAX_AGE = 365 * 24 * 60 * 60;

/**
 * Get or create a stable user id for Zip (stored in cookie).
 * Used as creator id when creating a game and for solution API.
 */
export function getZipUserId(): string {
  if (typeof document === "undefined") return nanoid();
  const row = document.cookie
    .split("; ")
    .find((r) => r.startsWith(ZIP_USER_ID_COOKIE + "="));
  const existing = row
    ? decodeURIComponent(row.slice(ZIP_USER_ID_COOKIE.length + 1))
    : "";
  if (existing.length > 0) return existing;
  const id = nanoid();
  document.cookie =
    ZIP_USER_ID_COOKIE +
    "=" +
    encodeURIComponent(id) +
    "; path=/; max-age=" +
    ZIP_USER_ID_MAX_AGE +
    "; SameSite=Lax";
  return id;
}

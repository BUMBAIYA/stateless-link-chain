export const prerender = false;

/**
 * Health check endpoint - `GET /api/health`.
 * Returns the current epoch time in milliseconds.
 * @returns {Response} - The response object.
 */
export const GET = (): Response => {
  const epoch = new Date().getTime();
  return Response.json({ epoch, status: "OK" }, { status: 200 });
};

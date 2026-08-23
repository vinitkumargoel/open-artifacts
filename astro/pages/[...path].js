/**
 * Catch-all 404, mirroring the Hono app.notFound handler. Every real route is
 * more specific than this rest parameter, so only unmatched paths land here.
 * Unread bodies are drained first (see drainBody) so 404-ing a body-carrying
 * request can't kill wrangler dev's proxy.
 */
import { drainBody, notFoundResponse } from '../lib/http.js';

export const prerender = false;

export async function ALL({ request }) {
  await drainBody(request);
  return notFoundResponse(request);
}

/**
 * Catch-all 404, mirroring the Hono app.notFound handler: HTML for browser-ish
 * clients (missing Accept or wildcard included, matching Express
 * req.accepts('html')), JSON error envelope otherwise. Every real route is more
 * specific than this rest parameter, so only unmatched paths land here.
 */
import { jsonError } from '../lib/http.js';

export const prerender = false;

export function ALL({ request }) {
  const accept = request.headers.get('accept');
  if (!accept || accept.includes('text/html') || accept.includes('*/*')) {
    return new Response(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>404 &bull; Page Not Found</h2>
          <p style="color:#94a3b8;">The requested page could not be found.</p>
          <a href="/upload" style="color:#3b82f6;">&larr; Go to Upload Portal</a>
        </body></html>
      `, { status: 404, headers: { 'content-type': 'text/html; charset=UTF-8' } });
  }
  return jsonError('NOT_FOUND', `Cannot ${request.method} ${new URL(request.url).pathname}`, 404);
}

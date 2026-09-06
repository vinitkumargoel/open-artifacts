/**
 * Per-visitor rate limiting on Durable Objects.
 *
 * Each visitor bucket gets its own Durable Object instance per scope
 * (idFromName(`${scope}:${bucket}`)), holding a fixed 60-second window counter
 * in durable storage. This preserves the per-visitor keying of the legacy Express
 * middleware in a runtime where isolate memory
 * is neither shared nor long-lived.
 */
import { DurableObject } from 'cloudflare:workers';

export const WINDOW_MS = 60 * 1000;

export class RateLimiterDO extends DurableObject {
  /**
   * Registers one hit against the fixed window and reports the verdict.
   * @param {number} limit - Max hits per window
   * @param {number} windowMs
   * @returns {Promise<{allowed: boolean, remaining: number, resetSeconds: number}>}
   */
  async hit(limit, windowMs) {
    const now = Date.now();
    let win = await this.ctx.storage.get('window');
    if (!win || now - win.start >= windowMs) {
      win = { start: now, count: 0 };
    }
    win.count++;
    await this.ctx.storage.put('window', win);
    // Let the storage engine reclaim the row once the window is stale.
    await this.ctx.storage.setAlarm(win.start + windowMs);
    return {
      allowed: win.count <= limit,
      remaining: Math.max(0, limit - win.count),
      resetSeconds: Math.max(1, Math.ceil((win.start + windowMs - now) / 1000))
    };
  }

  async alarm() {
    const win = await this.ctx.storage.get('window');
    if (win && Date.now() - win.start >= WINDOW_MS) {
      await this.ctx.storage.deleteAll();
    }
  }
}

function stripV4Mapped(ip) {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * Collapses an address into a rate-limit bucket. IPv6 clients routinely get a
 * fresh address per connection, so they are bucketed by /64 rather than by
 * exact address — otherwise a single visitor never trips the limit.
 */
export function toBucket(ip) {
  if (!ip) return 'unknown';
  const addr = stripV4Mapped(ip.trim());
  if (!addr.includes(':')) return addr;
  return `${addr.split(':').slice(0, 4).join(':')}::/64`;
}

/**
 * Identifies the visitor. On Cloudflare, CF-Connecting-IP is set by the edge
 * itself and inbound copies from clients are overwritten, so it cannot be
 * forged into someone else's bucket. TRUST_VISITOR_HEADER is a local-dev/E2E
 * escape hatch (wrangler dev sees every request as loopback) and must never
 * be set on a deployed environment.
 * @param {Request} request
 * @param {object} env
 * @returns {string}
 */
export function visitorBucket(request, env) {
  if (env.TRUST_VISITOR_HEADER === '1') {
    const override = request.headers.get('x-e2e-visitor');
    if (override) return toBucket(override);
  }
  return toBucket(request.headers.get('cf-connecting-ip') || '');
}

/**
 * Checks (and counts) one request against the limiter for the given scope.
 * @param {object} params
 * @param {Request} params.request
 * @param {object} params.env
 * @param {'read'|'upload'} params.scope
 * @param {number} params.limit
 * @returns {Promise<{allowed: boolean, limit: number, remaining: number, resetSeconds: number}>}
 */
export async function checkRateLimit({ request, env, scope, limit }) {
  const bucket = visitorBucket(request, env);
  const id = env.RATE_LIMITER.idFromName(`${scope}:${bucket}`);
  const stub = env.RATE_LIMITER.get(id);
  const verdict = await stub.hit(limit, WINDOW_MS);
  return { ...verdict, limit };
}

/**
 * Counts one event against a single instance-wide window rather than a
 * per-visitor one.
 *
 * Per-IP limiting is useless against a distributed credential-guessing attack:
 * every source address gets its own uncontended Durable Object and therefore
 * its own full budget. This is the backstop for that, so it is only ever fed
 * failures — a legitimate visitor with a valid token never touches it, and it
 * stays a cold object under normal traffic.
 *
 * @param {{env: object, scope: string, limit: number}} params
 */
export async function checkGlobalRateLimit({ env, scope, limit }) {
  const id = env.RATE_LIMITER.idFromName(`${scope}:global`);
  const stub = env.RATE_LIMITER.get(id);
  const verdict = await stub.hit(limit, WINDOW_MS);
  return { ...verdict, limit };
}

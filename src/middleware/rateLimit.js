import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

const PRIVATE_PEER = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/;

function stripV4Mapped(ip) {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * True when the request reached us over loopback, the Docker bridge, or the LAN
 * — i.e. from the Cloudflare Tunnel rather than straight off the internet.
 * Only then are the edge-supplied client-IP headers meaningful.
 */
function isTrustedPeer(remoteAddress) {
  if (!remoteAddress) return false;
  const ip = stripV4Mapped(remoteAddress);
  return ip === '::1' || PRIVATE_PEER.test(ip) || /^f[cd]/i.test(ip);
}

/**
 * Collapses an address into a rate-limit bucket. IPv6 clients routinely get a
 * fresh address per connection, so they are bucketed by /64 rather than by
 * exact address — otherwise a single visitor never trips the limit.
 */
function toBucket(ip) {
  if (!ip) return 'unknown';
  const addr = stripV4Mapped(ip.trim());
  if (!addr.includes(':')) return addr;
  return `${addr.split(':').slice(0, 4).join(':')}::/64`;
}

/**
 * Identifies the visitor behind the tunnel.
 *
 * Express resolves req.ip from X-Forwarded-For once `trust proxy` is set, which
 * covers the normal path. CF-Connecting-IP is preferred when present because
 * Cloudflare sets it to the true client address even if the forwarded chain is
 * rewritten, and it is only honoured for requests from a trusted hop so a
 * direct caller cannot forge its way into someone else's bucket.
 */
function clientKey(req) {
  if (isTrustedPeer(req.socket?.remoteAddress)) {
    const edgeIp = req.get('cf-connecting-ip') || req.get('true-client-ip');
    if (edgeIp) return toBucket(edgeIp.split(',')[0]);
  }
  return toBucket(req.ip);
}

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.uploadRateLimitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: `Upload rate limit exceeded. Max ${config.uploadRateLimitPerMin} uploads per minute.`,
      status: 429
    }
  }
});

export const readLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.readRateLimitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: `Read rate limit exceeded. Max ${config.readRateLimitPerMin} requests per minute.`,
      status: 429
    }
  }
});

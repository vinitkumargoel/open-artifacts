import crypto from 'crypto';
import { config } from '../config/env.js';

/**
 * Timing-safe SHA-256 pre-hashed token verification.
 * Pre-hashing to SHA-256 guarantees equal length buffers (32 bytes)
 * and eliminates length-oracle vulnerabilities.
 *
 * @param {string|undefined} providedToken
 * @param {string|undefined} secretToken
 * @returns {boolean}
 */
export function verifyToken(providedToken, secretToken) {
  if (!providedToken || !secretToken || typeof providedToken !== 'string' || typeof secretToken !== 'string') {
    return false;
  }
  const hashA = crypto.createHash('sha256').update(providedToken.trim()).digest();
  const hashB = crypto.createHash('sha256').update(secretToken.trim()).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Express middleware to guard publishing, updating, and deleting routes.
 */
export function authGuard(req, res, next) {
  const authHeader = req.headers['authorization'];
  const tokenHeader = req.headers['x-access-token'] || req.headers['x-auth-token'];

  let token = tokenHeader;
  if (!token && authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  // Also check query param ?token= (for emergency CLI or authorized downloads if passed)
  if (!token && req.query && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  const configuredSecret = config.accessToken;

  if (!configuredSecret) {
    return res.status(500).json({
      error: {
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Server ARTIFACT_ACCESS_TOKEN is not configured in environment variables.',
        status: 500
      }
    });
  }

  if (!verifyToken(token, configuredSecret)) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized. Missing or invalid access token. Provide a valid Authorization: Bearer <token> or x-access-token header.',
        status: 401
      }
    });
  }

  next();
}

export default authGuard;

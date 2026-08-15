import express from 'express';
import fs from 'fs';
import { rawSandboxHeaders } from '../middleware/security.js';
import { readLimiter } from '../middleware/rateLimit.js';
import { getArtifactMetadata, getArtifactFilePath } from '../services/storage.js';
import { isValidUuid4, parsePositiveInt } from '../utils/sanitize.js';

const router = express.Router();

/**
 * GET /raw/:uuid
 * Redirects to the latest version of the raw artifact.
 */
router.get('/:uuid', readLimiter, async (req, res, next) => {
  try {
    const { uuid } = req.params;

    if (!isValidUuid4(uuid)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_UUID_FORMAT',
          message: 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.',
          status: 400
        }
      });
    }

    const metadata = await getArtifactMetadata(uuid);
    if (!metadata) {
      return res.status(404).json({
        error: {
          code: 'ARTIFACT_NOT_FOUND',
          message: `Artifact with ID ${uuid} not found.`,
          status: 404
        }
      });
    }

    const latestVer = metadata.latestVersion || 1;
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.redirect(302, `/raw/${uuid}/${latestVer}`);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /raw/:uuid/:version
 * Streams the sandboxed standalone HTML file directly with opaque-origin CSP headers.
 */
router.get('/:uuid/:version', readLimiter, async (req, res, next) => {
  try {
    const { uuid, version } = req.params;

    if (!isValidUuid4(uuid)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_UUID_FORMAT',
          message: 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.',
          status: 400
        }
      });
    }

    const verNum = parsePositiveInt(version);
    if (isNaN(verNum)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_VERSION',
          message: 'Version must be a positive integer (e.g. 1, 2, 3).',
          status: 400
        }
      });
    }

    const filePath = getArtifactFilePath(uuid, verNum);
    if (!filePath) {
      return res.status(404).json({
        error: {
          code: 'VERSION_NOT_FOUND',
          message: `Version ${verNum} for artifact ${uuid} not found.`,
          status: 404
        }
      });
    }

    // Apply sandbox and caching headers for 200 stream
    rawSandboxHeaders(req, res, () => {});
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      next(err);
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;

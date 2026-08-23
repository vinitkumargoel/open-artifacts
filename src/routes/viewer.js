import express from 'express';
import { viewerSecurityHeaders } from '../middleware/security.js';
import { readLimiter } from '../middleware/rateLimit.js';
import { getArtifactMetadata } from '../services/storage.js';
import { renderViewerHtml } from '../views/viewer.js';
import { renderUploadHtml } from '../views/upload.js';
import { renderHistoryHtml } from '../views/history.js';
import { isValidUuid4, parsePositiveInt } from '../utils/sanitize.js';

const router = express.Router();

/**
 * GET / and GET /upload
 * Minimal drag & drop artifact publishing portal.
 */
router.get(['/', '/upload'], readLimiter, viewerSecurityHeaders, (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderUploadHtml());
});

/**
 * GET /history
 * Full artifact history catalog with selection and deletion management.
 */
router.get('/history', readLimiter, viewerSecurityHeaders, (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(renderHistoryHtml());
});

/**
 * GET /a/:uuid
 * Public Viewer Shell for latest version of an artifact.
 */
router.get('/a/:uuid', readLimiter, viewerSecurityHeaders, async (req, res, next) => {
  try {
    const { uuid } = req.params;

    if (!isValidUuid4(uuid)) {
      return res.status(400).send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>Invalid Artifact ID</h2>
          <p style="color:#94a3b8;">The requested artifact ID is not a valid UUID-4 format.</p>
          <a href="/upload" style="color:#3b82f6;">&larr; Back to Upload</a>
        </body></html>
      `);
    }

    const metadata = await getArtifactMetadata(uuid);
    if (!metadata) {
      return res.status(404).send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>Artifact Not Found (404)</h2>
          <p style="color:#94a3b8;">No artifact found with ID: <code>${uuid}</code></p>
          <a href="/upload" style="color:#3b82f6;">&larr; Back to Upload</a>
        </body></html>
      `);
    }

    const latestVer = metadata.latestVersion || 1;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const html = renderViewerHtml({
      artifact: metadata,
      currentVersion: latestVer
    });

    return res.send(html);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /a/:uuid/v/:version
 * Public Viewer Shell pinned to a specific version.
 */
router.get('/a/:uuid/v/:version', readLimiter, viewerSecurityHeaders, async (req, res, next) => {
  try {
    const { uuid, version } = req.params;

    if (!isValidUuid4(uuid)) {
      return res.status(400).send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>Invalid Artifact ID</h2>
          <p style="color:#94a3b8;">The requested artifact ID is not a valid UUID-4 format.</p>
          <a href="/upload" style="color:#3b82f6;">&larr; Back to Upload</a>
        </body></html>
      `);
    }

    const verNum = parsePositiveInt(version);
    if (isNaN(verNum)) {
      return res.status(400).send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>Invalid Version Number</h2>
          <p style="color:#94a3b8;">Version must be a positive integer.</p>
        </body></html>
      `);
    }

    const metadata = await getArtifactMetadata(uuid);
    if (!metadata) {
      return res.status(404).send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>Artifact Not Found (404)</h2>
          <p style="color:#94a3b8;">No artifact found with ID: <code>${uuid}</code></p>
        </body></html>
      `);
    }

    const hasVersion = (metadata.versions || []).some(v => v.versionNumber === verNum);
    if (!hasVersion) {
      return res.status(404).send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>Version Not Found (404)</h2>
          <p style="color:#94a3b8;">Version ${verNum} does not exist for artifact <code>${uuid}</code>.</p>
        </body></html>
      `);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Short TTL: the shell embeds the version dropdown, so a long cache would
    // hide newly published versions on pinned pages. Raw content stays immutable.
    res.setHeader('Cache-Control', 'public, max-age=300');

    const html = renderViewerHtml({
      artifact: metadata,
      currentVersion: verNum
    });

    return res.send(html);
  } catch (err) {
    next(err);
  }
});

export default router;

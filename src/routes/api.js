import express from 'express';
import { authGuard } from '../middleware/auth.js';
import { uploadLimiter, readLimiter } from '../middleware/rateLimit.js';
import { uploadMiddleware, processArtifactUpload, getArtifactMetadata, deleteArtifact } from '../services/storage.js';
import { isValidUuid4 } from '../utils/sanitize.js';
import { config } from '../config/env.js';

const router = express.Router();

/**
 * POST /api/artifacts
 * Publish a new artifact or a new version of an existing artifact.
 */
router.post('/artifacts', uploadLimiter, authGuard, (req, res, next) => {
  uploadMiddleware(req, res, async (err) => {
    if (err) return next(err);

    try {
      const { id, title, description } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'No HTML file attached. Pass a file field in multipart/form-data.',
            status: 400
          }
        });
      }

      const result = await processArtifactUpload({
        file,
        id,
        title,
        description
      });

      const artifactId = result.artifact._id;
      const version = result.versionNumber;
      const publicUrl = `${config.baseUrl}/a/${artifactId}`;
      const rawUrl = `${config.baseUrl}/raw/${artifactId}/${version}`;

      return res.status(201).json({
        id: artifactId,
        version,
        title: result.artifact.title,
        description: result.artifact.description,
        isNew: result.isNew,
        url: publicUrl,
        rawUrl,
        createdAt: result.artifact.updatedAt || result.artifact.createdAt
      });
    } catch (processErr) {
      next(processErr);
    }
  });
});

/**
 * GET /api/artifacts/:uuid
 * Public metadata lookup for an artifact and its version list.
 */
router.get('/artifacts/:uuid', readLimiter, async (req, res, next) => {
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

    const artifact = await getArtifactMetadata(uuid);
    if (!artifact) {
      return res.status(404).json({
        error: {
          code: 'ARTIFACT_NOT_FOUND',
          message: `Artifact with ID ${uuid} not found.`,
          status: 404
        }
      });
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json({
      id: artifact._id,
      title: artifact.title,
      description: artifact.description,
      latestVersion: artifact.latestVersion,
      viewCount: artifact.viewCount || 0,
      url: `${config.baseUrl}/a/${artifact._id}`,
      rawUrl: `${config.baseUrl}/raw/${artifact._id}/${artifact.latestVersion}`,
      versions: (artifact.versions || []).map(v => ({
        versionNumber: v.versionNumber,
        description: v.description,
        fileSize: v.fileSize,
        contentHash: v.contentHash,
        url: `${config.baseUrl}/a/${artifact._id}/v/${v.versionNumber}`,
        rawUrl: `${config.baseUrl}/raw/${artifact._id}/${v.versionNumber}`,
        createdAt: v.createdAt
      })),
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/artifacts/:uuid
 * Emergency takedown/deletion of an artifact and all its versions.
 */
router.delete('/artifacts/:uuid', authGuard, async (req, res, next) => {
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

    const deleted = await deleteArtifact(uuid);
    if (!deleted) {
      return res.status(404).json({
        error: {
          code: 'ARTIFACT_NOT_FOUND',
          message: `Artifact with ID ${uuid} not found.`,
          status: 404
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: `Artifact ${uuid} and all its versions have been permanently deleted.`
    });
  } catch (err) {
    next(err);
  }
});

export default router;

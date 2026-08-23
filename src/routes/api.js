import express from 'express';
import { authGuard } from '../middleware/auth.js';
import { uploadLimiter, readLimiter } from '../middleware/rateLimit.js';
import {
  uploadMiddleware,
  processArtifactUpload,
  getArtifactMetadata,
  deleteArtifact,
  listAllArtifacts,
  bulkDeleteArtifacts
} from '../services/storage.js';
import { isValidUuid4 } from '../utils/sanitize.js';
import { config } from '../config/env.js';

const router = express.Router();

/**
 * GET /api/artifacts
 * Returns all artifacts metadata for history dashboard.
 */
router.get('/artifacts', readLimiter, async (req, res, next) => {
  try {
    const artifacts = await listAllArtifacts();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json({
      artifacts,
      count: artifacts.length
    });
  } catch (err) {
    next(err);
  }
});

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

/**
 * POST /api/artifacts/bulk-delete and DELETE /api/artifacts
 * Bulk deletion of artifacts and all their versions.
 */
const handleBulkDelete = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request body must include a non-empty array of artifact UUIDs in "ids".',
          status: 400
        }
      });
    }

    // Validate every ID is UUID v4
    const invalidIds = ids.filter(id => typeof id !== 'string' || !isValidUuid4(id.trim()));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_UUID_FORMAT',
          message: `Found invalid UUID-4 format in ids: ${invalidIds.slice(0, 3).join(', ')}${invalidIds.length > 3 ? '...' : ''}`,
          status: 400
        }
      });
    }

    const result = await bulkDeleteArtifacts(ids);
    return res.status(200).json({
      success: true,
      deletedCount: result.deletedCount,
      deletedIds: result.deletedIds,
      failedIds: result.failedIds,
      message: `Successfully deleted ${result.deletedCount} artifact(s).`
    });
  } catch (err) {
    next(err);
  }
};

router.post('/artifacts/bulk-delete', authGuard, handleBulkDelete);
router.delete('/artifacts', authGuard, handleBulkDelete);

export default router;

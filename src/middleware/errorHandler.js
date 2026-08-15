import multer from 'multer';
import { config } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // Handle Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: {
          code: 'FILE_TOO_LARGE',
          message: `Uploaded file exceeds the maximum allowed size of ${config.maxFileSizeMb}MB.`,
          status: 413
        }
      });
    }
    return res.status(400).json({
      error: {
        code: 'UPLOAD_ERROR',
        message: err.message,
        status: 400
      }
    });
  }

  // Handle application specific errors
  if (err.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({
      error: {
        code: 'INVALID_FILE_TYPE',
        message: err.message || 'Invalid file type. Only standalone HTML files (.html, .htm) are supported.',
        status: 400
      }
    });
  }

  if (err.code === 'INVALID_UUID_FORMAT') {
    return res.status(400).json({
      error: {
        code: 'INVALID_UUID_FORMAT',
        message: 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.',
        status: 400
      }
    });
  }

  if (err.code === 'ARTIFACT_NOT_FOUND') {
    return res.status(404).json({
      error: {
        code: 'ARTIFACT_NOT_FOUND',
        message: err.message || 'Artifact not found.',
        status: 404
      }
    });
  }

  if (err.code === 'VERSION_NOT_FOUND') {
    return res.status(404).json({
      error: {
        code: 'VERSION_NOT_FOUND',
        message: err.message || 'The requested artifact version does not exist.',
        status: 404
      }
    });
  }

  if (err.code === 'UNAUTHORIZED') {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: err.message || 'Unauthorized access.',
        status: 401
      }
    });
  }

  // Fallback 500
  console.error('[OpenArtifacts Error]', err);
  return res.status(err.status || 500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: config.nodeEnv === 'production' ? 'An internal server error occurred.' : err.message,
      status: err.status || 500
    }
  });
}

export default errorHandler;

import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.uploadRateLimitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
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
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: `Read rate limit exceeded. Max ${config.readRateLimitPerMin} requests per minute.`,
      status: 429
    }
  }
});

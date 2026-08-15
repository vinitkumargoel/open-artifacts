import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const ROOT_DIR = process.cwd();
const STORAGE_PATH = process.env.STORAGE_PATH
  ? path.resolve(ROOT_DIR, process.env.STORAGE_PATH)
  : path.resolve(ROOT_DIR, 'data/artifacts');

// Ensure storage directories exist
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

const TMP_PATH = path.join(STORAGE_PATH, 'tmp');
if (!fs.existsSync(TMP_PATH)) {
  fs.mkdirSync(TMP_PATH, { recursive: true });
}

export const config = {
  port: parseInt(process.env.PORT || '3008', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || '3008'}`).replace(/\/+$/, ''),
  accessToken: process.env.ARTIFACT_ACCESS_TOKEN || (process.env.NODE_ENV === 'test' ? 'test_secret_token_12345' : ''),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/open_artifacts',
  storagePath: STORAGE_PATH,
  tmpPath: TMP_PATH,
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10),
  uploadRateLimitPerMin: parseInt(process.env.UPLOAD_RATE_LIMIT_PER_MIN || '30', 10),
  readRateLimitPerMin: parseInt(process.env.READ_RATE_LIMIT_PER_MIN || '120', 10)
};

export default config;

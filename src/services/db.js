import mongoose from 'mongoose';
import { config } from '../config/env.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected || mongoose.connection.readyState === 1) {
    isConnected = true;
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000
    });
    isConnected = true;
    if (config.nodeEnv !== 'test') {
      console.log(`[OpenArtifacts] Connected to MongoDB at ${config.mongoUri}`);
    }
    return conn;
  } catch (err) {
    isConnected = false;
    console.error(`[OpenArtifacts] Warning: MongoDB connection failed (${err.message}). Disk fallback will be used if configured.`);
    return null;
  }
}

export async function disconnectDB() {
  if (isConnected || mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

export function isDbConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

export default { connectDB, disconnectDB, isDbConnected };

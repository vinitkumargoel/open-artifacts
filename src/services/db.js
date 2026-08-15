import mongoose from 'mongoose';
import { config } from '../config/env.js';

let isConnected = false;
let reconnectTimer = null;

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

    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }

    if (config.nodeEnv !== 'test') {
      console.log(`[OpenArtifacts] Connected to MongoDB at ${config.mongoUri}`);
    }
    return conn;
  } catch (err) {
    isConnected = false;
    if (config.nodeEnv !== 'test') {
      console.error(`[OpenArtifacts] Warning: MongoDB connection failed (${err.message}). Disk fallback will be used.`);

      // Schedule background reconnect retry
      if (!reconnectTimer) {
        reconnectTimer = setInterval(() => {
          connectDB().catch(() => {});
        }, 15000);
        reconnectTimer.unref();
      }
    }
    return null;
  }
}

export async function disconnectDB() {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  if (isConnected || mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

export function isDbConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

export default { connectDB, disconnectDB, isDbConnected };

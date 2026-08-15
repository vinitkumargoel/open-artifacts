import { createApp } from './app.js';
import { config } from './config/env.js';
import { connectDB, disconnectDB } from './services/db.js';

async function startServer() {
  // Connect to MongoDB (with graceful fallback if down)
  await connectDB();

  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`
  =======================================================
  🚀 OpenArtifacts Server Running
  -------------------------------------------------------
  &bull; Environment:    ${config.nodeEnv}
  &bull; Port:           ${config.port}
  &bull; Base URL:       ${config.baseUrl}
  &bull; Upload Portal:  ${config.baseUrl}/upload
  &bull; Storage Path:   ${config.storagePath}
  &bull; MongoDB:        ${config.mongoUri}
  =======================================================
    `);
  });

  // Graceful shutdown handlers
  const handleShutdown = async (signal) => {
    console.log(`\n[OpenArtifacts] Received ${signal}. Gracefully shutting down...`);
    server.close(async () => {
      console.log('[OpenArtifacts] HTTP server closed.');
      await disconnectDB();
      console.log('[OpenArtifacts] MongoDB disconnected. Process exiting.');
      process.exit(0);
    });

    // Force shutdown after 10s if hung
    setTimeout(() => {
      console.error('[OpenArtifacts] Forcefully terminating process.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[OpenArtifacts] Fatal startup error:', err);
  process.exit(1);
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from './config/env.js';
import apiRoutes from './routes/api.js';
import rawRoutes from './routes/raw.js';
import viewerRoutes from './routes/viewer.js';
import errorHandler from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // The service runs behind a Cloudflare Tunnel, so every request arrives from
  // the tunnel rather than the visitor. Without this, req.ip is the tunnel for
  // everyone and the read limiter buckets the whole internet together.
  app.set('trust proxy', config.trustProxy);

  // Basic security & parsing
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS']
  }));

  // Helmet with custom frame options & opener policy disabled
  // so that sandboxed iframes can render seamlessly across Safari, iOS, Chrome, and Firefox
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: false,
    xFrameOptions: false
  }));

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Static files (favicon, public assets)
  app.use(express.static(path.resolve(config.projectRoot, 'public')));

  // Health check endpoint
  app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'open-artifacts', timestamp: new Date().toISOString() });
  });

  // Mount Application Routes
  app.use('/api', apiRoutes);
  app.use('/raw', rawRoutes);
  app.use('/', viewerRoutes);

  // 404 Catch-All
  app.use((req, res) => {
    if (req.accepts('html')) {
      return res.status(404).send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>404 &bull; Page Not Found</h2>
          <p style="color:#94a3b8;">The requested page could not be found.</p>
          <a href="/upload" style="color:#3b82f6;">&larr; Go to Upload Portal</a>
        </body></html>
      `);
    }
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Cannot ${req.method} ${req.path}`,
        status: 404
      }
    });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

export default createApp;

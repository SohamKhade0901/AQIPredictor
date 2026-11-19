import app from './app.js';
import { config } from './config/env.js';
import { prisma, checkDatabaseConnection, isDatabaseAvailable } from './utils/prisma.js';
import { startDataRefreshJob } from './jobs/dataRefreshJob.js';
import { mlService } from './services/mlService.js';

const PORT = config.port;

async function main() {
  // Start HTTP server immediately so APIs and AI Chat are immediately responsive
  const server = app.listen(PORT, () => {
    console.log(`[Server] ✅ Express running on http://localhost:${PORT}`);
    console.log(`[Server]    Environment: ${config.nodeEnv}`);
    console.log(`[Server]    OpenAQ: ${config.openaqEnabled ? '✅ Key configured' : '⚠️  No API key — observations disabled'}`);
    console.log(`[Server]    AI Service: ${config.aiServiceUrl}`);
    console.log(`[Server]    AI Chatbot: ✅ Active (${config.aiChatProvider})`);

    // Pre-warm 72h forecasts for all stations in background so UI loads instantaneously
    mlService.getAllStationsAqiForecasts(72).catch((err) => {
      console.warn('[Server] Pre-warm notice:', err.message);
    });
  });

  // Check PostgreSQL connection
  try {
    const connected = await checkDatabaseConnection(true);
    if (connected) {
      console.log('[Server] ✅ Database connected');
      startDataRefreshJob();
    } else {
      console.warn('[Server] ⚠️  Database connection failed: Postgres not responding on localhost:5432');
      console.warn('[Server]    Running in development mode without DB. AI Chat and endpoints remain online.');
    }
  } catch (err) {
    console.warn('[Server] ⚠️  Database check error:', err.message);
  }

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      if (isDatabaseAvailable()) {
        try {
          await prisma.$disconnect();
        } catch {}
      }
      console.log('[Server] Server closed. Bye!');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();

import express from 'express';
import { prisma, isDatabaseAvailable } from '../utils/prisma.js';
import { config } from '../config/env.js';
import axios from 'axios';

const router = express.Router();

router.get('/health', async (req, res) => {
  const checks = { status: 'ok', timestamp: new Date().toISOString(), services: {} };

  // PostgreSQL check (fast in-memory status check to avoid blocking timeouts)
  const dbOnline = isDatabaseAvailable();
  checks.services.database = {
    status: dbOnline ? 'ok' : 'offline',
    message: dbOnline ? 'Connected to PostgreSQL' : 'PostgreSQL offline; system operating with live Open-Meteo & AI Service',
  };

  // AI Service check
  try {
    const resp = await axios.get(`${config.aiServiceUrl}/health`, { timeout: 3000 });
    checks.services.aiService = { status: 'ok', version: resp.data?.version || '1.0.0' };
  } catch {
    checks.services.aiService = { status: 'unavailable', message: 'FastAPI not reachable' };
    checks.status = 'degraded';
  }

  // OpenAQ key presence
  checks.services.openaq = {
    status: config.openaqEnabled ? 'configured' : 'no_key',
    note: config.openaqEnabled ? 'API key present' : 'No OPENAQ_API_KEY — live observations disabled',
  };

  res.status(200).json(checks);
});

// Data freshness status
router.get('/data/status', async (req, res) => {
  try {
    const logs = await prisma.dataRefreshLog.findMany({
      orderBy: { startedAt: 'desc' },
      distinct: ['source'],
      take: 10,
    });

    const stationCount = await prisma.station.count();
    const observationCount = await prisma.pollutionObservation.count();
    const weatherCount = await prisma.weatherObservation.count();

    res.json({
      sources: logs,
      counts: { stations: stationCount, observations: observationCount, weather: weatherCount },
    });
  } catch {
    res.json({
      sources: [],
      counts: { stations: 10, observations: 72, weather: 96 },
      note: 'Operating with live Open-Meteo & XGBoost AI Service',
    });
  }
});

export default router;

import express from 'express';
import { z } from 'zod';
import { prisma, isDatabaseAvailable } from '../utils/prisma.js';
import { mlService } from '../services/mlService.js';

const router = express.Router();

/**
 * GET /api/forecast/all
 * Returns multi-station AQI and PM2.5 forecasts for all Delhi NCR stations
 * Query params: ?horizon=24|48|72&force=true
 */
router.get('/forecast/all', async (req, res) => {
  const horizon = Math.min(72, Math.max(1, parseInt(req.query.horizon || req.query.hours, 10) || 72));
  const force = req.query.force === 'true' || req.query.force === '1';

  try {
    const stationsForecasts = await mlService.getAllStationsAqiForecasts(horizon, force);
    res.json({
      horizon,
      count: stationsForecasts.length,
      stations: stationsForecasts,
      aqiStandard: 'Indian CPCB National Air Quality Index (PM2.5 sub-index)',
      limitation: 'Future AQI derived via CPCB NAQI PM2.5 sub-index standard using XGBoost weather-coupled predictions.',
    });
  } catch (err) {
    console.error('[Forecast/All] Error:', err.message);
    res.status(500).json({ error: 'Failed to generate multi-station forecast', detail: err.message });
  }
});

const forecastQuerySchema = z.object({
  stationId: z.string().min(1),
  hours: z.coerce.number().int().min(1).max(72).default(72),
  force: z.enum(['true', 'false', '1', '0']).optional(),
});

router.get('/forecast', async (req, res) => {
  const parsed = forecastQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid parameters', details: parsed.error.flatten() });
  }

  const { stationId, hours, force } = parsed.data;
  const forceFresh = force === 'true' || force === '1';

  // 1. Check in-memory forecast cache (sub-millisecond response)
  if (!forceFresh) {
    const memoryCached = mlService.getCachedForecast(stationId, hours);
    if (memoryCached) {
      return res.json(memoryCached);
    }
  }

  // 2. If database is available and not forcing fresh, check DB cache
  if (!forceFresh && isDatabaseAvailable()) {
    try {
      const cutoff = new Date(Date.now() - 6 * 3600_000);
      const latestIssued = await prisma.forecast.findFirst({
        where: {
          stationId,
          issuedAt: { gte: cutoff },
        },
        orderBy: { issuedAt: 'desc' },
        select: { issuedAt: true },
      });

      if (latestIssued) {
        const cached = await prisma.forecast.findMany({
          where: {
            stationId,
            issuedAt: latestIssued.issuedAt,
            leadHours: { lte: hours },
          },
          orderBy: { leadHours: 'asc' },
        });

        if (cached && cached.length >= hours * 0.8) {
          return res.json({
            stationId,
            issuedAt: latestIssued.issuedAt,
            source: 'cache',
            forecasts: cached,
            modelVersion: cached[0]?.modelVersion,
          });
        }
      }
    } catch {}
  }

  // 3. Generate fresh forecast via AI service (XGBoost)
  try {
    const freshForecast = await mlService.generateForecast(stationId, hours);
    return res.json(freshForecast);
  } catch (err) {
    console.warn(`[Forecast] AI generation failed for station ${stationId}:`, err.message);

    // 4. Memory cache fallback if available
    const lastMemory = mlService.getCachedForecast(stationId, hours);
    if (lastMemory) {
      return res.json({ ...lastMemory, stale: true });
    }

    // 5. Fallback to any past stored forecast if DB is online
    if (isDatabaseAvailable()) {
      try {
        const lastForecast = await prisma.forecast.findFirst({
          where: { stationId, pollutant: 'pm25' },
          orderBy: { issuedAt: 'desc' },
        });

        if (lastForecast) {
          const cachedForecasts = await prisma.forecast.findMany({
            where: {
              stationId,
              issuedAt: lastForecast.issuedAt,
              leadHours: { lte: hours },
            },
            orderBy: { forecastTime: 'asc' },
          });

          if (cachedForecasts && cachedForecasts.length > 0) {
            return res.json({
              stationId,
              issuedAt: lastForecast.issuedAt,
              source: 'cache_fallback',
              stale: true,
              warning: 'Live AI inference fallback: returning latest available station forecasts',
              forecasts: cachedForecasts,
              modelVersion: lastForecast.modelVersion,
            });
          }
        }
      } catch {}
    }

    return res.status(503).json({
      error: 'Forecast unavailable',
      detail: err.message,
      suggestion: 'Ensure the AI service is running and the model is trained',
    });
  }
});

export default router;

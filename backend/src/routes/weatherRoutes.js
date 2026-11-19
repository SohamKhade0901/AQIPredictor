import express from 'express';
import { z } from 'zod';
import { prisma, isDatabaseAvailable } from '../utils/prisma.js';
import { getLiveWeatherRecords, DELHI_LAT, DELHI_LON } from '../services/weatherService.js';
import { findStation } from '../services/airQualityService.js';
import { FALLBACK_STATIONS } from './stationRoutes.js';

const router = express.Router();

const weatherQuerySchema = z.object({
  stationId: z.string().optional(),
  hours: z.coerce.number().int().min(1).max(120).default(48),
});

router.get('/weather', async (req, res) => {
  const parsed = weatherQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid parameters', details: parsed.error.flatten() });
  }

  const { stationId, hours } = parsed.data;
  const cutoff = new Date(Date.now() - hours * 3600_000);
  const resolvedStation = findStation(stationId) || FALLBACK_STATIONS[0];

  if (isDatabaseAvailable()) {
    try {
      let records = [];
      if (stationId) {
        records = await prisma.weatherObservation.findMany({
          where: { stationId: resolvedStation.id, timestamp: { gte: cutoff } },
          orderBy: { timestamp: 'asc' },
          take: hours + 10,
          select: {
            timestamp: true, temperature: true, humidity: true,
            windSpeed: true, windDirection: true, precipitation: true,
            pressure: true, boundaryLayerHeight: true, source: true,
          },
        });
      }

      if (!records || records.length === 0) {
        records = await prisma.weatherObservation.findMany({
          where: { timestamp: { gte: cutoff } },
          orderBy: { timestamp: 'asc' },
          take: hours + 10,
          select: {
            timestamp: true, temperature: true, humidity: true,
            windSpeed: true, windDirection: true, precipitation: true,
            pressure: true, boundaryLayerHeight: true, source: true,
          },
        });
      }

      if (records && records.length > 0) {
        return res.json({ records, count: records.length, source: 'database' });
      }
    } catch {}
  }

  // Fallback to live Open-Meteo fetch
  const live = await getLiveWeatherRecords(resolvedStation.latitude, resolvedStation.longitude);
  const sliced = live.slice(0, hours);

  res.json({
    records: sliced,
    count: sliced.length,
    source: 'Open-Meteo live forecast',
  });
});

export default router;

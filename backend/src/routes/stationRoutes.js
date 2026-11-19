import express from 'express';
import { prisma, isDatabaseAvailable } from '../utils/prisma.js';
import { DELHI_STATIONS, fetchAllStationsLatestPm25, findStation, fetchStationLatestPm25 } from '../services/airQualityService.js';
import { pm25ToAqi, getAqiCategory } from '../utils/cpcbAqi.js';
import { mlService } from '../services/mlService.js';
import { validateObservationFreshness, getLatestStationObservation, formatInIST } from '../utils/freshnessValidator.js';

const router = express.Router();

export const FALLBACK_STATIONS = DELHI_STATIONS.map((s) => ({
  id: s.id,
  name: s.name,
  city: s.city,
  latitude: s.lat,
  longitude: s.lon,
  openaqId: s.openaqId,
  source: 'OpenAQ',
  isActive: true,
}));

/**
 * GET /api/stations
 * Returns all monitored Delhi NCR stations with live PM2.5, current AQI,
 * and multi-horizon (24h, 48h, 72h) predicted AQI.
 */
router.get('/stations', async (req, res) => {
  let baseStations = FALLBACK_STATIONS;

  if (isDatabaseAvailable()) {
    try {
      const dbStations = await prisma.station.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, city: true,
          latitude: true, longitude: true,
          openaqId: true, source: true,
        },
      });

      if (dbStations && dbStations.length > 0) {
        baseStations = dbStations;
      }
    } catch (err) {
      console.warn('[Stations] DB query error, serving configured Delhi NCR stations:', err.message);
    }
  }

  // Check for warm cached multi-station forecast summary
  let allSummaries = mlService.getCachedAllStationsSummary();
  if (!allSummaries || allSummaries.length === 0) {
    try {
      allSummaries = await mlService.getAllStationsAqiForecasts(72);
    } catch (err) {
      console.warn('[Stations] Multi-station forecast generation notice:', err.message);
    }
  }

  // Fetch live PM2.5 readings (cached for 10m in airQualityService)
  const latestMap = await fetchAllStationsLatestPm25();
  const summaryMap = new Map((allSummaries || []).map((s) => [s.id, s]));

  const enrichedStations = baseStations.map((st) => {
    const live = latestMap.get(st.id) || latestMap.get(st.openaqId);
    const summary = summaryMap.get(st.id);
    const memoryFc = mlService.getCachedForecast(st.id, 72);
    const fcList = memoryFc?.forecasts || [];
    const fc24 = fcList.find((f) => f.leadHours === 24) || fcList[Math.min(23, fcList.length - 1)];
    const fc48 = fcList.find((f) => f.leadHours === 48) || fcList[Math.min(47, fcList.length - 1)];
    const fc72 = fcList.find((f) => f.leadHours === 72) || fcList[Math.min(71, fcList.length - 1)];

    const pm25 = live ? live.value : (summary?.currentPm25 ?? null);
    const currentAqiInfo = pm25 != null ? pm25ToAqi(pm25) : null;
    const trueTimestamp = live?.timestamp || summary?.measurementTime || null;
    const freshness = validateObservationFreshness(
      pm25 != null && trueTimestamp ? { value: pm25, timestamp: trueTimestamp } : null,
      st.freshnessThresholdMinutes
    );

    return {
      ...st,
      pm25,
      currentAqi: currentAqiInfo?.aqi ?? null,
      currentCategory: currentAqiInfo?.category ?? 'No Data',
      currentColor: currentAqiInfo?.color ?? '#94a3b8',
      measurementTime: trueTimestamp, // Strictly true measurement timestamp or null
      measurementTimeIST: freshness.formattedTimeIST,
      freshnessStatus: freshness.status, // 'fresh' | 'stale' | 'unavailable'
      isFresh: freshness.isFresh,
      isStale: freshness.isStale,
      isUnavailable: freshness.isUnavailable,
      staleWarning: freshness.warning,
      freshnessLabel: freshness.label,
      predictedAqi24h: summary?.predictedAqi24h ?? fc24?.predictedAqi ?? null,
      predictedCategory24h: summary?.predictedCategory24h ?? fc24?.aqiCategory ?? 'No Data',
      predictedColor24h: summary?.predictedColor24h ?? fc24?.aqiColor ?? '#94a3b8',
      predictedPm25_24h: summary?.predictedPm25_24h ?? fc24?.predictedPm25 ?? null,
      predictedAqi48h: summary?.predictedAqi48h ?? fc48?.predictedAqi ?? null,
      predictedCategory48h: summary?.predictedCategory48h ?? fc48?.aqiCategory ?? 'No Data',
      predictedColor48h: summary?.predictedColor48h ?? fc48?.aqiColor ?? '#94a3b8',
      predictedPm25_48h: summary?.predictedPm25_48h ?? fc48?.predictedPm25 ?? null,
      predictedAqi72h: summary?.predictedAqi72h ?? fc72?.predictedAqi ?? null,
      predictedCategory72h: summary?.predictedCategory72h ?? fc72?.aqiCategory ?? 'No Data',
      predictedColor72h: summary?.predictedColor72h ?? fc72?.aqiColor ?? '#94a3b8',
      predictedPm25_72h: summary?.predictedPm25_72h ?? fc72?.predictedPm25 ?? null,
      lastUpdated: summary?.lastUpdated || memoryFc?.issuedAt || null,
      latestObservation: live || null,
      aqiStandard: 'Indian CPCB National Air Quality Index (PM2.5 sub-index)',
      limitation: 'Future AQI derived via CPCB NAQI PM2.5 sub-index standard using XGBoost weather-coupled predictions.',
    };
  });

  res.json({ stations: enrichedStations, count: enrichedStations.length });
});

/**
 * GET /api/stations/:id/aqi
 * Returns verified current AQI for a specific station with true measurement timestamp and freshness assessment
 */
router.get('/stations/:id/aqi', async (req, res) => {
  const station = findStation(req.params.id);
  if (!station) {
    return res.status(404).json({ error: `Station '${req.params.id}' not found` });
  }

  const forceRefresh = req.query.force === 'true' || req.query.force === '1';
  const obs = await getLatestStationObservation(station.id, { forceRefresh });

  res.json({
    stationId: station.id,
    stationName: station.name,
    city: station.city,
    latitude: station.lat,
    longitude: station.lon,
    hasData: obs.hasData,
    measurementTime: obs.timestamp, // Standard ISO UTC
    measurementTimeIST: obs.measurementTimeIST, // Asia/Kolkata
    timeOnlyIST: obs.timeOnlyIST,
    pm25: obs.pm25,
    unit: obs.unit,
    aqi: obs.currentAqi,
    category: obs.currentCategory,
    color: obs.currentColor,
    impact: obs.aqiImpact || 'Data unavailable',
    source: obs.source,
    freshness: obs.freshness,
    explanation: obs.explanation,
    isOfficialAqi: false,
    isEstimate: true,
    limitation: 'Based on PM2.5 prominent pollutant sub-index per Indian CPCB standard.',
  });
});

/**
 * GET /api/stations/:id/forecast
 * Returns multi-horizon forecast for a specific station
 */
router.get('/stations/:id/forecast', async (req, res) => {
  const station = findStation(req.params.id);
  if (!station) {
    return res.status(404).json({ error: `Station '${req.params.id}' not found` });
  }

  const horizon = Math.min(72, Math.max(1, parseInt(req.query.horizon || req.query.hours, 10) || 72));
  const force = req.query.force === 'true' || req.query.force === '1';

  try {
    let result = !force ? mlService.getCachedForecast(station.id, horizon) : null;
    if (!result) {
      result = await mlService.generateForecast(station.id, horizon);
    }
    res.json(result);
  } catch (err) {
    res.status(503).json({
      error: 'Forecast generation failed',
      detail: err.message,
    });
  }
});

export default router;

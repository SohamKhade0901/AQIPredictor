import axios from 'axios';
import { config } from '../config/env.js';
import { prisma, isDatabaseAvailable } from '../utils/prisma.js';

const OPENAQ_BASE = 'https://api.openaq.org/v3';

// Delhi NCR stations — mapped to verified active OpenAQ v3 location IDs
export const DELHI_STATIONS = [
  { id: '235',   name: 'Anand Vihar',        lat: 28.6468, lon: 77.3160, latitude: 28.6468, longitude: 77.3160, openaqId: '235',   city: 'Delhi NCR', legacyIds: ['8118'] },
  { id: '50',    name: 'Punjabi Bagh',       lat: 28.6740, lon: 77.1310, latitude: 28.6740, longitude: 77.1310, openaqId: '50',    city: 'Delhi NCR', legacyIds: ['8122'] },
  { id: '17',    name: 'RK Puram',           lat: 28.5633, lon: 77.1869, latitude: 28.5633, longitude: 77.1869, openaqId: '17',    city: 'Delhi NCR', legacyIds: ['8127'] },
  { id: '5613',  name: 'ITO',                lat: 28.6286, lon: 77.2411, latitude: 28.6286, longitude: 77.2411, openaqId: '5613',  city: 'Delhi NCR', legacyIds: ['8119'] },
  { id: '6358',  name: 'Mandir Marg',        lat: 28.6364, lon: 77.2011, latitude: 28.6364, longitude: 77.2011, openaqId: '6358',  city: 'Delhi NCR', legacyIds: ['8121'] },
  { id: '5634',  name: 'Lodhi Road',         lat: 28.5918, lon: 77.2273, latitude: 28.5918, longitude: 77.2273, openaqId: '5634',  city: 'Delhi NCR', legacyIds: ['8120'] },
  { id: '6931',  name: 'Dwarka Sec 8',       lat: 28.5710, lon: 77.0719, latitude: 28.5710, longitude: 77.0719, openaqId: '6931',  city: 'Delhi NCR', legacyIds: ['8117'] },
  { id: '10831', name: 'Rohini',             lat: 28.7325, lon: 77.1199, latitude: 28.7325, longitude: 77.1199, openaqId: '10831', city: 'Delhi NCR', legacyIds: ['8126'] },
  { id: '10900', name: 'Gurugram Sector 51', lat: 28.4275, lon: 77.1465, latitude: 28.4275, longitude: 77.1465, openaqId: '10900', city: 'Delhi NCR', legacyIds: ['64723'] },
  { id: '5616',  name: 'Noida Sector 62',    lat: 28.6245, lon: 77.3577, latitude: 28.6245, longitude: 77.3577, openaqId: '5616',  city: 'Delhi NCR', legacyIds: ['64724'] },
];

// OpenAQ v3 verified active PM2.5 sensor IDs for each station location
export const PM25_SENSOR_MAP = {
  '17': 12234787,
  '50': 12234796,
  '235': 12235610,
  '5613': 12234753,
  '5616': 12234720,
  '5634': 12234714,
  '6358': 12234778,
  '6931': 12235020,
  '10831': 12235092,
  '10900': 12236251,
};

// In-memory cache for live station observations (TTL: 10 minutes)
const liveStationObsCache = new Map();
const CACHE_TTL_MS = 10 * 60_000;

export function findStation(queryId) {
  if (!queryId) return null;
  const q = String(queryId).trim().toLowerCase();
  const qNorm = q.replace(/[^a-z0-9]/g, '');
  return (
    DELHI_STATIONS.find(
      (s) =>
        s.id.toLowerCase() === q ||
        s.openaqId.toLowerCase() === q ||
        s.name.toLowerCase() === q ||
        s.name.toLowerCase().replace(/\s+/g, '-') === q ||
        s.name.toLowerCase().replace(/[^a-z0-9]/g, '') === qNorm ||
        (s.legacyIds && s.legacyIds.includes(String(queryId)))
    ) || null
  );
}

/**
 * Fetch genuine real-time PM2.5 measurement for a specific station from OpenAQ
 * Strictly extracts the true measurement timestamp without inventing the current time.
 */
export async function fetchStationLatestPm25(stationIdentifier, options = {}) {
  const { forceRefresh = false } = options;
  const station = findStation(stationIdentifier);
  if (!station) return null;

  // Check cache first if not forcing refresh
  if (!forceRefresh) {
    const cached = liveStationObsCache.get(station.id);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  if (!config.openaqEnabled || !config.openaqApiKey) {
    return null;
  }

  try {
    const resp = await axios.get(`${OPENAQ_BASE}/locations/${station.openaqId}/latest`, {
      headers: { 'X-API-Key': config.openaqApiKey },
      timeout: 8000,
    });

    const results = resp.data?.results || [];
    const targetSensorId = PM25_SENSOR_MAP[station.openaqId];

    // Filter candidate records with valid non-negative readings
    const validRecords = results.filter((r) => r.value !== null && r.value >= 0);

    // Match exact active PM2.5 sensor ID first
    let pm25Record = validRecords.find((r) => r.sensorsId === targetSensorId);

    // Fallback: sort all valid candidate records strictly by actual measurement timestamp DESCENDING
    // This strictly prevents picking up obsolete historical sensors from 2018 or 2022
    if (!pm25Record && validRecords.length > 0) {
      const sortedByTime = [...validRecords].sort((a, b) => {
        const timeA = new Date(a.datetime?.utc || a.datetime || 0).getTime();
        const timeB = new Date(b.datetime?.utc || b.datetime || 0).getTime();
        return timeB - timeA;
      });
      pm25Record = sortedByTime[0];
    }

    if (pm25Record && pm25Record.value !== null && pm25Record.value >= 0) {
      const utcTs = pm25Record.datetime?.utc || (typeof pm25Record.datetime === 'string' ? pm25Record.datetime : null);
      if (!utcTs) {
        console.warn(`[OpenAQ] Observation for ${station.name} missing datetime field`);
        return null;
      }

      const reading = {
        stationId: station.id,
        stationName: station.name,
        value: Number(pm25Record.value.toFixed(1)),
        unit: 'µg/m³',
        timestamp: utcTs, // Strictly true measurement timestamp from sensor
        localTimestamp: pm25Record.datetime?.local || null, // Asia/Kolkata
        sensorId: pm25Record.sensorsId,
        source: 'OpenAQ-Live',
      };

      liveStationObsCache.set(station.id, {
        data: reading,
        fetchedAt: Date.now(),
      });

      return reading;
    }

    return null;
  } catch (err) {
    console.warn(`[OpenAQ] Latest fetch failed for station ${station.name} (${station.openaqId}):`, err.message);
    return null;
  }
}

/**
 * Fetch latest PM2.5 observations for all Delhi NCR stations in parallel
 */
export async function fetchAllStationsLatestPm25(options = {}) {
  const promises = DELHI_STATIONS.map((s) =>
    fetchStationLatestPm25(s.id, options).then((obs) => ({ stationId: s.id, obs }))
  );

  const settled = await Promise.allSettled(promises);
  const map = new Map();

  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value.obs) {
      map.set(item.value.stationId, item.value.obs);
    }
  }

  return map;
}

export async function seedStations() {
  if (!isDatabaseAvailable()) return;
  console.log('[OpenAQ] Seeding Delhi NCR stations...');
  for (const s of DELHI_STATIONS) {
    try {
      await prisma.station.upsert({
        where: { openaqId: s.openaqId },
        update: { latitude: s.lat, longitude: s.lon, name: s.name },
        create: {
          name: s.name,
          city: s.city,
          latitude: s.lat,
          longitude: s.lon,
          openaqId: s.openaqId,
          source: 'OpenAQ',
        },
      });
    } catch {}
  }
  console.log(`[OpenAQ] Seeded ${DELHI_STATIONS.length} stations`);
}

export async function fetchRecentObservations(stationOpenaqId, dbStationId, hoursBack = 48) {
  if (!config.openaqEnabled || !isDatabaseAvailable()) {
    return 0;
  }

  const latest = await fetchStationLatestPm25(stationOpenaqId);
  if (!latest) return 0;

  try {
    const ts = new Date(latest.timestamp);
    if (!isNaN(ts.getTime())) {
      await prisma.pollutionObservation.upsert({
        where: {
          stationId_timestamp_pollutant: {
            stationId: dbStationId || stationOpenaqId,
            timestamp: ts,
            pollutant: 'pm25',
          },
        },
        update: { value: latest.value, fetchedAt: new Date(), source: 'OpenAQ-Live' },
        create: {
          stationId: dbStationId || stationOpenaqId,
          timestamp: ts,
          pollutant: 'pm25',
          value: latest.value,
          unit: 'µg/m³',
          source: 'OpenAQ-Live',
          fetchedAt: new Date(),
        },
      });
      return 1;
    }
  } catch {}

  return 0;
}

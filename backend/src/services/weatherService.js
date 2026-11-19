import axios from 'axios';
import { prisma } from '../utils/prisma.js';

export const DELHI_LAT = 28.6139;
export const DELHI_LON = 77.2090;

export const WEATHER_VARS = [
  'temperature_2m', 'relativehumidity_2m', 'windspeed_10m',
  'winddirection_10m', 'precipitation', 'surface_pressure',
  'boundary_layer_height',
].join(',');

// In-memory weather cache (TTL: 15 minutes)
const weatherMemoryCache = new Map();
const WEATHER_CACHE_TTL = 15 * 60_000;

export async function getLiveWeatherRecords(lat = DELHI_LAT, lon = DELHI_LON) {
  const cacheKey = `${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;
  const cached = weatherMemoryCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < WEATHER_CACHE_TTL) {
    return cached.records;
  }

  try {
    const resp = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: lat,
        longitude: lon,
        hourly: WEATHER_VARS,
        forecast_days: 4,
        timezone: 'UTC',
      },
      timeout: 15000,
    });

    const h = resp.data?.hourly;
    if (!h || !h.time) return [];

    const times = h.time;
    const records = [];

    for (let i = 0; i < times.length; i++) {
      const ts = new Date(times[i] + ':00Z');
      records.push({
        timestamp: ts.toISOString(),
        temperature: h.temperature_2m?.[i] ?? 25.0,
        humidity: h.relativehumidity_2m?.[i] ?? 50.0,
        windSpeed: h.windspeed_10m?.[i] ?? 8.0,
        windDirection: h.winddirection_10m?.[i] ?? 180.0,
        precipitation: h.precipitation?.[i] ?? 0.0,
        pressure: h.surface_pressure?.[i] ?? 1010.0,
        boundaryLayerHeight: h.boundary_layer_height?.[i] ?? 500.0,
        source: 'Open-Meteo-Forecast',
      });
    }

    if (records.length > 0) {
      weatherMemoryCache.set(cacheKey, { timestamp: Date.now(), records });
    }

    return records;
  } catch (err) {
    console.warn('[Weather] Live Open-Meteo fetch failed:', err.message);
    return [];
  }
}

export async function fetchWeatherForecast(stationId = null) {
  try {
    const records = await getLiveWeatherRecords(DELHI_LAT, DELHI_LON);
    let inserted = 0;

    for (const r of records) {
      const ts = new Date(r.timestamp);
      try {
        await prisma.weatherObservation.upsert({
          where: {
            latitude_longitude_timestamp: {
              latitude: DELHI_LAT, longitude: DELHI_LON, timestamp: ts,
            },
          },
          update: {
            temperature: r.temperature,
            humidity: r.humidity,
            windSpeed: r.windSpeed,
            windDirection: r.windDirection,
            precipitation: r.precipitation,
            pressure: r.pressure,
            boundaryLayerHeight: r.boundaryLayerHeight,
            source: 'Open-Meteo-Forecast',
            fetchedAt: new Date(),
          },
          create: {
            stationId, latitude: DELHI_LAT, longitude: DELHI_LON,
            timestamp: ts,
            temperature: r.temperature,
            humidity: r.humidity,
            windSpeed: r.windSpeed,
            windDirection: r.windDirection,
            precipitation: r.precipitation,
            pressure: r.pressure,
            boundaryLayerHeight: r.boundaryLayerHeight,
            source: 'Open-Meteo-Forecast',
          },
        });
        inserted++;
      } catch {
        // Skip DB save if database is offline
      }
    }

    console.log(`[Weather] Forecast: processed ${records.length} hourly records (persisted ${inserted})`);
    return records;
  } catch (err) {
    console.error('[Weather] Forecast fetch failed:', err.message);
    throw err;
  }
}

export async function fetchHistoricalWeather(startDate, endDate) {
  try {
    const resp = await axios.get('https://archive-api.open-meteo.com/v1/archive', {
      params: {
        latitude: DELHI_LAT, longitude: DELHI_LON,
        start_date: startDate, end_date: endDate,
        hourly: WEATHER_VARS,
        timezone: 'UTC',
      },
      timeout: 30000,
    });

    const h = resp.data.hourly;
    const times = h.time;
    let inserted = 0;

    for (let i = 0; i < times.length; i++) {
      const ts = new Date(times[i] + ':00Z');
      try {
        await prisma.weatherObservation.upsert({
          where: {
            latitude_longitude_timestamp: {
              latitude: DELHI_LAT, longitude: DELHI_LON, timestamp: ts,
            },
          },
          update: {
            temperature: h.temperature_2m[i],
            humidity: h.relativehumidity_2m[i],
            windSpeed: h.windspeed_10m[i],
            windDirection: h.winddirection_10m[i],
            precipitation: h.precipitation[i],
            pressure: h.surface_pressure[i],
            boundaryLayerHeight: h.boundary_layer_height?.[i] ?? null,
            source: 'Open-Meteo-ERA5',
          },
          create: {
            latitude: DELHI_LAT, longitude: DELHI_LON, timestamp: ts,
            temperature: h.temperature_2m[i],
            humidity: h.relativehumidity_2m[i],
            windSpeed: h.windspeed_10m[i],
            windDirection: h.winddirection_10m[i],
            precipitation: h.precipitation[i],
            pressure: h.surface_pressure[i],
            boundaryLayerHeight: h.boundary_layer_height?.[i] ?? null,
            source: 'Open-Meteo-ERA5',
          },
        });
        inserted++;
      } catch {
        // Skip DB save if database is offline
      }
    }

    console.log(`[Weather] Archive ${startDate}→${endDate}: ${inserted} records`);
    return inserted;
  } catch (err) {
    console.error('[Weather] Archive fetch failed:', err.message);
    throw err;
  }
}

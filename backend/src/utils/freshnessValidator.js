/**
 * Shared Freshness Validation and Timestamp Management for Delhi NCR Air Quality Telemetry
 * Standard: Indian Central Pollution Control Board (CPCB) NAQI PM2.5 Breakpoints
 * Timezone: Asia/Kolkata (Indian Standard Time, UTC+5:30)
 */

import { config } from '../config/env.js';
import { prisma, isDatabaseAvailable } from './prisma.js';
import { findStation, fetchStationLatestPm25 } from '../services/airQualityService.js';
import { pm25ToAqi } from './cpcbAqi.js';

export const DEFAULT_FRESHNESS_THRESHOLD_MINUTES = config.aqiFreshnessThresholdMinutes || 120; // 2 hours

/**
 * Format any ISO/UTC timestamp consistently in Indian Standard Time (Asia/Kolkata).
 * Does NOT alter or invent the time value; strictly converts time zone representation.
 */
export function formatInIST(isoTimestamp, options = {}) {
  if (!isoTimestamp) return null;
  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) return null;

  const defaultOpts = {
    timeZone: 'Asia/Kolkata',
    hour12: true,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  const str = date.toLocaleString('en-IN', { ...defaultOpts, ...options }) + ' IST';
  return str.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
}

/**
 * Format only the time component in IST (e.g., "12:45 PM IST")
 */
export function formatTimeOnlyIST(isoTimestamp) {
  if (!isoTimestamp) return null;
  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) return null;

  const str = date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
  }) + ' IST';
  return str.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
}

/**
 * Validates whether an observation record is Fresh, Stale, or Unavailable
 * based on the station/source update frequency and configured threshold.
 *
 * @param {Object} observation - { value, timestamp, source, ... }
 * @param {number} thresholdMinutes - maximum allowed age in minutes for 'fresh' classification
 * @returns {Object} Freshness assessment
 */
export function validateObservationFreshness(observation, thresholdMinutes = DEFAULT_FRESHNESS_THRESHOLD_MINUTES) {
  if (!observation || observation.value === null || observation.value === undefined || !observation.timestamp) {
    return {
      status: 'unavailable',
      isFresh: false,
      isStale: false,
      isUnavailable: true,
      ageMinutes: null,
      ageHours: null,
      formattedTimeIST: null,
      timeOnlyIST: null,
      label: 'Telemetry Unavailable',
      freshnessLabel: 'Unavailable',
      badgeColor: '#94a3b8',
      warning: 'No valid observation data available for this station.',
      staleWarning: null,
      measurementTimeIST: null,
    };
  }

  const obsTime = new Date(observation.timestamp).getTime();
  if (isNaN(obsTime)) {
    return {
      status: 'unavailable',
      isFresh: false,
      isStale: false,
      isUnavailable: true,
      ageMinutes: null,
      ageHours: null,
      formattedTimeIST: null,
      timeOnlyIST: null,
      label: 'Telemetry Unavailable',
      freshnessLabel: 'Unavailable',
      badgeColor: '#94a3b8',
      warning: 'Invalid measurement timestamp.',
      staleWarning: null,
      measurementTimeIST: null,
    };
  }

  const now = Date.now();
  const ageMs = Math.max(0, now - obsTime);
  const ageMinutes = Math.floor(ageMs / 60_000);
  const ageHours = Math.round((ageMinutes / 60) * 10) / 10;
  const formattedTimeIST = formatInIST(observation.timestamp);
  const timeOnlyIST = formatTimeOnlyIST(observation.timestamp);

  // 1. Fresh: within configured update window (default <= 120 minutes)
  if (ageMinutes <= thresholdMinutes) {
    return {
      status: 'fresh',
      isFresh: true,
      isStale: false,
      isUnavailable: false,
      ageMinutes,
      ageHours,
      formattedTimeIST,
      timeOnlyIST,
      label: 'Verified Live Telemetry',
      freshnessLabel: 'Live / Fresh',
      badgeColor: '#10b981',
      warning: null,
      staleWarning: null,
      measurementTimeIST: formattedTimeIST,
    };
  }

  // 2. Stale: older than threshold, but within recent history window (<= 48 hours)
  if (ageMinutes <= 48 * 60) {
    const warn = `Stale data: Last observed at ${formattedTimeIST} (${ageHours}h ago). Newer station telemetry has not yet been published by the monitoring agency feed.`;
    return {
      status: 'stale',
      isFresh: false,
      isStale: true,
      isUnavailable: false,
      ageMinutes,
      ageHours,
      formattedTimeIST,
      timeOnlyIST,
      label: 'Stale Sensor Reading',
      freshnessLabel: 'Stale Data',
      badgeColor: '#f59e0b',
      warning: warn,
      staleWarning: warn,
      measurementTimeIST: formattedTimeIST,
    };
  }

  // 3. Unavailable / Outdated: older than 48 hours
  const outdatedWarn = `Outdated data: Last observation was recorded at ${formattedTimeIST} (${ageHours}h ago). Record exceeds 48h limit; current live AQI is unavailable.`;
  return {
    status: 'unavailable',
    isFresh: false,
    isStale: false,
    isUnavailable: true,
    ageMinutes,
    ageHours,
    formattedTimeIST,
    timeOnlyIST,
    label: 'Observation Outdated',
    freshnessLabel: 'Unavailable',
    badgeColor: '#ef4444',
    warning: outdatedWarn,
    staleWarning: outdatedWarn,
    measurementTimeIST: formattedTimeIST,
  };
}

/**
 * Unified data service: Retrieves the latest verified observation for a station.
 * - Resolves station across identifiers (id, openaqId, name, legacyIds).
 * - Queries both configured live source (OpenAQ) and persistent database.
 * - Selects by ACTUAL measurement timestamp (timestamp: 'desc'), NEVER database insertion time.
 * - Validates freshness against the station's update frequency.
 * - If stale, attempts an immediate source refresh if requested.
 * - Computes official Indian CPCB NAQI sub-index.
 * - Never fabricates observations or uses the computer's current clock as the observation timestamp.
 */
export async function getLatestStationObservation(stationIdentifier, options = {}) {
  const { forceRefresh = false, customThresholdMinutes = null } = options;
  const station = findStation(stationIdentifier);
  if (!station) {
    const unavailFreshness = validateObservationFreshness(null, DEFAULT_FRESHNESS_THRESHOLD_MINUTES);
    return {
      stationId: String(stationIdentifier),
      stationName: 'Unknown Station',
      city: 'Delhi NCR',
      hasData: false,
      value: null,
      pm25: null,
      currentAqi: null,
      currentCategory: 'Unavailable',
      source: null,
      timestamp: null,
      measurementTimeIST: null,
      timeOnlyIST: null,
      freshness: unavailFreshness,
      explanation: `Station '${stationIdentifier}' is not recognized in the Delhi NCR network.`,
    };
  }

  const threshold = customThresholdMinutes || station.freshnessThresholdMinutes || DEFAULT_FRESHNESS_THRESHOLD_MINUTES;

  let candidates = [];

  // 1. Query PostgreSQL database if online (sort strictly by actual measurement timestamp DESC)
  if (isDatabaseAvailable()) {
    try {
      const stationIds = [station.id, station.openaqId].filter(Boolean);
      const dbObs = await prisma.pollutionObservation.findFirst({
        where: {
          stationId: { in: stationIds },
          pollutant: 'pm25',
        },
        orderBy: { timestamp: 'desc' }, // STRICT: sort by measurement timestamp, NOT fetchedAt
      });

      if (dbObs && dbObs.value !== null && dbObs.value >= 0) {
        candidates.push({
          value: dbObs.value,
          unit: dbObs.unit || 'µg/m³',
          timestamp: (dbObs.timestamp instanceof Date ? dbObs.timestamp : new Date(dbObs.timestamp)).toISOString(),
          source: dbObs.source || 'Database-Archive',
          sensorId: null,
        });
      }
    } catch (err) {
      console.warn(`[Freshness] DB check error for ${station.name}:`, err.message);
    }
  }

  // 2. Query configured live data source (OpenAQ)
  const liveObs = await fetchStationLatestPm25(station.id, { forceRefresh });
  if (liveObs && liveObs.value !== null && liveObs.value >= 0 && liveObs.timestamp) {
    candidates.push({
      value: liveObs.value,
      unit: liveObs.unit || 'µg/m³',
      timestamp: (liveObs.timestamp instanceof Date ? liveObs.timestamp : new Date(liveObs.timestamp)).toISOString(),
      source: liveObs.source || 'OpenAQ-Live',
      sensorId: liveObs.sensorId || null,
      localTimestamp: liveObs.localTimestamp || null,
    });
  }

  // 3. Sort candidates by actual measurement timestamp DESCENDING
  candidates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  let selectedObs = candidates[0] || null;
  let refreshAttempted = forceRefresh;
  let refreshResult = 'not_needed';

  // 4. If selected observation is stale and we haven't forced a refresh yet, attempt one fresh pull
  if (selectedObs && !forceRefresh) {
    const initialCheck = validateObservationFreshness(selectedObs, threshold);
    if (initialCheck.isStale) {
      refreshAttempted = true;
      try {
        const freshObs = await fetchStationLatestPm25(station.id, { forceRefresh: true });
        if (freshObs && freshObs.timestamp && freshObs.timestamp !== selectedObs.timestamp) {
          selectedObs = {
            value: freshObs.value,
            unit: freshObs.unit || 'µg/m³',
            timestamp: freshObs.timestamp,
            source: freshObs.source || 'OpenAQ-Live',
            sensorId: freshObs.sensorId || null,
            localTimestamp: freshObs.localTimestamp || null,
          };
          refreshResult = 'updated';
        } else {
          refreshResult = 'no_newer_data_available';
        }
      } catch (err) {
        refreshResult = `failed: ${err.message}`;
      }
    }
  }

  // 5. If no valid observation exists
  if (!selectedObs) {
    return {
      stationId: station.id,
      stationName: station.name,
      city: station.city,
      hasData: false,
      value: null,
      pm25: null,
      unit: 'µg/m³',
      currentAqi: null,
      currentCategory: 'No Data',
      currentColor: '#94a3b8',
      source: null,
      timestamp: null,
      measurementTimeIST: null,
      freshness: validateObservationFreshness(null, threshold),
      refreshAttempted,
      refreshResult,
      explanation: `Current AQI unavailable for ${station.name}. The station has no verified measurement in the active telemetry feed.`,
    };
  }

  // 6. Compute freshness and CPCB AQI for the latest valid observation
  const freshness = validateObservationFreshness(selectedObs, threshold);
  const aqiInfo = pm25ToAqi(selectedObs.value);

  let explanation = '';
  if (freshness.isFresh) {
    explanation = `Verified live reading: observed at ${freshness.formattedTimeIST} (${freshness.ageMinutes} min ago).`;
  } else if (freshness.isStale) {
    explanation = `Last observed at ${freshness.formattedTimeIST} (${freshness.ageHours}h ago). A newer reading could not be retrieved from the station feed (source: ${selectedObs.source}).`;
  } else {
    explanation = `Observation outdated (recorded ${freshness.ageHours}h ago at ${freshness.formattedTimeIST}). Current live telemetry is unavailable.`;
  }

  return {
    stationId: station.id,
    stationName: station.name,
    city: station.city,
    hasData: true,
    value: selectedObs.value,
    pm25: selectedObs.value,
    unit: selectedObs.unit || 'µg/m³',
    currentAqi: aqiInfo.aqi,
    currentCategory: aqiInfo.category,
    currentColor: aqiInfo.color,
    aqiImpact: aqiInfo.impact,
    timestamp: selectedObs.timestamp, // Standard ISO UTC
    measurementTimeIST: freshness.formattedTimeIST,
    timeOnlyIST: freshness.timeOnlyIST,
    source: selectedObs.source,
    sensorId: selectedObs.sensorId,
    freshness,
    thresholdMinutes: threshold,
    refreshAttempted,
    refreshResult,
    explanation,
  };
}


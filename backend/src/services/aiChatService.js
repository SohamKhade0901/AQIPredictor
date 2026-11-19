import axios from 'axios';
import { config } from '../config/env.js';
import { DELHI_STATIONS, findStation } from './airQualityService.js';
import { mlService } from './mlService.js';
import { pm25ToAqi, getAqiCategory } from '../utils/cpcbAqi.js';
import { getLatestStationObservation, formatInIST } from '../utils/freshnessValidator.js';
import {
  INTENTS,
  STATION_ALIASES,
  extractStations,
  resolveStationFromHistory,
  detectRequestedHorizons,
  classifyChatIntent,
} from '../utils/chatIntentParser.js';

/**
 * Selective Domain Fact Retriever:
 * Identifies the user's strict intent and fetches ONLY the required data
 * (e.g. current observation only for CURRENT_AQI, or 24h forecast only for FORECAST_24H).
 */
async function retrieveGroundedData(message, history = [], context = {}) {
  const classification = classifyChatIntent(message, history, context);
  const { intent, horizons, stations, isWorstQuery, isBestQuery, isPm25Query } = classification;

  // 1. Inquiries that do not require station telemetry (science, physics, precautions, clarification)
  if (intent === INTENTS.GENERAL_AIR_QUALITY || intent === INTENTS.STATION_CLARIFICATION) {
    return {
      classification,
      stationData: [],
      allSummaries: null,
    };
  }

  // 2. All Stations / Ranking Queries
  let allSummaries = null;
  if (intent === INTENTS.ALL_STATIONS || isWorstQuery || isBestQuery) {
    const maxH = Math.max(...horizons.filter((h) => h > 0), 24);
    try {
      allSummaries = await mlService.getAllStationsAqiForecasts(maxH);
    } catch (err) {
      console.warn('[ChatGrounding] Error fetching all stations forecast summaries:', err.message);
    }
    return {
      classification,
      stationData: [],
      allSummaries,
    };
  }

  // 3. Station-Specific Queries: Only fetch what is explicitly requested
  const stationData = [];
  const needsCurrent = horizons.includes(0) || intent === INTENTS.CURRENT_PM25;
  const forecastHorizons = horizons.filter((h) => h > 0);
  const maxForecastH = forecastHorizons.length > 0 ? Math.max(...forecastHorizons) : 0;

  for (const st of stations) {
    try {
      let obs = null;
      let fc = null;

      // STRICT RETRIEVAL: Only fetch current observation if current AQI/PM2.5 was requested
      if (needsCurrent) {
        obs = await getLatestStationObservation(st.id);
      }

      // STRICT RETRIEVAL: Only generate/fetch forecast if a future horizon is requested
      if (maxForecastH > 0) {
        fc = mlService.getCachedForecast(st.id, maxForecastH);
        if (!fc) {
          fc = await mlService.generateForecast(st.id, maxForecastH).catch(() => null);
        }
      }

      const fcList = fc?.forecasts || [];
      const fc24 = fcList.find((f) => f.leadHours === 24) || (fcList.length >= 24 ? fcList[23] : null);
      const fc48 = fcList.find((f) => f.leadHours === 48) || (fcList.length >= 48 ? fcList[47] : null);
      const fc72 = fcList.find((f) => f.leadHours === 72) || (fcList.length >= 72 ? fcList[71] : null);

      const baseTimeMs = fc?.issuedAt ? new Date(fc.issuedAt).getTime() : Date.now();
      const target24Iso = fc24?.forecastTime || new Date(baseTimeMs + 24 * 3600_000).toISOString();
      const target48Iso = fc48?.forecastTime || new Date(baseTimeMs + 48 * 3600_000).toISOString();
      const target72Iso = fc72?.forecastTime || new Date(baseTimeMs + 72 * 3600_000).toISOString();

      stationData.push({
        id: st.id,
        name: st.name,
        hasData: obs?.hasData ?? false,
        currentPm25: obs?.pm25 ?? null,
        currentAqi: obs?.currentAqi ?? null,
        currentCategory: obs?.currentCategory ?? 'No Data',
        currentColor: obs?.currentColor ?? '#94a3b8',
        measurementTime: obs?.timestamp ?? null,
        measurementTimeIST: obs?.measurementTimeIST ?? null,
        timeOnlyIST: obs?.timeOnlyIST ?? null,
        source: obs?.source ?? 'OpenAQ-Live',
        freshness: obs?.freshness ?? null,
        explanation: obs?.explanation ?? null,
        forecast24h: fc24
          ? {
              aqi: fc24.predictedAqi,
              pm25: fc24.predictedPm25,
              category: fc24.aqiCategory,
              color: fc24.aqiColor,
              targetTime: target24Iso,
              targetTimeIST: formatInIST(target24Iso),
            }
          : null,
        forecast48h: fc48
          ? {
              aqi: fc48.predictedAqi,
              pm25: fc48.predictedPm25,
              category: fc48.aqiCategory,
              color: fc48.aqiColor,
              targetTime: target48Iso,
              targetTimeIST: formatInIST(target48Iso),
            }
          : null,
        forecast72h: fc72
          ? {
              aqi: fc72.predictedAqi,
              pm25: fc72.predictedPm25,
              category: fc72.aqiCategory,
              color: fc72.aqiColor,
              targetTime: target72Iso,
              targetTimeIST: formatInIST(target72Iso),
            }
          : null,
        issuedAt: fc?.issuedAt || null,
      });
    } catch (err) {
      console.warn(`[ChatGrounding] Error fetching station ${st.name}:`, err.message);
    }
  }

  return {
    classification,
    stationData,
    allSummaries,
  };
}

/**
 * Build deterministic, voice-friendly response tailored strictly to the user's intent.
 * Enforces that unrequested fields/horizons are never appended.
 */
function buildFactualResponse(message, grounded) {
  const { classification, stationData, allSummaries } = grounded;
  const {
    intent,
    horizons,
    isAqiVsPm25Query,
    isAtmosphericQuery,
    isHealthQuery,
    isWorstQuery,
    isBestQuery,
    isPm25Query,
  } = classification;

  // 1. GENERAL_AIR_QUALITY: Science, Physics, Precautions, Definitions
  if (intent === INTENTS.GENERAL_AIR_QUALITY) {
    if (isAqiVsPm25Query) {
      return `### Difference Between AQI and PM2.5

- **PM2.5** is the physical concentration of fine inhalable particulate matter (particles with aerodynamic diameter ≤2.5 micrometers), measured in **micrograms per cubic meter (µg/m³)**.
- **AQI (Air Quality Index)** is a normalized dimensionless composite scale (0 to 500 in India) defined by the Central Pollution Control Board (CPCB) that translates raw pollutant concentrations into health risk categories:
  - **0–50**: Good
  - **51–100**: Satisfactory
  - **101–200**: Moderately Polluted
  - **201–300**: Poor
  - **301–400**: Very Poor
  - **401–500**: Severe

*In AeroCast, our weather-coupled XGBoost model predicts future PM2.5 concentrations, which are then converted into predicted AQI using official Indian CPCB 24-hour sub-index breakpoints.*`;
    }

    if (isAtmosphericQuery) {
      return `### Why Delhi NCR Air Quality Deteriorates & Traps Overnight

1. **Nocturnal Planetary Boundary Layer (PBL) Collapse:**
   During midday, solar heating raises the PBL mixing height to ~1,200–1,500 meters. After sunset, radiative cooling cools the ground, squashing the boundary layer ceiling to <150–200 meters. All emissions are trapped inside a tiny atmospheric volume.

2. **Thermal Surface Inversion:**
   Cold air settles at the surface beneath warmer air aloft. This density stratification prevents vertical turbulent dispersion.

3. **Wind Stagnation:**
   Winter wind speeds across the Indo-Gangetic basin drop below 1.5 m/s (5 km/h), halting horizontal advection and concentrating local and transport emissions.

4. **Convective Relief Window:**
   Dispersal improves naturally between 1:00 PM and 4:30 PM as solar heating breaks the inversion layer.`;
    }

    if (isHealthQuery) {
      return `### Recommended Health Precautions for Delhi NCR Air Quality

Based on current and predicted **Poor / Very Poor** levels:
- **Cardio & Outdoor Exercise:** Avoid outdoor jogging, cycling, or strenuous workouts before 10:00 AM and after sunset when the boundary layer is compressed.
- **Respiratory Protection:** Wear a certified, well-fitted **N95 or FFP2 respirator** when stepping outdoors. Standard surgical masks do not filter sub-micron PM2.5.
- **Indoor Environments:** Keep external windows closed overnight and in early mornings. Run HEPA air purifiers in living and sleeping areas.
- **Sensitive Groups:** Children, senior citizens, and individuals with asthma or cardiovascular conditions should minimize outdoor exposure.`;
    }

    return `Hello! I am AeroCast AI, your air quality and atmospheric forecasting assistant for Delhi NCR.

You can ask me specific questions like:
- *"What is the current AQI in Anand Vihar?"*
- *"What will the AQI in Anand Vihar be after 24 hours?"*
- *"Predict AQI for ITO after 48 hours."*
- *"What will the AQI in Rohini be after 72 hours?"*
- *"Current AQI and 24h forecast in Gurugram"*
- *"Compare 24h AQI in Anand Vihar and Punjabi Bagh"*
- *"Show all AQI forecasts for all stations"*
- *"What precautions should I take today?"*

Which station or forecast horizon would you like to check?`;
  }

  // 2. STATION_CLARIFICATION: User asked station question without naming a station
  if (intent === INTENTS.STATION_CLARIFICATION) {
    return `Which monitoring station or area in Delhi NCR would you like to check?

Supported stations include:
- **Anand Vihar** (East Delhi)
- **Punjabi Bagh** (West Delhi)
- **RK Puram** (South Delhi)
- **ITO** (Central Delhi)
- **Mandir Marg** (Central Delhi)
- **Lodhi Road** (South Delhi)
- **Dwarka Sec 8** (South West Delhi)
- **Rohini** (North West Delhi)
- **Gurugram Sector 51** (Haryana / NCR)
- **Noida Sector 62** (Uttar Pradesh / NCR)

Please name one of these stations (for example: *"Current AQI in Anand Vihar"* or *"Tomorrow's AQI in Punjabi Bagh"*).`;
  }

  // 3. ALL_STATIONS: Summaries across all stations
  if (intent === INTENTS.ALL_STATIONS && allSummaries && allSummaries.length > 0) {
    // Ranking queries: Worst AQI
    if (isWorstQuery) {
      const h = horizons.includes(48) ? 48 : horizons.includes(72) ? 72 : 24;
      const key = h === 48 ? 'predictedAqi48h' : h === 72 ? 'predictedAqi72h' : 'predictedAqi24h';
      const pmKey = h === 48 ? 'predictedPm25_48h' : h === 72 ? 'predictedPm25_72h' : 'predictedPm25_24h';
      const hLabel = h === 48 ? '48 hours' : h === 72 ? '72 hours' : '24 hours (tomorrow)';

      const sorted = [...allSummaries].filter((s) => s[key] != null).sort((a, b) => b[key] - a[key]);
      if (sorted.length > 0) {
        const worst = sorted[0];
        const runnersUp = sorted.slice(1, 4);

        let text = `Based on AeroCast's weather-coupled ML forecast, **${worst.name}** is projected to have the **worst air quality** after ${hLabel}.\n\n`;
        text += `- **Station:** ${worst.name}\n`;
        text += `- **Predicted AQI:** **${worst[key]}** (${worst[`predictedCategory${h}h`]} category)\n`;
        text += `- **Predicted PM2.5:** ${worst[pmKey]} µg/m³\n\n`;
        text += `**Other High Pollution Corridors (${hLabel}):**\n`;
        for (const st of runnersUp) {
          text += `- **${st.name}**: Predicted AQI **${st[key]}** (${st[`predictedCategory${h}h`]} category)\n`;
        }
        text += `\n*Limitation: Converted from PM2.5 XGBoost predictions using Indian CPCB 24-hr NAQI breakpoints.*`;
        return text;
      }
    }

    // Ranking queries: Cleanest AQI
    if (isBestQuery) {
      const h = horizons.includes(48) ? 48 : horizons.includes(72) ? 72 : 24;
      const key = h === 48 ? 'predictedAqi48h' : h === 72 ? 'predictedAqi72h' : 'predictedAqi24h';
      const pmKey = h === 48 ? 'predictedPm25_48h' : h === 72 ? 'predictedPm25_72h' : 'predictedPm25_24h';
      const hLabel = h === 48 ? '48 hours' : h === 72 ? '72 hours' : '24 hours (tomorrow)';

      const sorted = [...allSummaries].filter((s) => s[key] != null).sort((a, b) => a[key] - b[key]);
      if (sorted.length > 0) {
        const best = sorted[0];
        const runnersUp = sorted.slice(1, 4);

        let text = `According to our forecast pipeline, **${best.name}** is projected to have the **cleanest air** among Delhi NCR stations after ${hLabel}.\n\n`;
        text += `- **Station:** ${best.name}\n`;
        text += `- **Predicted AQI:** **${best[key]}** (${best[`predictedCategory${h}h`]} category)\n`;
        text += `- **Predicted PM2.5:** ${best[pmKey]} µg/m³\n\n`;
        text += `**Other Relatively Cleaner Corridors (${hLabel}):**\n`;
        for (const st of runnersUp) {
          text += `- **${st.name}**: Predicted AQI **${st[key]}** (${st[`predictedCategory${h}h`]} category)\n`;
        }
        text += `\n*Limitation: Converted from PM2.5 XGBoost predictions using Indian CPCB 24-hr NAQI breakpoints.*`;
        return text;
      }
    }

    // General All Stations Forecast Listing
    const has24 = horizons.includes(24);
    const has48 = horizons.includes(48);
    const has72 = horizons.includes(72);
    const hasCur = horizons.includes(0);

    let text = `### Delhi NCR Air Quality Forecast Across All Stations\n\n`;
    for (const st of allSummaries) {
      text += `**${st.name}:**\n`;
      if (hasCur) {
        text += `  - Current AQI: **${st.currentAqi ?? '--'}** (${st.currentCategory})\n`;
      }
      if (has24) {
        text += `  - +24h Forecast: Predicted AQI **${st.predictedAqi24h ?? '--'}** (${st.predictedCategory24h})\n`;
      }
      if (has48) {
        text += `  - +48h Forecast: Predicted AQI **${st.predictedAqi48h ?? '--'}** (${st.predictedCategory48h})\n`;
      }
      if (has72) {
        text += `  - +72h Forecast: Predicted AQI **${st.predictedAqi72h ?? '--'}** (${st.predictedCategory72h})\n`;
      }
    }
    text += `\n*Methodology: Forecasts use XGBoost with boundary layer meteorology mapped to Indian CPCB NAQI breakpoints.*`;
    return text;
  }

  // 4. COMPARE_AQI: Comparison between 2 or more stations
  if (intent === INTENTS.COMPARE_AQI && stationData.length >= 2) {
    const s1 = stationData[0];
    const s2 = stationData[1];
    const compareH = horizons.find((h) => h > 0) || 0;

    if (compareH === 0) {
      // Compare current AQI only
      let text = `### Current Air Quality Comparison: ${s1.name} vs ${s2.name}\n\n`;
      text += `- **${s1.name}:** Current AQI **${s1.currentAqi ?? '--'}** (${s1.currentCategory}), PM2.5: ${s1.currentPm25 ?? '--'} µg/m³ &bull; *${s1.measurementTimeIST ?? 'Live'}*\n`;
      text += `- **${s2.name}:** Current AQI **${s2.currentAqi ?? '--'}** (${s2.currentCategory}), PM2.5: ${s2.currentPm25 ?? '--'} µg/m³ &bull; *${s2.measurementTimeIST ?? 'Live'}*\n\n`;

      if (s1.currentAqi != null && s2.currentAqi != null) {
        const diff = Math.abs(s1.currentAqi - s2.currentAqi);
        const cleaner = s1.currentAqi < s2.currentAqi ? s1.name : s2.name;
        text += `**Comparison Summary:** **${cleaner}** currently has lower pollution levels by **${diff} AQI points**.\n`;
      }
      return text;
    }

    // Compare specific future horizon (e.g. 24h, 48h, or 72h)
    const hKey = compareH === 48 ? 'forecast48h' : compareH === 72 ? 'forecast72h' : 'forecast24h';
    const hLabel = compareH === 48 ? '48 Hours' : compareH === 72 ? '72 Hours' : '24 Hours';

    let text = `### ${hLabel} Air Quality Comparison: ${s1.name} vs ${s2.name}\n\n`;
    text += `- **${s1.name} (+${compareH}h):** Predicted AQI **${s1[hKey]?.aqi ?? '--'}** (${s1[hKey]?.category ?? 'N/A'}), PM2.5: ${s1[hKey]?.pm25 ?? '--'} µg/m³\n`;
    text += `- **${s2.name} (+${compareH}h):** Predicted AQI **${s2[hKey]?.aqi ?? '--'}** (${s2[hKey]?.category ?? 'N/A'}), PM2.5: ${s2[hKey]?.pm25 ?? '--'} µg/m³\n\n`;

    if (s1[hKey]?.aqi && s2[hKey]?.aqi) {
      const diff = Math.abs(s1[hKey].aqi - s2[hKey].aqi);
      const cleaner = s1[hKey].aqi < s2[hKey].aqi ? s1.name : s2.name;
      text += `**Comparison Summary:** **${cleaner}** is projected to have lower pollution levels by approximately **${diff} AQI points** after ${hLabel}.\n\n`;
    }
    text += `*Limitation: Converted from PM2.5 XGBoost predictions using Indian CPCB 24-hr NAQI breakpoints.*`;
    return text;
  }

  // 5. Single Station Specific Intent Handling
  if (stationData.length > 0) {
    const st = stationData[0];
    const f = st.freshness;

    // --- Intent: CURRENT_AQI ---
    if (intent === INTENTS.CURRENT_AQI) {
      if (!st.hasData || f?.isUnavailable) {
        return `### Current Air Quality: ${st.name}

Current AQI telemetry is currently **unavailable** for **${st.name}**. The monitoring station has not transmitted valid observations within the last 48 hours. AeroCast does not fabricate sensor readings.`;
      }

      if (f?.isFresh) {
        let text = `### Current Air Quality: ${st.name}\n\n`;
        text += `- **Station:** ${st.name}\n`;
        text += `- **Current AQI:** **${st.currentAqi}** (${st.currentCategory})\n`;
        if (isPm25Query && st.currentPm25 != null) {
          text += `- **PM2.5 Concentration:** ${st.currentPm25} µg/m³\n`;
        }
        text += `- **Measurement Timestamp:** ${st.measurementTimeIST} (${f.ageMinutes} min ago)\n`;
        text += `- **Data Source:** ${st.source} (Continuous Ambient Air Quality Monitoring Station)\n`;
        text += `- **Freshness Status:** Verified Live Telemetry`;
        return text;
      }

      // Stale data state
      let text = `### Current Air Quality: ${st.name} (⚠️ Stale Data Notice)\n\n`;
      text += `> ⚠️ **Data Freshness Notice:** The latest available measurement for **${st.name}** was recorded at **${st.measurementTimeIST}** (${f?.ageHours ?? 'several'} hours ago). Newer station telemetry has not yet been published by the monitoring agency feed.\n\n`;
      text += `- **Station:** ${st.name}\n`;
      text += `- **Last Observed AQI:** **${st.currentAqi}** (${st.currentCategory})\n`;
      if (isPm25Query && st.currentPm25 != null) {
        text += `- **PM2.5 Concentration:** ${st.currentPm25} µg/m³\n`;
      }
      text += `- **Measurement Timestamp:** ${st.measurementTimeIST}\n`;
      text += `- **Data Source:** ${st.source}\n`;
      text += `- **Freshness Status:** Stale Data (${f?.ageHours ?? 'N/A'} hours delayed)`;
      return text;
    }

    // --- Intent: CURRENT_PM25 ---
    if (intent === INTENTS.CURRENT_PM25) {
      if (!st.hasData || f?.isUnavailable) {
        return `### Current PM2.5 Concentration: ${st.name}\n\nPM2.5 telemetry is currently **unavailable** for **${st.name}**. No verified reading was reported in the latest monitoring cycle.`;
      }

      let text = `### Current PM2.5 Concentration: ${st.name}\n\n`;
      text += `- **Station:** ${st.name}\n`;
      text += `- **PM2.5 Concentration:** **${st.currentPm25} µg/m³**\n`;
      text += `- **Implied AQI Sub-Index:** **${st.currentAqi}** (${st.currentCategory})\n`;
      text += `- **Measurement Timestamp:** ${st.measurementTimeIST}\n`;
      text += `- **Freshness Status:** ${f?.isFresh ? 'Verified Live Telemetry' : `Stale Data (${f?.ageHours ?? ''}h ago)`}\n`;
      text += `- **Data Source:** ${st.source}`;
      return text;
    }

    // --- Intent: FORECAST_24H ---
    if (intent === INTENTS.FORECAST_24H) {
      const fc = st.forecast24h;
      let text = `### 24-Hour Air Quality Forecast: ${st.name}\n\n`;
      text += `- **Station:** ${st.name}\n`;
      text += `- **Predicted AQI after 24 Hours:** **${fc?.aqi ?? '--'}** (${fc?.category ?? 'Pending'})\n`;
      text += `- **Predicted PM2.5 Concentration:** ${fc?.pm25 != null ? `${fc.pm25} µg/m³` : 'Pending'}\n`;
      text += `- **Forecast Target Time:** ${fc?.targetTimeIST ?? 'After 24 hours'} (+24h)\n`;
      text += `- **Limitation:** Inferred from weather-coupled XGBoost PM2.5 predictions using official Indian CPCB 24-hour sub-index breakpoints.`;
      return text;
    }

    // --- Intent: FORECAST_48H ---
    if (intent === INTENTS.FORECAST_48H) {
      const fc = st.forecast48h;
      let text = `### 48-Hour Air Quality Forecast: ${st.name}\n\n`;
      text += `- **Station:** ${st.name}\n`;
      text += `- **Predicted AQI after 48 Hours:** **${fc?.aqi ?? '--'}** (${fc?.category ?? 'Pending'})\n`;
      text += `- **Predicted PM2.5 Concentration:** ${fc?.pm25 != null ? `${fc.pm25} µg/m³` : 'Pending'}\n`;
      text += `- **Forecast Target Time:** ${fc?.targetTimeIST ?? 'After 48 hours'} (+48h)\n`;
      text += `- **Limitation:** Inferred from weather-coupled XGBoost PM2.5 predictions using official Indian CPCB 24-hour sub-index breakpoints.`;
      return text;
    }

    // --- Intent: FORECAST_72H ---
    if (intent === INTENTS.FORECAST_72H) {
      const fc = st.forecast72h;
      let text = `### 72-Hour Air Quality Forecast: ${st.name}\n\n`;
      text += `- **Station:** ${st.name}\n`;
      text += `- **Predicted AQI after 72 Hours:** **${fc?.aqi ?? '--'}** (${fc?.category ?? 'Pending'})\n`;
      text += `- **Predicted PM2.5 Concentration:** ${fc?.pm25 != null ? `${fc.pm25} µg/m³` : 'Pending'}\n`;
      text += `- **Forecast Target Time:** ${fc?.targetTimeIST ?? 'After 72 hours'} (+72h)\n`;
      text += `- **Limitation:** Inferred from weather-coupled XGBoost PM2.5 predictions using official Indian CPCB 24-hour sub-index breakpoints.`;
      return text;
    }

    // --- Intent: MULTI_HORIZON (User explicitly asked for multiple specific horizons) ---
    if (intent === INTENTS.MULTI_HORIZON) {
      let text = `### Air Quality Telemetry & Forecast: ${st.name}\n\n`;

      if (horizons.includes(0)) {
        text += `**Current Observed Telemetry:**\n`;
        text += `- Current AQI: **${st.currentAqi ?? '--'}** (${st.currentCategory})\n`;
        if (st.currentPm25 != null) {
          text += `- PM2.5 Concentration: ${st.currentPm25} µg/m³\n`;
        }
        text += `- Measurement Timestamp: ${st.measurementTimeIST ?? 'Live'}\n`;
        text += `- Freshness: ${f?.isFresh ? 'Verified Live Telemetry' : 'Stale Data'}\n\n`;
      }

      if (horizons.includes(24) && st.forecast24h) {
        text += `**Predicted AQI after 24 Hours (Tomorrow):**\n`;
        text += `- Predicted AQI: **${st.forecast24h.aqi}** (${st.forecast24h.category})\n`;
        text += `- Predicted PM2.5: ${st.forecast24h.pm25} µg/m³\n`;
        text += `- Target Time: ${st.forecast24h.targetTimeIST} (+24h)\n\n`;
      }

      if (horizons.includes(48) && st.forecast48h) {
        text += `**Predicted AQI after 48 Hours:**\n`;
        text += `- Predicted AQI: **${st.forecast48h.aqi}** (${st.forecast48h.category})\n`;
        text += `- Predicted PM2.5: ${st.forecast48h.pm25} µg/m³\n`;
        text += `- Target Time: ${st.forecast48h.targetTimeIST} (+48h)\n\n`;
      }

      if (horizons.includes(72) && st.forecast72h) {
        text += `**Predicted AQI after 72 Hours:**\n`;
        text += `- Predicted AQI: **${st.forecast72h.aqi}** (${st.forecast72h.category})\n`;
        text += `- Predicted PM2.5: ${st.forecast72h.pm25} µg/m³\n`;
        text += `- Target Time: ${st.forecast72h.targetTimeIST} (+72h)\n\n`;
      }

      text += `*Limitation: Converted from PM2.5 XGBoost predictions using Indian CPCB 24-hr NAQI breakpoints.*`;
      return text;
    }
  }

  // Fallback generic guidance
  return `I could not find specific data for your request. Please specify a station (such as Anand Vihar, Punjabi Bagh, RK Puram, ITO, Mandir Marg, Lodhi Road, Dwarka, Rohini, Gurugram, or Noida) and your desired forecast horizon (current, 24h, 48h, or 72h).`;
}

/**
 * Backend Post-Processing Guard:
 * Strictly enforces that unrequested forecast horizons or observations cannot leak into the client output,
 * even if an LLM attempted to append them.
 */
function sanitizeResponseAgainstIntent(replyText, intent, horizons, factualContext) {
  if (!replyText || typeof replyText !== 'string') return factualContext;

  // Rule 1: If CURRENT_AQI, verify reply contains NO future forecasts
  if (intent === INTENTS.CURRENT_AQI) {
    if (
      /upcoming.*forecast|multi-horizon|horizon\s*overview|24-hour.*forecast|after\s*24h|after\s*48h|after\s*72h/i.test(replyText)
    ) {
      return factualContext;
    }
  }

  // Rule 2: If single forecast (24h, 48h, 72h), verify reply contains NO current AQI baseline or other horizons
  if (intent === INTENTS.FORECAST_24H) {
    if (/baseline\s*aqi|current\s*observed|current\s*aqi|48-hour|72-hour|after\s*48h|after\s*72h/i.test(replyText)) {
      return factualContext;
    }
  }

  if (intent === INTENTS.FORECAST_48H) {
    if (/baseline\s*aqi|current\s*observed|current\s*aqi|24-hour|72-hour|after\s*24h|after\s*72h/i.test(replyText)) {
      return factualContext;
    }
  }

  if (intent === INTENTS.FORECAST_72H) {
    if (/baseline\s*aqi|current\s*observed|current\s*aqi|24-hour|48-hour|after\s*24h|after\s*48h/i.test(replyText)) {
      return factualContext;
    }
  }

  return replyText;
}

/**
 * Call Google Gemini LLM with strictly grounded facts and strict intent rules
 */
async function callGemini(message, history, groundedData) {
  const apiKey = config.geminiApiKey;
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];

  const factualContext = buildFactualResponse(message, groundedData);
  const { classification } = groundedData;
  const { intent, horizons } = classification;

  const systemInstruction = `You are AeroCast Voice AI, an articulate and scientifically rigorous air quality and atmospheric assistant for Delhi NCR.
You have access to AeroCast's deterministic XGBoost ML forecasting model and Indian CPCB NAQI standard.

CRITICAL INTENT RULES:
1. Answer strictly and exclusively what the user asked. DO NOT add unrequested information.
2. If the user asked for current AQI: output ONLY the current AQI, category, and measurement timestamp/freshness. DO NOT output 24h, 48h, or 72h forecasts or append upcoming forecasts.
3. If the user asked for a 24-hour forecast: output ONLY the 24h prediction, category, and target time. DO NOT output current AQI, 48h forecast, or 72h forecast.
4. If the user asked for a 48-hour forecast: output ONLY the 48h prediction. DO NOT output current AQI, 24h forecast, or 72h forecast.
5. If the user asked for a 72-hour forecast: output ONLY the 72h prediction. DO NOT output current AQI, 24h forecast, or 48h forecast.
6. If the user asked to compare stations: compare ONLY the requested metric or horizon.
7. Base all numerical answers strictly on the GROUND TRUTH DATA below. Never invent numbers, categories, or timestamps.

GROUND TRUTH DATA (VERIFIED FROM LIVE APIS):
${factualContext}`;

  const contents = [];
  if (Array.isArray(history)) {
    for (const h of history) {
      if (h.content && h.content.trim()) {
        const role = h.role === 'assistant' || h.role === 'model' ? 'model' : 'user';
        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts[0].text += `\n${h.content.trim()}`;
        } else {
          contents.push({ role, parts: [{ text: h.content.trim() }] });
        }
      }
    }
  }

  contents.push({ role: 'user', parts: [{ text: message }] });

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await axios.post(
        url,
        {
          contents,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      const replyText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (replyText) {
        const cleanReply = sanitizeResponseAgainstIntent(replyText.trim(), intent, horizons, factualContext);
        return {
          reply: cleanReply,
          provider: 'gemini',
          model,
          timestamp: new Date().toISOString(),
          intent,
        };
      }
    } catch (err) {
      console.warn(`[Gemini] ${model} failed: ${err.message}`);
      if (err.response?.status === 400 || err.response?.status === 403) break;
    }
  }

  // Fallback to grounded factual response
  return {
    reply: factualContext,
    provider: 'local-engine',
    model: 'aerocast-cpcb-grounded',
    timestamp: new Date().toISOString(),
    intent,
  };
}

/**
 * Main AI Chat Service Dispatcher
 */
export async function generateChatResponse(message, history = [], context = {}) {
  // 1. Deterministically retrieve only the required station data & forecasts based on strict intent
  const groundedData = await retrieveGroundedData(message, history, context);
  const { classification } = groundedData;

  // 2. If Gemini API is configured, use LLM with strict grounding
  if (config.geminiApiKey) {
    try {
      return await callGemini(message, history, groundedData);
    } catch (err) {
      console.warn('[AIChatService] Gemini call failed, using grounded local engine:', err.message);
    }
  }

  // 3. Built-in Grounded Local Engine: 100% deterministic, intent-strict, accurate, and instant
  const reply = buildFactualResponse(message, groundedData);
  return {
    reply,
    provider: 'local-engine',
    model: 'aerocast-cpcb-grounded',
    timestamp: new Date().toISOString(),
    intent: classification.intent,
    grounded: {
      intent: classification.intent,
      horizons: classification.horizons,
      stationCount: classification.stations.length,
      stationFromHistory: classification.stationFromHistory,
    },
  };
}

/**
 * Returns current status of AI chat service
 */
export function getChatServiceStatus() {
  const configured = !!(config.geminiApiKey || config.openaiApiKey);
  return {
    status: 'ok',
    configured,
    activeProvider: config.geminiApiKey ? 'gemini' : 'local-engine',
    supportedProviders: ['gemini', 'openai', 'local-engine'],
    recommendedProvider: 'gemini',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    instructions: configured
      ? 'Live AI LLM provider is active and ready.'
      : 'AeroCast Grounded Atmospheric & Forecast Engine is active. Set GEMINI_API_KEY in backend/.env for conversational synthesis.',
  };
}

export default {
  generateChatResponse,
  getChatServiceStatus,
};

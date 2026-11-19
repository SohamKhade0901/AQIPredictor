/**
 * Deterministic Intent Parser & Station Resolver for AeroCast Voice AI Chatbot
 * Standard: Indian CPCB National Air Quality Index (NAQI)
 */

export const INTENTS = {
  CURRENT_AQI: 'CURRENT_AQI',
  FORECAST_24H: 'FORECAST_24H',
  FORECAST_48H: 'FORECAST_48H',
  FORECAST_72H: 'FORECAST_72H',
  MULTI_HORIZON: 'MULTI_HORIZON',
  CURRENT_PM25: 'CURRENT_PM25',
  COMPARE_AQI: 'COMPARE_AQI',
  ALL_STATIONS: 'ALL_STATIONS',
  GENERAL_AIR_QUALITY: 'GENERAL_AIR_QUALITY',
  STATION_CLARIFICATION: 'STATION_CLARIFICATION',
};

export const STATION_ALIASES = [
  { id: '235',   name: 'Anand Vihar',        keywords: ['anand vihar', 'anandvihar', 'anand-vihar'] },
  { id: '50',    name: 'Punjabi Bagh',       keywords: ['punjabi bagh', 'punjabibagh', 'punjabi-bagh'] },
  { id: '17',    name: 'RK Puram',           keywords: ['rk puram', 'r k puram', 'r.k. puram', 'rkpuram', 'rk-puram'] },
  { id: '5613',  name: 'ITO',                keywords: ['ito'] },
  { id: '6358',  name: 'Mandir Marg',        keywords: ['mandir marg', 'mandirmarg', 'mandir-marg'] },
  { id: '5634',  name: 'Lodhi Road',         keywords: ['lodhi road', 'lodhi', 'lodhiroad', 'lodhi-road'] },
  { id: '6931',  name: 'Dwarka Sec 8',       keywords: ['dwarka sec 8', 'dwarka sector 8', 'dwarka sec-8', 'dwarka-8', 'dwarka'] },
  { id: '10831', name: 'Rohini',             keywords: ['rohini'] },
  { id: '10900', name: 'Gurugram Sector 51', keywords: ['gurugram sector 51', 'gurugram', 'gurgaon', 'sec 51', 'sector 51'] },
  { id: '5616',  name: 'Noida Sector 62',    keywords: ['noida sector 62', 'noida', 'sec 62', 'sector 62', 'noida 62'] },
];

/**
 * Extract stations mentioned explicitly in text using whole-word boundary matching
 */
export function extractStations(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matched = [];

  for (const st of STATION_ALIASES) {
    const isMatched = st.keywords.some((kw) => {
      // Escape dots/hyphens for regex
      const escaped = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`(^|\\b|\\s)${escaped}(\\b|\\s|$)`, 'i');
      return regex.test(lower);
    });
    if (isMatched) {
      matched.push(st);
    }
  }

  return matched;
}

/**
 * Resolve station from conversational history (follow-up context)
 * Scans user and assistant messages in reverse chronological order
 */
export function resolveStationFromHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return null;

  for (let i = history.length - 1; i >= 0; i--) {
    const content = history[i]?.content || '';
    const stations = extractStations(content);
    if (stations.length === 1) {
      return stations[0];
    }
    // If assistant message mentions a station in title or bold (e.g. **Anand Vihar**)
    for (const st of STATION_ALIASES) {
      if (content.includes(`**${st.name}**`) || content.includes(st.name)) {
        return st;
      }
    }
  }

  return null;
}

/**
 * Deterministically detect which forecast horizons the user requested
 * 0 = Current observation
 * 24 = 24-hour horizon (tomorrow / 1 day)
 * 48 = 48-hour horizon (day after tomorrow / 2 days)
 * 72 = 72-hour horizon (3 days)
 */
export function detectRequestedHorizons(text) {
  const lower = (text || '').toLowerCase();
  const horizons = new Set();

  const isAllForecasts =
    lower.includes('all forecast') ||
    lower.includes('all the forecast') ||
    lower.includes('all horizons') ||
    lower.includes('every forecast') ||
    lower.includes('all 3 days') ||
    lower.includes('all three days') ||
    lower.includes('next 3 days') ||
    lower.includes('next three days') ||
    lower.includes('entire forecast') ||
    (lower.includes('forecast') && lower.includes('all'));

  if (isAllForecasts) {
    return [24, 48, 72];
  }

  // 24-hour patterns
  const match24 =
    /\b(24\s*h|24\s*hours?|24\s*hrs?|tomorrow|next\s*day|1\s*day|one\s*day)\b/i.test(lower) ||
    lower.includes('after 24') ||
    lower.includes('after 1 day') ||
    lower.includes('after one day');

  // 48-hour patterns
  const match48 =
    /\b(48\s*h|48\s*hours?|48\s*hrs?|day\s*after\s*tomorrow|2\s*days?|two\s*days?)\b/i.test(lower) ||
    lower.includes('after 48') ||
    lower.includes('after 2 day') ||
    lower.includes('after two day');

  // 72-hour patterns
  const match72 =
    /\b(72\s*h|72\s*hours?|72\s*hrs?|3\s*days?|three\s*days?)\b/i.test(lower) ||
    lower.includes('after 72') ||
    lower.includes('after 3 day') ||
    lower.includes('after three day');

  // Current / Live patterns
  const matchCurrent =
    /\b(current|now|present|live|right\s*now|currently|latest|today|today's)\b/i.test(lower);

  if (match24) horizons.add(24);
  if (match48) horizons.add(48);
  if (match72) horizons.add(72);
  if (matchCurrent) horizons.add(0);

  // If "only 24" or "only 48" or "only 72" or "current only"
  if (lower.includes('only 24') || lower.includes('24-hour prediction only') || lower.includes('24 hour prediction only')) {
    return [24];
  }
  if (lower.includes('only 48') || lower.includes('48-hour prediction only')) {
    return [48];
  }
  if (lower.includes('only 72') || lower.includes('72-hour prediction only')) {
    return [72];
  }
  if (lower.includes('current aqi only') || lower.includes('current reading only') || lower.includes('only the current')) {
    return [0];
  }

  // If user asked "predict" or "forecast" without explicit hours: default to 24
  if (horizons.size === 0 && (lower.includes('predict') || lower.includes('forecast') || lower.includes('will be') || lower.includes('future') || lower.includes('expect'))) {
    horizons.add(24);
  }

  // If still empty and message asks for AQI or PM2.5, default to current (0)
  if (horizons.size === 0) {
    horizons.add(0);
  }

  return Array.from(horizons).sort((a, b) => a - b);
}

/**
 * Main Intent Classifier
 * Categorizes user request into strict intent and isolates needed parameters
 */
export function classifyChatIntent(message, history = [], context = {}) {
  const lower = (message || '').toLowerCase().trim();

  // 1. General Atmospheric, Scientific, or Health inquiries (independent of specific station)
  const isAqiVsPm25Query =
    lower.includes('difference between aqi and pm2.5') ||
    lower.includes('difference between aqi') ||
    lower.includes('what is the difference between aqi') ||
    (lower.includes('aqi') && lower.includes('pm2.5') && (lower.includes('difference') || lower.includes('mean') || lower.includes('explain')));

  const isAtmosphericQuery =
    lower.includes('why is the air quality poor') ||
    lower.includes('why is air quality poor') ||
    lower.includes('why is air pollution worse') ||
    lower.includes('worse at night') ||
    (lower.includes('night') && lower.includes('pollution')) ||
    lower.includes('inversion') ||
    lower.includes('boundary layer') ||
    lower.includes('pbl') ||
    lower.includes('trapping') ||
    lower.includes('stagnant') ||
    (lower.includes('trap') && lower.includes('pollution'));

  const isHealthQuery =
    lower.includes('precaution') ||
    lower.includes('precautions') ||
    lower.includes('mask') ||
    lower.includes('exercise') ||
    lower.includes('jogging') ||
    lower.includes('jog') ||
    lower.includes('walk') ||
    lower.includes('safe to go out') ||
    lower.includes('protect against');

  if (isAqiVsPm25Query || isAtmosphericQuery || isHealthQuery) {
    return {
      intent: INTENTS.GENERAL_AIR_QUALITY,
      horizons: [],
      stations: [],
      stationFromHistory: false,
      isAqiVsPm25Query,
      isAtmosphericQuery,
      isHealthQuery,
      isWorstQuery: false,
      isBestQuery: false,
      isPm25Query: false,
    };
  }

  // 2. Rankings or All Stations queries
  const isWorstQuery =
    lower.includes('worst') ||
    lower.includes('highest') ||
    lower.includes('most polluted') ||
    lower.includes('severest') ||
    lower.includes('most dangerous');

  const isBestQuery =
    lower.includes('cleanest') ||
    lower.includes('best') ||
    lower.includes('lowest aqi') ||
    lower.includes('least polluted') ||
    lower.includes('safest');

  const isAllStationsQuery =
    lower.includes('all stations') ||
    lower.includes('every area') ||
    lower.includes('all areas') ||
    lower.includes('every station') ||
    lower.includes('across delhi') ||
    lower.includes('entire ncr') ||
    lower.includes('whole delhi') ||
    isWorstQuery ||
    isBestQuery;

  const horizons = detectRequestedHorizons(lower);

  if (isAllStationsQuery) {
    return {
      intent: INTENTS.ALL_STATIONS,
      horizons,
      stations: [],
      stationFromHistory: false,
      isAqiVsPm25Query: false,
      isAtmosphericQuery: false,
      isHealthQuery: false,
      isWorstQuery,
      isBestQuery,
      isPm25Query: lower.includes('pm2.5') || lower.includes('pm25'),
    };
  }

  // 3. Station Identification
  const explicitStations = extractStations(lower);
  let stations = explicitStations;
  let stationFromHistory = false;

  // If no station explicitly in message, check conversational follow-up history
  if (stations.length === 0) {
    const historyStation = resolveStationFromHistory(history);
    if (historyStation) {
      stations = [historyStation];
      stationFromHistory = true;
    }
  }

  // 4. Comparison queries (2 stations or explicit compare word)
  const isCompareWord =
    lower.includes('compare') ||
    lower.includes(' vs ') ||
    lower.includes(' versus ') ||
    lower.includes('difference between');

  if (stations.length >= 2 || (isCompareWord && stations.length > 0)) {
    return {
      intent: INTENTS.COMPARE_AQI,
      horizons,
      stations,
      stationFromHistory,
      isAqiVsPm25Query: false,
      isAtmosphericQuery: false,
      isHealthQuery: false,
      isWorstQuery: false,
      isBestQuery: false,
      isPm25Query: lower.includes('pm2.5') || lower.includes('pm25'),
    };
  }

  // 5. If no station found anywhere (missing/ambiguous station)
  if (stations.length === 0) {
    // If the message is a general greeting or help query
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('help') || lower === 'hey') {
      return {
        intent: INTENTS.GENERAL_AIR_QUALITY,
        horizons: [],
        stations: [],
        stationFromHistory: false,
        isAqiVsPm25Query: false,
        isAtmosphericQuery: false,
        isHealthQuery: false,
        isWorstQuery: false,
        isBestQuery: false,
        isPm25Query: false,
      };
    }

    return {
      intent: INTENTS.STATION_CLARIFICATION,
      horizons,
      stations: [],
      stationFromHistory: false,
      isAqiVsPm25Query: false,
      isAtmosphericQuery: false,
      isHealthQuery: false,
      isWorstQuery: false,
      isBestQuery: false,
      isPm25Query: lower.includes('pm2.5') || lower.includes('pm25'),
    };
  }

  // 6. PM2.5 Specific Query (Current PM2.5 asked)
  const isPm25Only =
    (lower.includes('pm2.5') || lower.includes('pm25') || lower.includes('particulate')) &&
    !lower.includes('aqi') &&
    horizons.length === 1 &&
    horizons[0] === 0;

  if (isPm25Only) {
    return {
      intent: INTENTS.CURRENT_PM25,
      horizons: [0],
      stations,
      stationFromHistory,
      isAqiVsPm25Query: false,
      isAtmosphericQuery: false,
      isHealthQuery: false,
      isWorstQuery: false,
      isBestQuery: false,
      isPm25Query: true,
    };
  }

  // 7. Single Horizon Intents
  if (horizons.length === 1) {
    const h = horizons[0];
    if (h === 0) {
      return {
        intent: INTENTS.CURRENT_AQI,
        horizons: [0],
        stations,
        stationFromHistory,
        isAqiVsPm25Query: false,
        isAtmosphericQuery: false,
        isHealthQuery: false,
        isWorstQuery: false,
        isBestQuery: false,
        isPm25Query: lower.includes('pm2.5') || lower.includes('pm25'),
      };
    }
    if (h === 24) {
      return {
        intent: INTENTS.FORECAST_24H,
        horizons: [24],
        stations,
        stationFromHistory,
        isAqiVsPm25Query: false,
        isAtmosphericQuery: false,
        isHealthQuery: false,
        isWorstQuery: false,
        isBestQuery: false,
        isPm25Query: lower.includes('pm2.5') || lower.includes('pm25'),
      };
    }
    if (h === 48) {
      return {
        intent: INTENTS.FORECAST_48H,
        horizons: [48],
        stations,
        stationFromHistory,
        isAqiVsPm25Query: false,
        isAtmosphericQuery: false,
        isHealthQuery: false,
        isWorstQuery: false,
        isBestQuery: false,
        isPm25Query: lower.includes('pm2.5') || lower.includes('pm25'),
      };
    }
    if (h === 72) {
      return {
        intent: INTENTS.FORECAST_72H,
        horizons: [72],
        stations,
        stationFromHistory,
        isAqiVsPm25Query: false,
        isAtmosphericQuery: false,
        isHealthQuery: false,
        isWorstQuery: false,
        isBestQuery: false,
        isPm25Query: lower.includes('pm2.5') || lower.includes('pm25'),
      };
    }
  }

  // 8. Multi-Horizon Intent (e.g. [0, 24], [24, 48, 72])
  return {
    intent: INTENTS.MULTI_HORIZON,
    horizons,
    stations,
    stationFromHistory,
    isAqiVsPm25Query: false,
    isAtmosphericQuery: false,
    isHealthQuery: false,
    isWorstQuery: false,
    isBestQuery: false,
    isPm25Query: lower.includes('pm2.5') || lower.includes('pm25'),
  };
}

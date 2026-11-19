/**
 * CPCB National Air Quality Index (NAQI) Standard Implementation (India)
 * 
 * Reference: Central Pollution Control Board (CPCB), Ministry of Environment,
 * Forest and Climate Change, Government of India.
 * 
 * AQI Categories:
 *   0 - 50   : Good (Minimal impact)
 *   51 - 100 : Satisfactory (Minor breathing discomfort to sensitive people)
 *   101 - 200: Moderately Polluted (Breathing discomfort to people with asthma/heart disease)
 *   201 - 300: Poor (Breathing discomfort to most people on prolonged exposure)
 *   301 - 400: Very Poor (Respiratory illness on prolonged exposure)
 *   401 - 500: Severe (Affects healthy people, seriously impacts those with existing conditions)
 */

export const AQI_CATEGORIES = [
  { min: 0,   max: 50,  category: 'Good',                color: '#00b050', textClass: 'text-emerald-700', bgClass: 'bg-emerald-50 border-emerald-200' },
  { min: 51,  max: 100, category: 'Satisfactory',         color: '#92d050', textClass: 'text-lime-700',    bgClass: 'bg-lime-50 border-lime-200' },
  { min: 101, max: 200, category: 'Moderately Polluted',  color: '#eab308', textClass: 'text-yellow-700',  bgClass: 'bg-yellow-50 border-yellow-200' },
  { min: 201, max: 300, category: 'Poor',                 color: '#f97316', textClass: 'text-orange-700',  bgClass: 'bg-orange-50 border-orange-200' },
  { min: 301, max: 400, category: 'Very Poor',            color: '#ef4444', textClass: 'text-red-700',     bgClass: 'bg-red-50 border-red-200' },
  { min: 401, max: 500, category: 'Severe',               color: '#881337', textClass: 'text-rose-900',    bgClass: 'bg-rose-50 border-rose-200' },
];

/**
 * CPCB Breakpoint Tables (B_low, B_high, I_low, I_high)
 * Concentrations in µg/m³ except CO which is mg/m³.
 */
export const CPCB_BREAKPOINTS = {
  pm25: [
    { bLow: 0,   bHigh: 30,  iLow: 0,   iHigh: 50,  category: 'Good' },
    { bLow: 30,  bHigh: 60,  iLow: 51,  iHigh: 100, category: 'Satisfactory' },
    { bLow: 60,  bHigh: 90,  iLow: 101, iHigh: 200, category: 'Moderately Polluted' },
    { bLow: 90,  bHigh: 120, iLow: 201, iHigh: 300, category: 'Poor' },
    { bLow: 120, bHigh: 250, iLow: 301, iHigh: 400, category: 'Very Poor' },
    { bLow: 250, bHigh: 380, iLow: 401, iHigh: 500, category: 'Severe' },
  ],
  pm10: [
    { bLow: 0,   bHigh: 50,  iLow: 0,   iHigh: 50,  category: 'Good' },
    { bLow: 50,  bHigh: 100, iLow: 51,  iHigh: 100, category: 'Satisfactory' },
    { bLow: 100, bHigh: 250, iLow: 101, iHigh: 200, category: 'Moderately Polluted' },
    { bLow: 250, bHigh: 350, iLow: 201, iHigh: 300, category: 'Poor' },
    { bLow: 350, bHigh: 430, iLow: 301, iHigh: 400, category: 'Very Poor' },
    { bLow: 430, bHigh: 550, iLow: 401, iHigh: 500, category: 'Severe' },
  ],
  no2: [
    { bLow: 0,   bHigh: 40,  iLow: 0,   iHigh: 50,  category: 'Good' },
    { bLow: 40,  bHigh: 80,  iLow: 51,  iHigh: 100, category: 'Satisfactory' },
    { bLow: 80,  bHigh: 180, iLow: 101, iHigh: 200, category: 'Moderately Polluted' },
    { bLow: 180, bHigh: 280, iLow: 201, iHigh: 300, category: 'Poor' },
    { bLow: 280, bHigh: 400, iLow: 301, iHigh: 400, category: 'Very Poor' },
    { bLow: 400, bHigh: 500, iLow: 401, iHigh: 500, category: 'Severe' },
  ],
  so2: [
    { bLow: 0,    bHigh: 40,   iLow: 0,   iHigh: 50,  category: 'Good' },
    { bLow: 40,   bHigh: 80,   iLow: 51,  iHigh: 100, category: 'Satisfactory' },
    { bLow: 80,   bHigh: 380,  iLow: 101, iHigh: 200, category: 'Moderately Polluted' },
    { bLow: 380,  bHigh: 800,  iLow: 201, iHigh: 300, category: 'Poor' },
    { bLow: 800,  bHigh: 1600, iLow: 301, iHigh: 400, category: 'Very Poor' },
    { bLow: 1600, bHigh: 2000, iLow: 401, iHigh: 500, category: 'Severe' },
  ],
  co: [
    { bLow: 0,    bHigh: 1.0, iLow: 0,   iHigh: 50,  category: 'Good' },
    { bLow: 1.0,  bHigh: 2.0, iLow: 51,  iHigh: 100, category: 'Satisfactory' },
    { bLow: 2.0,  bHigh: 10,  iLow: 101, iHigh: 200, category: 'Moderately Polluted' },
    { bLow: 10,   bHigh: 17,  iLow: 201, iHigh: 300, category: 'Poor' },
    { bLow: 17,   bHigh: 34,  iLow: 301, iHigh: 400, category: 'Very Poor' },
    { bLow: 34,   bHigh: 50,  iLow: 401, iHigh: 500, category: 'Severe' },
  ],
  o3: [
    { bLow: 0,    bHigh: 50,  iLow: 0,   iHigh: 50,  category: 'Good' },
    { bLow: 50,   bHigh: 100, iLow: 51,  iHigh: 100, category: 'Satisfactory' },
    { bLow: 100,  bHigh: 168, iLow: 101, iHigh: 200, category: 'Moderately Polluted' },
    { bLow: 168,  bHigh: 208, iLow: 201, iHigh: 300, category: 'Poor' },
    { bLow: 208,  bHigh: 748, iLow: 301, iHigh: 400, category: 'Very Poor' },
    { bLow: 748,  bHigh: 1000,iLow: 401, iHigh: 500, category: 'Severe' },
  ],
  nh3: [
    { bLow: 0,    bHigh: 200,  iLow: 0,   iHigh: 50,  category: 'Good' },
    { bLow: 200,  bHigh: 400,  iLow: 51,  iHigh: 100, category: 'Satisfactory' },
    { bLow: 400,  bHigh: 800,  iLow: 101, iHigh: 200, category: 'Moderately Polluted' },
    { bLow: 800,  bHigh: 1200, iLow: 201, iHigh: 300, category: 'Poor' },
    { bLow: 1200, bHigh: 1800, iLow: 301, iHigh: 400, category: 'Very Poor' },
    { bLow: 1800, bHigh: 2400, iLow: 401, iHigh: 500, category: 'Severe' },
  ],
};

/**
 * Get category and styling info for an AQI value
 */
export function getAqiCategory(aqi) {
  if (aqi === null || aqi === undefined || isNaN(aqi)) {
    return {
      category: 'No Data',
      color: '#94a3b8',
      textClass: 'text-slate-600',
      bgClass: 'bg-slate-50 border-slate-200',
      impact: 'Air quality data is currently unavailable',
    };
  }

  const val = Math.round(Number(aqi));
  if (val <= 50) {
    return {
      category: 'Good',
      color: '#00b050',
      textClass: 'text-emerald-700',
      bgClass: 'bg-emerald-50 border-emerald-200',
      impact: 'Minimal health impact. Clean air.',
    };
  }
  if (val <= 100) {
    return {
      category: 'Satisfactory',
      color: '#92d050',
      textClass: 'text-lime-700',
      bgClass: 'bg-lime-50 border-lime-200',
      impact: 'Minor breathing discomfort to sensitive individuals.',
    };
  }
  if (val <= 200) {
    return {
      category: 'Moderately Polluted',
      color: '#eab308',
      textClass: 'text-yellow-700',
      bgClass: 'bg-yellow-50 border-yellow-200',
      impact: 'Breathing discomfort to people with lungs, asthma and heart diseases.',
    };
  }
  if (val <= 300) {
    return {
      category: 'Poor',
      color: '#f97316',
      textClass: 'text-orange-700',
      bgClass: 'bg-orange-50 border-orange-200',
      impact: 'Breathing discomfort to most people on prolonged outdoor exposure.',
    };
  }
  if (val <= 400) {
    return {
      category: 'Very Poor',
      color: '#ef4444',
      textClass: 'text-red-700',
      bgClass: 'bg-red-50 border-red-200',
      impact: 'Respiratory illness to people on prolonged exposure; severe effect on vulnerable groups.',
    };
  }
  return {
    category: 'Severe',
    color: '#881337',
    textClass: 'text-rose-900',
    bgClass: 'bg-rose-50 border-rose-200',
    impact: 'Affects healthy people and seriously impacts those with existing diseases.',
  };
}

/**
 * Calculate CPCB Sub-Index for a single pollutant
 * Formula: Ip = [ (I_high - I_low) / (B_high - B_low) ] * (Cp - B_low) + I_low
 */
export function calculateSubIndex(pollutant, concentration) {
  if (concentration === null || concentration === undefined || concentration < 0 || isNaN(concentration)) {
    return null;
  }

  const pKey = pollutant.toLowerCase().replace('.', '');
  const breakpoints = CPCB_BREAKPOINTS[pKey];
  if (!breakpoints) {
    return null;
  }

  const cp = Number(concentration);

  // Check breakpoint ranges
  for (const bp of breakpoints) {
    if (cp >= bp.bLow && cp <= bp.bHigh) {
      const subIndex = ((bp.iHigh - bp.iLow) / (bp.bHigh - bp.bLow)) * (cp - bp.bLow) + bp.iLow;
      return Math.min(500, Math.max(0, Math.round(subIndex)));
    }
  }

  // If concentration exceeds the highest breakpoint, cap at 500
  if (cp > breakpoints[breakpoints.length - 1].bHigh) {
    return 500;
  }

  return 0;
}

/**
 * Calculate comprehensive Indian CPCB AQI from available pollutant concentrations
 * 
 * Requirements per CPCB guidelines:
 * - At least 3 pollutants must be monitored, with at least one being PM10 or PM2.5 for official AQI.
 * - Overall AQI = max(sub-index) of monitored pollutants.
 * - If only PM2.5 is available, calculate the PM2.5 sub-index and label it as a
 *   "PM2.5-based estimate (prominent pollutant sub-index)" with an explicit limitation.
 * 
 * @param {Record<string, number>} pollutants - e.g. { pm25: 140, pm10: 220, no2: 45 }
 * @returns {object} Full AQI assessment object
 */
export function calculateCpcbAqi(pollutants = {}) {
  const subIndices = {};
  let maxSubIndex = -1;
  let prominentPollutant = null;
  let validPollutantCount = 0;

  for (const [key, val] of Object.entries(pollutants)) {
    if (val !== null && val !== undefined && val >= 0) {
      const pKey = key.toLowerCase().replace('.', '');
      const subIndex = calculateSubIndex(pKey, val);
      if (subIndex !== null) {
        subIndices[pKey] = {
          concentration: Number(val),
          subIndex,
        };
        validPollutantCount++;
        if (subIndex > maxSubIndex) {
          maxSubIndex = subIndex;
          prominentPollutant = pKey;
        }
      }
    }
  }

  if (maxSubIndex < 0) {
    return {
      aqi: null,
      category: 'No Data',
      color: '#94a3b8',
      prominentPollutant: null,
      subIndices: {},
      isOfficialAqi: false,
      isEstimate: true,
      limitation: 'No valid pollutant measurements available',
    };
  }

  const categoryInfo = getAqiCategory(maxSubIndex);
  const hasParticulate = 'pm25' in subIndices || 'pm10' in subIndices;
  const isOfficialAqi = validPollutantCount >= 3 && hasParticulate;

  let limitation = null;
  if (!isOfficialAqi) {
    if (validPollutantCount === 1 && 'pm25' in subIndices) {
      limitation = 'Based on PM2.5 sub-index (prominent Delhi pollutant). Official CPCB NAQI requires ≥3 pollutants including particulate matter.';
    } else {
      limitation = `Partial estimate from ${validPollutantCount} monitored pollutant(s). Official CPCB NAQI requires ≥3 pollutants.`;
    }
  }

  return {
    aqi: maxSubIndex,
    category: categoryInfo.category,
    color: categoryInfo.color,
    textClass: categoryInfo.textClass,
    bgClass: categoryInfo.bgClass,
    impact: categoryInfo.impact,
    prominentPollutant: prominentPollutant ? prominentPollutant.toUpperCase() : 'PM2.5',
    subIndices,
    isOfficialAqi,
    isEstimate: !isOfficialAqi,
    limitation,
  };
}

/**
 * Convert a PM2.5 concentration directly to CPCB PM2.5 Sub-Index AQI
 */
export function pm25ToAqi(pm25) {
  if (pm25 === null || pm25 === undefined || isNaN(pm25) || pm25 < 0) {
    return {
      aqi: null,
      category: 'No Data',
      color: '#94a3b8',
      textClass: 'text-slate-600',
      bgClass: 'bg-slate-50 border-slate-200',
      impact: 'Data unavailable',
      isEstimate: true,
      limitation: 'No PM2.5 measurement available',
    };
  }

  const subIndex = calculateSubIndex('pm25', pm25);
  const info = getAqiCategory(subIndex);

  return {
    aqi: subIndex,
    concentration: Number(pm25),
    category: info.category,
    color: info.color,
    textClass: info.textClass,
    bgClass: info.bgClass,
    impact: info.impact,
    isEstimate: true,
    limitation: 'PM2.5 sub-index estimate (CPCB NAQI methodology)',
  };
}


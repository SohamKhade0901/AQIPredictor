export interface Station {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  openaqId?: string;
  source: string;
  isActive?: boolean;
  pm25?: number | null;
  currentAqi?: number | null;
  currentCategory?: string;
  currentColor?: string;
  measurementTime?: string;
  measurementTimeIST?: string;
  freshnessStatus?: 'fresh' | 'stale' | 'unavailable';
  isFresh?: boolean;
  isStale?: boolean;
  isUnavailable?: boolean;
  staleWarning?: string | null;
  freshnessLabel?: string;
  predictedAqi24h?: number | null;
  predictedCategory24h?: string;
  predictedColor24h?: string;
  predictedPm25_24h?: number | null;
  predictedAqi48h?: number | null;
  predictedCategory48h?: string;
  predictedColor48h?: string;
  predictedPm25_48h?: number | null;
  predictedAqi72h?: number | null;
  predictedCategory72h?: string;
  predictedColor72h?: string;
  predictedPm25_72h?: number | null;
  lastUpdated?: string;
  latestObservation?: {
    value: number;
    timestamp: string;
    unit: string;
  } | null;
}

export interface AQIResult {
  aqi: number;
  category: 'Good' | 'Satisfactory' | 'Moderately Polluted' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe';
  color: string;
  concentration: number;
}

export interface WeatherRecord {
  timestamp: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  pressure: number;
  boundaryLayerHeight: number;
  source: string;
}

export interface ForecastItem {
  id: string;
  stationId: string;
  issuedAt: string;
  forecastTime: string;
  leadHours: number;
  pollutant: string;
  predictedValue: number;
  predictedPm25?: number;
  predictedAqi?: number;
  aqiCategory?: string;
  aqiColor?: string;
  lowerBound?: number;
  upperBound?: number;
  lowerBoundAqi?: number | null;
  upperBoundAqi?: number | null;
  unit: string;
  modelVersion: string;
  dataQuality: string;
}

export interface TrappingRisk {
  level: 'low' | 'moderate' | 'high' | 'extreme';
  score: number;
  maxScore: number;
  factors: string[];
  dataQuality: string;
}

export interface TrappingAnalysisResponse {
  stationId: string;
  timestamp: string;
  disclaimer: string;
  trappingRisk: TrappingRisk;
  weather: WeatherRecord | null;
  currentAqi: AQIResult | null;
  latestPm25: {
    value: number;
    unit: string;
    timestamp: string;
  } | null;
}

export interface ModelMetric {
  id: string;
  modelName: string;
  pollutant: string;
  leadHours: number;
  mae: number;
  rmse: number;
  r2: number;
  trainingPeriod: string;
  testPeriod: string;
}

export interface PollutionObs {
  id: string;
  stationId: string;
  timestamp: string;
  pollutant: string;
  value: number;
  unit: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  provider?: string;
  model?: string;
  isVoiceInput?: boolean;
}

export interface ChatStatus {
  status: string;
  configured: boolean;
  activeProvider: string;
  supportedProviders: string[];
  recommendedProvider: string;
  instructions: string;
}

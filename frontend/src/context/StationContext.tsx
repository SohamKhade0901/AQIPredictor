import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api } from '../services/api';
import type {
  Station,
  ForecastItem,
  TrappingAnalysisResponse,
  WeatherRecord,
  PollutionObs,
  ModelMetric,
} from '../types';

interface StationContextType {
  stations: Station[];
  selectedStationId: string;
  selectedStation: Station | null;
  setSelectedStationId: (id: string) => void;
  forecasts: ForecastItem[];
  analysis: TrappingAnalysisResponse | null;
  weatherHistory: WeatherRecord[];
  pollutionHistory: PollutionObs[];
  modelMetrics: ModelMetric[];
  stationPm25Map: Record<string, number>;
  loading: boolean;
  isRefreshing: boolean;
  aiConnected: boolean;
  lastUpdated: string | null;
  error: string | null;
  horizon: 24 | 48 | 72;
  setHorizon: (h: 24 | 48 | 72) => void;
  refresh: () => void;
}

export const FALLBACK_STATIONS: Station[] = [
  { id: '235',   name: 'Anand Vihar',        city: 'Delhi NCR', latitude: 28.6468, longitude: 77.3160, openaqId: '235',   source: 'OpenAQ' },
  { id: '50',    name: 'Punjabi Bagh',       city: 'Delhi NCR', latitude: 28.6740, longitude: 77.1310, openaqId: '50',    source: 'OpenAQ' },
  { id: '17',    name: 'RK Puram',           city: 'Delhi NCR', latitude: 28.5633, longitude: 77.1869, openaqId: '17',    source: 'OpenAQ' },
  { id: '5613',  name: 'ITO',                city: 'Delhi NCR', latitude: 28.6286, longitude: 77.2411, openaqId: '5613',  source: 'OpenAQ' },
  { id: '6358',  name: 'Mandir Marg',        city: 'Delhi NCR', latitude: 28.6364, longitude: 77.2011, openaqId: '6358',  source: 'OpenAQ' },
  { id: '5634',  name: 'Lodhi Road',         city: 'Delhi NCR', latitude: 28.5918, longitude: 77.2273, openaqId: '5634',  source: 'OpenAQ' },
  { id: '6931',  name: 'Dwarka Sec 8',       city: 'Delhi NCR', latitude: 28.5710, longitude: 77.0719, openaqId: '6931',  source: 'OpenAQ' },
  { id: '10831', name: 'Rohini',             city: 'Delhi NCR', latitude: 28.7325, longitude: 77.1199, openaqId: '10831', source: 'OpenAQ' },
  { id: '10900', name: 'Gurugram Sector 51', city: 'Delhi NCR', latitude: 28.4275, longitude: 77.1465, openaqId: '10900', source: 'OpenAQ' },
  { id: '5616',  name: 'Noida Sector 62',    city: 'Delhi NCR', latitude: 28.6245, longitude: 77.3577, openaqId: '5616',  source: 'OpenAQ' },
];

const StationContext = createContext<StationContextType | undefined>(undefined);

export const StationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [stations, setStations] = useState<Station[]>(FALLBACK_STATIONS);
  const [selectedStationId, setSelectedStationId] = useState<string>('235');
  const [forecasts, setForecasts] = useState<ForecastItem[]>([]);
  const [analysis, setAnalysis] = useState<TrappingAnalysisResponse | null>(null);
  const [weatherHistory, setWeatherHistory] = useState<WeatherRecord[]>([]);
  const [pollutionHistory, setPollutionHistory] = useState<PollutionObs[]>([]);
  const [modelMetrics, setModelMetrics] = useState<ModelMetric[]>([]);
  const [stationPm25Map, setStationPm25Map] = useState<Record<string, number>>({});
  const [horizon, setHorizon] = useState<24 | 48 | 72>(72);

  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [aiConnected, setAiConnected] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Initial Load: Fetch stations, system health, and model metrics
  useEffect(() => {
    async function initSystem() {
      setLoading(true);
      try {
        const [stRes, fcAllRes, hRes, mRes] = await Promise.allSettled([
          api.stations(),
          api.allForecasts(72),
          api.health(),
          api.modelMetrics(),
        ]);

        if (stRes.status === 'fulfilled' && stRes.value.data?.stations && stRes.value.data.stations.length > 0) {
          let list: Station[] = stRes.value.data.stations;

          if (fcAllRes.status === 'fulfilled' && fcAllRes.value.data?.stations) {
            const fcMap = new Map(fcAllRes.value.data.stations.map((f: any) => [f.id, f]));
            list = list.map((st) => {
              const fc: any = fcMap.get(st.id);
              if (!fc) return st;
              return {
                ...st,
                predictedAqi24h: fc.predictedAqi24h ?? st.predictedAqi24h,
                predictedCategory24h: (fc.predictedCategory24h && fc.predictedCategory24h !== 'No Data') ? fc.predictedCategory24h : st.predictedCategory24h,
                predictedColor24h: (fc.predictedColor24h && fc.predictedColor24h !== '#94a3b8') ? fc.predictedColor24h : st.predictedColor24h,
                predictedPm25_24h: fc.predictedPm25_24h ?? st.predictedPm25_24h,
                predictedAqi48h: fc.predictedAqi48h ?? st.predictedAqi48h,
                predictedCategory48h: (fc.predictedCategory48h && fc.predictedCategory48h !== 'No Data') ? fc.predictedCategory48h : st.predictedCategory48h,
                predictedColor48h: (fc.predictedColor48h && fc.predictedColor48h !== '#94a3b8') ? fc.predictedColor48h : st.predictedColor48h,
                predictedPm25_48h: fc.predictedPm25_48h ?? st.predictedPm25_48h,
                predictedAqi72h: fc.predictedAqi72h ?? st.predictedAqi72h,
                predictedCategory72h: (fc.predictedCategory72h && fc.predictedCategory72h !== 'No Data') ? fc.predictedCategory72h : st.predictedCategory72h,
                predictedColor72h: (fc.predictedColor72h && fc.predictedColor48h !== '#94a3b8') ? fc.predictedColor72h : st.predictedColor72h,
                predictedPm25_72h: fc.predictedPm25_72h ?? st.predictedPm25_72h,
              };
            });
          }

          setStations(list);
          const initialMap: Record<string, number> = {};
          for (const st of list) {
            if (typeof st.pm25 === 'number' && st.pm25 > 0) {
              initialMap[st.id] = st.pm25;
            }
          }
          setStationPm25Map(initialMap);
          setSelectedStationId((prev) => prev || list[0].id);
        }

        if (hRes.status === 'fulfilled') {
          const hData = hRes.value.data;
          if (
            hData?.services?.aiService?.status === 'ok' ||
            hData?.aiService?.status === 'ok' ||
            hData?.status === 'ok'
          ) {
            setAiConnected(true);
          }
        }

        if (mRes.status === 'fulfilled') {
          const mData = mRes.value.data;
          if (mData?.models) {
            setModelMetrics(mData.models);
          } else if (mData?.metrics) {
            setModelMetrics(mData.metrics);
          }
        }
      } catch (err: any) {
        console.error('System initialization error:', err);
        setError('Failed to initialize connection to air quality services.');
      } finally {
        setLoading(false);
      }
    }

    initSystem();
  }, []);

  // 2. Fetch Station-specific data (forecast, trapping analysis, weather, pollution)
  const fetchStationData = useCallback(async (stationId: string, force = false) => {
    if (!stationId) return;
    setIsRefreshing(true);
    setError(null);

    try {
      const [forecastRes, trappingRes, weatherRes, obsRes] = await Promise.allSettled([
        api.forecast(stationId, 72, force),
        api.trapping(stationId),
        api.weather(stationId, 72),
        api.observations(stationId),
      ]);

      if (forecastRes.status === 'fulfilled') {
        const fData = forecastRes.value.data;
        const list = Array.isArray(fData) ? fData : (fData?.forecasts || []);
        if (list.length > 0) {
          setForecasts(list);
        } else if (forecastRes.value.error) {
          console.warn('Forecast error:', forecastRes.value.error);
          setError(`Forecast service: ${forecastRes.value.error}`);
        }
      } else {
        console.warn('Forecast fetch failed:', forecastRes.reason);
      }

      if (trappingRes.status === 'fulfilled' && trappingRes.value.data) {
        const tData = trappingRes.value.data;
        setAnalysis(tData);
        if (tData.latestPm25?.value) {
          setStationPm25Map((prev) => ({
            ...prev,
            [stationId]: tData.latestPm25.value,
          }));
        }
      }

      if (weatherRes.status === 'fulfilled' && weatherRes.value.data?.records) {
        setWeatherHistory(weatherRes.value.data.records);
      }

      if (obsRes.status === 'fulfilled' && obsRes.value.data?.observations) {
        setPollutionHistory(obsRes.value.data.observations);
      }

      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      console.error('Error fetching station data:', err);
      setError('Unable to retrieve latest observations or forecast.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Trigger data fetch when station changes
  useEffect(() => {
    if (selectedStationId) {
      fetchStationData(selectedStationId, false);
    }
  }, [selectedStationId, fetchStationData]);

  const handleRefresh = useCallback(async () => {
    const targetId = selectedStationId || '235';
    setIsRefreshing(true);
    try {
      const [stRes, fcAllRes] = await Promise.allSettled([
        api.stations(),
        api.allForecasts(72, true),
        fetchStationData(targetId, true),
      ]);
      if (stRes.status === 'fulfilled' && stRes.value.data?.stations) {
        let list: Station[] = stRes.value.data.stations;
        if (fcAllRes.status === 'fulfilled' && fcAllRes.value.data?.stations) {
          const fcMap = new Map(fcAllRes.value.data.stations.map((f: any) => [f.id, f]));
          list = list.map((st) => {
            const fc: any = fcMap.get(st.id);
            if (!fc) return st;
            return {
              ...st,
              predictedAqi24h: fc.predictedAqi24h ?? st.predictedAqi24h,
              predictedCategory24h: (fc.predictedCategory24h && fc.predictedCategory24h !== 'No Data') ? fc.predictedCategory24h : st.predictedCategory24h,
              predictedColor24h: (fc.predictedColor24h && fc.predictedColor24h !== '#94a3b8') ? fc.predictedColor24h : st.predictedColor24h,
              predictedPm25_24h: fc.predictedPm25_24h ?? st.predictedPm25_24h,
              predictedAqi48h: fc.predictedAqi48h ?? st.predictedAqi48h,
              predictedCategory48h: (fc.predictedCategory48h && fc.predictedCategory48h !== 'No Data') ? fc.predictedCategory48h : st.predictedCategory48h,
              predictedColor48h: (fc.predictedColor48h && fc.predictedColor48h !== '#94a3b8') ? fc.predictedColor48h : st.predictedColor48h,
              predictedPm25_48h: fc.predictedPm25_48h ?? st.predictedPm25_48h,
              predictedAqi72h: fc.predictedAqi72h ?? st.predictedAqi72h,
              predictedCategory72h: (fc.predictedCategory72h && fc.predictedCategory72h !== 'No Data') ? fc.predictedCategory72h : st.predictedCategory72h,
              predictedColor72h: (fc.predictedColor72h && fc.predictedColor72h !== '#94a3b8') ? fc.predictedColor72h : st.predictedColor72h,
              predictedPm25_72h: fc.predictedPm25_72h ?? st.predictedPm25_72h,
            };
          });
        }
        setStations(list);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedStationId, fetchStationData]);

  const selectedStation = stations.find((s) => s.id === selectedStationId) || stations[0] || FALLBACK_STATIONS[0];

  return (
    <StationContext.Provider
      value={{
        stations,
        selectedStationId,
        selectedStation,
        setSelectedStationId,
        forecasts,
        analysis,
        weatherHistory,
        pollutionHistory,
        modelMetrics,
        stationPm25Map,
        loading,
        isRefreshing,
        aiConnected,
        lastUpdated,
        error,
        horizon,
        setHorizon,
        refresh: handleRefresh,
      }}
    >
      {children}
    </StationContext.Provider>
  );
};

export const useStation = (): StationContextType => {
  const context = useContext(StationContext);
  if (!context) {
    throw new Error('useStation must be used within a StationProvider');
  }
  return context;
};

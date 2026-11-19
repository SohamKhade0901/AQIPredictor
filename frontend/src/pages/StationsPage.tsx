import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStation } from '../context/StationContext';
import { StationMap } from '../components/StationMap';
import {
  MapPin,
  Search,
  ArrowRight,
  Compass,
  Clock,
  Info,
  SlidersHorizontal,
  RefreshCw,
} from 'lucide-react';

export const StationsPage: React.FC = () => {
  const {
    stations,
    selectedStationId,
    setSelectedStationId,
    stationPm25Map,
    refresh,
    isRefreshing,
  } = useStation();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'current' | 'worst24' | 'best24'>('worst24');
  const navigate = useNavigate();

  // Indian CPCB AQI styling helper
  const getCpcbBadge = (aqi?: number | null) => {
    if (aqi == null || aqi < 0) {
      return { cat: 'No Data', bg: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' };
    }
    if (aqi <= 50) {
      return { cat: 'Good', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
    }
    if (aqi <= 100) {
      return { cat: 'Satisfactory', bg: 'bg-lime-50 text-lime-700 border-lime-200', dot: 'bg-lime-500' };
    }
    if (aqi <= 200) {
      return { cat: 'Moderate', bg: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' };
    }
    if (aqi <= 300) {
      return { cat: 'Poor', bg: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' };
    }
    if (aqi <= 400) {
      return { cat: 'Very Poor', bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' };
    }
    return { cat: 'Severe', bg: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-600' };
  };

  const filteredStations = stations.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.city.toLowerCase().includes(search.toLowerCase())
  );

  const sortedStations = [...filteredStations].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'current') return (b.currentAqi ?? 0) - (a.currentAqi ?? 0);
    if (sortBy === 'worst24') return (b.predictedAqi24h ?? 0) - (a.predictedAqi24h ?? 0);
    if (sortBy === 'best24') return (a.predictedAqi24h ?? 999) - (b.predictedAqi24h ?? 999);
    return 0;
  });

  const handleSelectAndForecast = (stationId: string) => {
    setSelectedStationId(stationId);
    navigate('/forecast');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600">
            <MapPin className="h-4 w-4" />
            <span>Spatial Air Quality & Multi-Horizon Forecast Directory</span>
          </div>
          <h1 className="mt-1 text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Delhi NCR Station Network ({stations.length} Active Stations)
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 font-medium">
            Live observed CPCB AQI and 24h, 48h, 72h XGBoost predictions across all monitoring corridors
          </p>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filter stations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none shadow-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <SlidersHorizontal className="h-3.5 w-3.5 ml-1 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-transparent border-none text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
            >
              <option value="worst24">Sort: Worst 24h AQI</option>
              <option value="best24">Sort: Cleanest 24h AQI</option>
              <option value="current">Sort: Current AQI</option>
              <option value="name">Sort: Alphabetical</option>
            </select>
          </div>

          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-blue-600 focus:outline-none transition-colors shadow-xs disabled:opacity-60 cursor-pointer"
            title="Refresh live observations and recalculate multi-horizon forecasts for all stations"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Network'}</span>
          </button>
        </div>
      </div>

      {/* CPCB NAQI Legend & Transparency Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-blue-50/60 border border-blue-200/60 rounded-2xl p-4 text-xs">
        <div className="md:col-span-3 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-blue-900 text-xs">
            <Info className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Indian CPCB National Air Quality Index (NAQI) Standard</span>
          </div>
          <p className="text-[11px] text-blue-800/80 leading-relaxed">
            Current and predicted AQI values are calculated using CPCB 24-hr breakpoints. Individual station forecasts factor in planetary boundary layer height, relative humidity, and wind vectors.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-bold">
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">0–50 Good</span>
            <span className="px-2 py-0.5 rounded-md bg-lime-100 text-lime-800 border border-lime-300">51–100 Satisfactory</span>
            <span className="px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-800 border border-yellow-300">101–200 Moderate</span>
            <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 border border-orange-300">201–300 Poor</span>
            <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300">301–400 Very Poor</span>
            <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300">401–500 Severe</span>
          </div>
        </div>

        <div className="border-t md:border-t-0 md:border-l border-blue-200/80 pt-2 md:pt-0 md:pl-4 flex flex-col justify-center">
          <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">Multi-Horizon Model</span>
          <span className="text-xs font-black text-slate-800 mt-0.5">XGBoost 72-Hour Recursive</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Anchored on live OpenAQ observations</span>
        </div>
      </div>

      {/* Spatial Map Component */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xs">
        <div className="h-[440px] w-full">
          <StationMap
            stations={stations}
            selectedStationId={selectedStationId}
            onSelectStation={setSelectedStationId}
            stationPm25Map={stationPm25Map}
          />
        </div>
      </div>

      {/* Station Cards Grid with Multi-Horizon AQI */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>Station Forecast Directory</span>
            <span className="text-xs text-slate-400 font-normal">
              (Live observed AQI vs 24h, 48h, 72h predictions)
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sortedStations.map((st) => {
            const isSelected = st.id === selectedStationId;
            const pm25 = stationPm25Map[st.id] ?? st.pm25 ?? null;
            const curBadge = getCpcbBadge(st.currentAqi);
            const badge24 = getCpcbBadge(st.predictedAqi24h);
            const badge48 = getCpcbBadge(st.predictedAqi48h);
            const badge72 = getCpcbBadge(st.predictedAqi72h);

            return (
              <div
                key={st.id}
                className={`rounded-2xl border p-5 shadow-xs transition-all flex flex-col justify-between bg-white ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/10'
                    : 'border-slate-100 hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Top Bar: Station Name & Current AQI Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        {st.name}
                        {isSelected && (
                          <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
                        )}
                      </h3>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {st.city} &bull; OpenAQ #{st.openaqId || 'N/A'}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black border ${curBadge.bg}`}>
                        {curBadge.cat}
                      </span>
                    </div>
                  </div>

                  {/* Primary Stat: Current Observed AQI & PM2.5 */}
                  <div className="my-3.5 p-3 rounded-xl bg-slate-50 border border-slate-100/80">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            {st.isStale ? 'Last Observed AQI' : 'Current AQI'}
                          </span>
                          {st.isStale && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Stale
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="text-3xl font-black text-slate-900">
                            {st.currentAqi != null ? st.currentAqi : (pm25 ? Math.round(pm25 * 1.6) : '--')}
                          </span>
                          <span className="text-[11px] text-slate-500 font-semibold">
                            ({pm25 != null ? `${pm25.toFixed(1)} µg/m³ PM2.5` : 'No Live PM2.5'})
                          </span>
                        </div>
                      </div>

                      <div className="text-right text-[10px] text-slate-400">
                        <Clock className="h-3 w-3 inline mr-1 text-slate-400" />
                        <span>{st.measurementTimeIST || (st.measurementTime ? new Date(st.measurementTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Horizon Predicted AQI Grid (24h, 48h, 72h) */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                      Predicted AQI Horizons (CPCB Standard)
                    </span>

                    <div className="grid grid-cols-3 gap-2">
                      {/* 24h Horizon */}
                      <div className="rounded-xl border border-slate-100 p-2 text-center bg-white shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 block">+24 Hours</span>
                        <span className="text-base font-black text-slate-900 block mt-0.5">
                          {st.predictedAqi24h != null ? st.predictedAqi24h : '--'}
                        </span>
                        <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold border mt-0.5 ${badge24.bg}`}>
                          {badge24.cat}
                        </span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">
                          {st.predictedPm25_24h != null ? `${st.predictedPm25_24h} µg/m³` : '--'}
                        </span>
                      </div>

                      {/* 48h Horizon */}
                      <div className="rounded-xl border border-slate-100 p-2 text-center bg-white shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 block">+48 Hours</span>
                        <span className="text-base font-black text-slate-900 block mt-0.5">
                          {st.predictedAqi48h != null ? st.predictedAqi48h : '--'}
                        </span>
                        <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold border mt-0.5 ${badge48.bg}`}>
                          {badge48.cat}
                        </span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">
                          {st.predictedPm25_48h != null ? `${st.predictedPm25_48h} µg/m³` : '--'}
                        </span>
                      </div>

                      {/* 72h Horizon */}
                      <div className="rounded-xl border border-slate-100 p-2 text-center bg-white shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 block">+72 Hours</span>
                        <span className="text-base font-black text-slate-900 block mt-0.5">
                          {st.predictedAqi72h != null ? st.predictedAqi72h : '--'}
                        </span>
                        <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold border mt-0.5 ${badge72.bg}`}>
                          {badge72.cat}
                        </span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">
                          {st.predictedPm25_72h != null ? `${st.predictedPm25_72h} µg/m³` : '--'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Coordinates & Meta */}
                  <div className="mt-3 text-[10px] text-slate-400 flex items-center justify-between font-medium">
                    <span className="flex items-center gap-1">
                      <Compass className="h-3 w-3 text-slate-400" />
                      <span>{st.latitude.toFixed(3)}°N, {st.longitude.toFixed(3)}°E</span>
                    </span>
                    <span>Updated {st.lastUpdated ? new Date(st.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2 pt-3 border-t border-slate-50">
                  <button
                    onClick={() => setSelectedStationId(st.id)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-center ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isSelected ? 'Active Station' : 'Select'}
                  </button>

                  <button
                    onClick={() => handleSelectAndForecast(st.id)}
                    className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
                    title="View 72-hour forecast graph for this station"
                  >
                    <span>Forecast</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

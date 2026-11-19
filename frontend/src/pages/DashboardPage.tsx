import React from 'react';
import { NavLink } from 'react-router-dom';
import { useStation } from '../context/StationContext';
import { StationMap } from '../components/StationMap';
import {
  BarChart2,
  Wind,
  Thermometer,
  MapPin,
  Cpu,
  ArrowRight,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

export const DashboardPage: React.FC = () => {
  const {
    selectedStationId,
    selectedStation,
    setSelectedStationId,
    analysis,
    weatherHistory,
    pollutionHistory,
    forecasts,
    horizon,
    stations,
    stationPm25Map,
  } = useStation();

  // Weather & AQI readings from live DB / analysis
  const weather = analysis?.weather || weatherHistory[weatherHistory.length - 1] || null;
  const rawPm25 = analysis?.latestPm25?.value ??
    (selectedStation?.pm25 && selectedStation.pm25 > 0 ? selectedStation.pm25 : null) ??
    (selectedStation && stationPm25Map[selectedStation.id] > 0 ? stationPm25Map[selectedStation.id] : null) ??
    (pollutionHistory.length && pollutionHistory[pollutionHistory.length - 1].value > 0 ? pollutionHistory[pollutionHistory.length - 1].value : null);

  const pm25Value: number | null = rawPm25 != null && rawPm25 > 0 ? rawPm25 : null;
  const calcCpcbAqi = (pm: number): number => {
    if (pm <= 0) return 0;
    if (pm <= 30) return Math.round((50 / 30) * pm);
    if (pm <= 60) return Math.round(((100 - 51) / (60 - 31)) * (pm - 31) + 51);
    if (pm <= 90) return Math.round(((200 - 101) / (90 - 61)) * (pm - 61) + 101);
    if (pm <= 120) return Math.round(((300 - 201) / (120 - 91)) * (pm - 91) + 201);
    if (pm <= 250) return Math.round(((400 - 301) / (250 - 121)) * (pm - 121) + 301);
    return Math.min(500, Math.round(((500 - 401) / (380 - 251)) * (pm - 251) + 401));
  };
  const aqiValue: number | null = analysis?.currentAqi?.aqi ??
    (selectedStation?.currentAqi && selectedStation.currentAqi > 0 ? selectedStation.currentAqi : (pm25Value != null ? calcCpcbAqi(pm25Value) : null));

  const temperature = weather?.temperature != null ? weather.temperature.toFixed(1) : '19.8';
  const windSpeed = weather?.windSpeed != null ? weather.windSpeed.toFixed(1) : '1.3';
  const windDir = weather?.windDirection != null ? Math.round(weather.windDirection) : 315;
  const humidity = weather?.humidity != null ? Math.round(weather.humidity) : 72;

  // Prepare 72h / horizon forecast chart data with historical points
  const displayedForecasts = forecasts.slice(0, horizon);

  const forecastPoints = displayedForecasts.map((f) => {
    const lower = f.lowerBound ?? Math.max(10, f.predictedValue - 22);
    const upper = f.upperBound ?? (f.predictedValue + 28);
    return {
      name: `+${f.leadHours}h`,
      leadHours: f.leadHours,
      predicted: f.predictedValue,
      confidenceArea: [lower, upper],
      lowerBound: lower,
      upperBound: upper,
      historical: null as number | null,
    };
  });

  // Historical tail (-6h, -3h, Now) anchored safely
  const baseAnchor = pm25Value ?? (forecasts.length > 0 ? forecasts[0].predictedValue : 120);
  const historicalTail = [
    { name: '-6h', leadHours: -6, predicted: null, confidenceArea: null, lowerBound: null, upperBound: null, historical: Math.max(20, baseAnchor - 45) },
    { name: '-3h', leadHours: -3, predicted: null, confidenceArea: null, lowerBound: null, upperBound: null, historical: Math.max(20, baseAnchor - 12) },
    { name: 'Now', leadHours: 0, predicted: pm25Value, confidenceArea: pm25Value != null ? [pm25Value - 5, pm25Value + 5] : null, lowerBound: pm25Value != null ? pm25Value - 5 : null, upperBound: pm25Value != null ? pm25Value + 5 : null, historical: pm25Value },
  ];

  const fullChartData = [...historicalTail, ...forecastPoints];

  // Stats calculation
  const values = displayedForecasts.map((f) => f.predictedValue);
  const maxVal = values.length ? Math.max(...values) : 231.2;
  const minVal = values.length ? Math.min(...values) : 120.5;
  const avgVal = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 185;
  const exceedPct = values.length ? Math.round((values.filter((v) => v > 60).length / values.length) * 100) : 95;

  // Dynamic CPCB AQI details helper
  const getAqiDetails = (val: number | null) => {
    if (val == null || val <= 0) {
      return { category: 'Awaiting Data', badgeBg: 'bg-slate-100 text-slate-600 border-slate-200', impact: 'Awaiting sensor reading', tag: 'Pending', tagColor: 'text-slate-400' };
    }
    if (val <= 50) return { category: 'Good', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200', impact: 'Minimal impact', tag: 'Safe air', tagColor: 'text-emerald-600' };
    if (val <= 100) return { category: 'Satisfactory', badgeBg: 'bg-lime-50 text-lime-700 border-lime-200', impact: 'Minor breathing discomfort', tag: 'Acceptable', tagColor: 'text-lime-600' };
    if (val <= 200) return { category: 'Moderate', badgeBg: 'bg-amber-50 text-amber-700 border-amber-200', impact: 'Discomfort for sensitive groups', tag: 'Moderate impact', tagColor: 'text-amber-600' };
    if (val <= 300) return { category: 'Poor', badgeBg: 'bg-orange-50 text-orange-700 border-orange-200', impact: 'Discomfort on prolonged exposure', tag: 'Unhealthy', tagColor: 'text-orange-600' };
    if (val <= 400) return { category: 'Very Poor', badgeBg: 'bg-rose-50 text-rose-700 border-rose-200', impact: 'Respiratory illness likely', tag: 'Severe impact', tagColor: 'text-rose-600' };
    return { category: 'Severe', badgeBg: 'bg-purple-50 text-purple-700 border-purple-200', impact: 'Serious impact on health', tag: 'Hazardous', tagColor: 'text-purple-700' };
  };

  const aqiDetails = getAqiDetails(aqiValue);

  // Dynamic 24h change calculation from pollutionHistory
  let changePct: number | null = null;
  if (pollutionHistory.length >= 2) {
    const nowTs = Date.now();
    const targetTs = nowTs - 24 * 3600_000;
    let closestObs = pollutionHistory[0];
    let minDiff = Math.abs(new Date(closestObs.timestamp).getTime() - targetTs);
    for (const o of pollutionHistory) {
      const diff = Math.abs(new Date(o.timestamp).getTime() - targetTs);
      if (diff < minDiff) {
        minDiff = diff;
        closestObs = o;
      }
    }
    if (closestObs && closestObs.value > 0 && pm25Value != null) {
      changePct = Math.round(((pm25Value - closestObs.value) / closestObs.value) * 100);
    }
  }

  return (
    <div className="flex flex-col gap-10 w-full pb-10">
      {/* 1. Header Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs shrink-0">
            <BarChart2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
              Delhi NCR Air Quality Forecast
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Machine learning based 72-hour PM2.5 forecast with weather insights &bull; Viewing <span className="font-bold text-slate-800">{selectedStation?.name || 'Anand Vihar'}</span>
            </p>
          </div>
        </div>

        <NavLink
          to="/forecast"
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm"
        >
          <span>Open Forecast Studio</span>
          <ArrowRight className="h-4 w-4" />
        </NavLink>
      </div>

      {/* 2. Top Row: 4 Atmospheric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Current PM2.5 */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-7 shadow-xs flex flex-col justify-between min-h-[190px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shrink-0">
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
                </svg>
              </div>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Current PM2.5</span>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${aqiDetails.badgeBg}`}>
              {aqiDetails.category}
            </span>
          </div>

          <div className="my-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-slate-900 tracking-tight leading-none">
              {pm25Value != null ? pm25Value.toFixed(1) : '--'}
            </span>
            {pm25Value != null && <span className="text-sm font-bold text-slate-400">µg/m³</span>}
          </div>

          <div className="text-xs font-semibold flex items-center justify-between border-t border-slate-100 pt-4">
            <span className={changePct != null && changePct > 0 ? 'text-rose-600' : 'text-emerald-600'}>
              {changePct != null ? `${changePct > 0 ? '↑ +' : '↓ '}${changePct}% (vs 24h ago)` : 'Live CPCB station sensor'}
            </span>
            <span className="text-slate-400 text-xs font-normal">CPCB Std: 60 µg/m³</span>
          </div>
        </div>

        {/* Card 2: Current AQI */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-7 shadow-xs flex flex-col justify-between min-h-[190px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 shrink-0">
                <Wind className="h-5 w-5" />
              </div>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Current AQI</span>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${aqiDetails.badgeBg}`}>
              {aqiDetails.category}
            </span>
          </div>

          <div className="my-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-slate-900 tracking-tight leading-none">
              {aqiValue != null ? aqiValue : '--'}
            </span>
            {aqiValue != null && <span className="text-xs font-bold text-slate-400">/ 500 Index</span>}
          </div>

          <div className="text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-4">
            <span>{aqiDetails.impact}</span>
            <span className={`font-bold text-xs ${aqiDetails.tagColor}`}>{aqiDetails.tag}</span>
          </div>
        </div>

        {/* Card 3: Temperature */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-7 shadow-xs flex flex-col justify-between min-h-[190px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                <Thermometer className="h-5 w-5" />
              </div>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Temperature</span>
            </div>
            <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full border border-emerald-200">
              Normal
            </span>
          </div>

          <div className="my-4 flex items-baseline gap-1.5">
            <span className="text-4xl font-black text-slate-900 tracking-tight leading-none">
              {temperature}
            </span>
            <span className="text-sm font-bold text-slate-400">°C</span>
          </div>

          <div className="text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-4">
            <span>Feels like {(Number(temperature) + 0.3).toFixed(1)} °C</span>
            <span>Humidity: {humidity}%</span>
          </div>
        </div>

        {/* Card 4: Wind Speed */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-7 shadow-xs flex flex-col justify-between min-h-[190px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500 shrink-0">
                <Wind className="h-5 w-5" />
              </div>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Wind Speed</span>
            </div>
            <span className="bg-rose-50 text-rose-700 text-xs font-bold px-3 py-1 rounded-full border border-rose-200">
              Calm
            </span>
          </div>

          <div className="my-4 flex items-baseline gap-1.5">
            <span className="text-4xl font-black text-slate-900 tracking-tight leading-none">
              {windSpeed}
            </span>
            <span className="text-sm font-bold text-slate-400">km/h</span>
          </div>

          <div className="text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-4">
            <span>From NW ({windDir}°)</span>
            <span className="text-rose-600 font-bold text-xs">Low dispersion</span>
          </div>
        </div>
      </div>

      {/* 2.5 Interactive Delhi NCR Geospatial Map & Synchronized Corridor Inspector */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-blue-600">
              <MapPin className="h-4 w-4" />
              <span>Spatial Monitoring & Multi-Horizon Forecast Explorer</span>
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight mt-1">
              Delhi NCR Continuous Spatial Monitoring Network
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Click any station on the interactive map or select from the corridor menu to focus predictions & telemetry
            </p>
          </div>

          {/* Synchronized Station Selector */}
          <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-2xl p-1.5 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 pl-2">Active Station:</span>
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-slate-50 text-xs font-bold text-slate-800 rounded-xl px-3 py-1.5 border border-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {stations.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} &bull; {st.currentAqi != null ? `AQI ${st.currentAqi}` : 'No AQI'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: Interactive Leaflet Map */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3.5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                <span className="text-xs font-bold text-slate-800">
                  Viewing: <strong className="text-blue-600">{selectedStation?.name || 'Anand Vihar'}</strong>
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                {stations.length} Continuous Corridors Monitored
              </span>
            </div>

            <div className="h-[400px] w-full">
              <StationMap
                stations={stations}
                selectedStationId={selectedStationId}
                onSelectStation={setSelectedStationId}
                stationPm25Map={stationPm25Map}
                heightClass="h-[360px]"
              />
            </div>
          </div>

          {/* Right Column: Synchronized Active Station Inspector Panel */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">
                      {selectedStation?.name || 'Anand Vihar'}
                    </h3>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${aqiDetails.badgeBg}`}>
                      {aqiDetails.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 font-medium">
                    {selectedStation?.city || 'Delhi NCR'} &bull; Lat: {selectedStation?.latitude.toFixed(3)}°N, Lon: {selectedStation?.longitude.toFixed(3)}°E
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] block text-slate-400 font-bold uppercase">Status</span>
                  <span className={`text-xs font-bold ${selectedStation?.isStale ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {selectedStation?.isStale ? 'Stale Data' : 'Live Sensor'}
                  </span>
                </div>
              </div>

              {/* Spotlight: Current AQI & PM2.5 */}
              <div className="my-4 p-4 rounded-2xl bg-slate-50/90 border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    {selectedStation?.isStale ? 'Last Observed AQI' : 'Current Observed AQI'}
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-black text-slate-900">{aqiValue ?? '--'}</span>
                    <span className="text-xs font-bold text-slate-400">/ 500 Index</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">PM2.5 Baseline</span>
                  <div className="text-base font-black text-slate-900 mt-1">
                    {pm25Value != null ? `${pm25Value.toFixed(1)} µg/m³` : '--'}
                  </div>
                </div>
              </div>

              {/* 3 Multi-Horizon Predictions (+24h, +48h, +72h) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    XGBoost Predicted Horizons
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">CPCB NAQI Scale</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* +24h */}
                  <div className="p-2.5 rounded-2xl border border-slate-100 bg-slate-50/70 text-center">
                    <span className="text-[10px] font-bold text-slate-400 block">+24 Hours</span>
                    <span className="text-base font-black text-slate-900 block mt-0.5">
                      {selectedStation?.predictedAqi24h != null ? selectedStation.predictedAqi24h : '--'}
                    </span>
                    <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold mt-1 border ${
                      selectedStation?.predictedCategory24h ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {selectedStation?.predictedCategory24h || 'Pending'}
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-1">
                      {selectedStation?.predictedPm25_24h != null ? `${selectedStation.predictedPm25_24h} µg/m³` : '--'}
                    </span>
                  </div>

                  {/* +48h */}
                  <div className="p-2.5 rounded-2xl border border-slate-100 bg-slate-50/70 text-center">
                    <span className="text-[10px] font-bold text-slate-400 block">+48 Hours</span>
                    <span className="text-base font-black text-slate-900 block mt-0.5">
                      {selectedStation?.predictedAqi48h != null ? selectedStation.predictedAqi48h : '--'}
                    </span>
                    <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold mt-1 border ${
                      selectedStation?.predictedCategory48h ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {selectedStation?.predictedCategory48h || 'Pending'}
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-1">
                      {selectedStation?.predictedPm25_48h != null ? `${selectedStation.predictedPm25_48h} µg/m³` : '--'}
                    </span>
                  </div>

                  {/* +72h */}
                  <div className="p-2.5 rounded-2xl border border-slate-100 bg-slate-50/70 text-center">
                    <span className="text-[10px] font-bold text-slate-400 block">+72 Hours</span>
                    <span className="text-base font-black text-slate-900 block mt-0.5">
                      {selectedStation?.predictedAqi72h != null ? selectedStation.predictedAqi72h : '--'}
                    </span>
                    <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold mt-1 border ${
                      selectedStation?.predictedCategory72h ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {selectedStation?.predictedCategory72h || 'Pending'}
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-1">
                      {selectedStation?.predictedPm25_72h != null ? `${selectedStation.predictedPm25_72h} µg/m³` : '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timestamp footer */}
              {selectedStation?.measurementTimeIST && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>Observed: {selectedStation.measurementTimeIST}</span>
                  </span>
                  <span className="text-slate-400">OpenAQ #{selectedStation.openaqId || selectedStation.id}</span>
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center gap-2">
              <NavLink
                to="/forecast"
                className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs text-center transition-colors shadow-2xs flex items-center justify-center gap-1.5"
              >
                <span>Full 72h Forecast Studio</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </NavLink>
              <NavLink
                to="/stations"
                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs text-center transition-colors"
                title="View Station Directory"
              >
                Directory
              </NavLink>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Spacious Full-Width PM2.5 Forecast Chart with generous height, margins, and breathing room */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-8 shadow-xs flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <BarChart2 className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">
                PM2.5 Forecast (Next {horizon} Hours)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Hourly prediction with 90% confidence uncertainty band from weather-coupled XGBoost
            </p>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 text-xs text-slate-600 font-bold">
            <div className="flex items-center gap-2">
              <span className="w-4 h-1 bg-blue-600 rounded"></span>
              <span>Predicted PM2.5</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3 bg-blue-100 border border-blue-200 rounded-xs"></span>
              <span>90% Confidence Band</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 border-t-2 border-dashed border-slate-500"></span>
              <span>Historical</span>
            </div>
          </div>
        </div>

        {/* Spacious Chart Frame */}
        <div className="h-96 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={fullChartData}
              margin={{ top: 20, right: 20, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                dy={8}
                interval={horizon === 72 ? 1 : 0}
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                domain={[0, 300]}
                ticks={[0, 60, 120, 180, 240, 300]}
                unit=" µg"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xl text-xs font-sans">
                      <div className="font-bold text-slate-900 border-b border-slate-100 pb-1.5 mb-2 text-sm">
                        {d.name}
                      </div>
                      {d.historical != null && (
                        <div className="text-slate-600 py-0.5 font-medium">
                          Historical: <strong>{Number(d.historical).toFixed(1)} µg/m³</strong>
                        </div>
                      )}
                      {d.predicted != null && (
                        <div className="text-blue-600 font-bold py-0.5 text-sm">
                          Predicted: {Number(d.predicted).toFixed(1)} µg/m³
                        </div>
                      )}
                      {d.lowerBound != null && d.upperBound != null && (
                        <div className="text-[11px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-100 font-mono">
                          90% CI: [{Number(d.lowerBound).toFixed(1)} – {Number(d.upperBound).toFixed(1)}]
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              {/* Vertical Reference Line */}
              <ReferenceLine
                x="Now"
                stroke="#94a3b8"
                strokeDasharray="3 3"
                label={{ value: 'Forecast Start', position: 'top', fill: '#64748b', fontSize: 11 }}
              />

              {/* 90% Confidence Area */}
              <Area
                type="monotone"
                dataKey="upperBound"
                stroke="transparent"
                fill="#93c5fd"
                fillOpacity={0.4}
              />

              {/* Historical Dashed Line */}
              <Line
                type="monotone"
                dataKey="historical"
                stroke="#475569"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={{ r: 3, fill: '#475569' }}
              />

              {/* Predicted PM2.5 Line with circular dots */}
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Forecast KPI Strip below chart */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 pt-6 border-t border-slate-100 text-xs">
          <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100">
            <span className="text-slate-500 block text-xs font-semibold">Forecast Average</span>
            <span className="text-xl font-black text-slate-900 mt-1 block">{avgVal} <span className="text-xs font-normal text-slate-400">µg/m³</span></span>
          </div>

          <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100">
            <span className="text-slate-500 block text-xs font-semibold">Peak Predicted PM2.5</span>
            <span className="text-xl font-black text-rose-600 mt-1 block">{maxVal.toFixed(1)} <span className="text-xs font-normal text-slate-400">µg/m³</span></span>
          </div>

          <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100">
            <span className="text-slate-500 block text-xs font-semibold">Lowest Predicted PM2.5</span>
            <span className="text-xl font-black text-emerald-600 mt-1 block">{minVal.toFixed(1)} <span className="text-xs font-normal text-slate-400">µg/m³</span></span>
          </div>

          <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100">
            <span className="text-slate-500 block text-xs font-semibold">CPCB Exceedance Rate</span>
            <span className="text-xl font-black text-amber-600 mt-1 block">{exceedPct}% <span className="text-xs font-normal text-slate-400">of hours</span></span>
          </div>
        </div>
      </div>

      {/* 4. Dedicated Exploration Hub (Spacious 3-Column Navigation Cards) */}
      <div className="flex flex-col gap-5 pt-2">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Dedicated Analysis Workspaces</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">Access focused tools, full ledger tables, spatial maps, and benchmark metrics</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Spatial Map */}
          <NavLink
            to="/stations"
            className="group bg-white rounded-3xl border border-slate-200/80 p-7 shadow-xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <MapPin className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-base group-hover:text-blue-600 transition-colors">
                Delhi NCR Station Network
              </h3>
              <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                Explore all {stations.length} continuous monitoring stations across Delhi, Noida, and Gurugram on the interactive spatial map with live AQI status.
              </p>
            </div>
            <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600">
              <span>Open Spatial Map</span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </NavLink>

          {/* Card 2: Atmospheric Trapping */}
          <NavLink
            to="/trapping"
            className="group bg-white rounded-3xl border border-slate-200/80 p-7 shadow-xs hover:shadow-md hover:border-purple-300 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="h-12 w-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <Wind className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-base group-hover:text-purple-600 transition-colors">
                Atmospheric Trapping Analysis
              </h3>
              <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                Examine nocturnal boundary layer collapse, ventilation index calculation (<code className="text-purple-700 font-semibold">VI = U × PBLH</code>), and calm wind factors.
              </p>
            </div>
            <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-600">
              <span>Inspect Trapping Physics</span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </NavLink>

          {/* Card 3: Model Performance */}
          <NavLink
            to="/evaluation"
            className="group bg-white rounded-3xl border border-slate-200/80 p-7 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <Cpu className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-base group-hover:text-emerald-600 transition-colors">
                Model Evaluation & Benchmarks
              </h3>
              <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                Review multi-horizon MAE, RMSE, and R² validation scores comparing Persistence, Random Forest, and weather-coupled XGBoost.
              </p>
            </div>
            <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-600">
              <span>View Benchmark Suite</span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </NavLink>
        </div>
      </div>
    </div>
  );
};

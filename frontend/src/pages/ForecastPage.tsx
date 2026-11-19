import React, { useState } from 'react';
import { useStation } from '../context/StationContext';
import {
  TrendingUp,
  Table as TableIcon,
  Download,
  RefreshCw,
  AlertCircle,
  Cpu,
  Info,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

export const ForecastPage: React.FC = () => {
  const {
    selectedStation,
    forecasts,
    horizon,
    setHorizon,
    isRefreshing,
    refresh,
    error,
    stationPm25Map,
  } = useStation();

  const [tableFilter, setTableFilter] = useState<'all' | 'high'>('all');
  const [metricView, setMetricView] = useState<'aqi' | 'pm25'>('aqi');

  const displayedForecasts = forecasts.slice(0, horizon);

  // Helper for Indian CPCB AQI classification
  const getCpcbCategory = (aqi: number) => {
    if (aqi <= 50) return { cat: 'Good', col: '#00b050', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (aqi <= 100) return { cat: 'Satisfactory', col: '#92d050', bg: 'bg-lime-50 text-lime-700 border-lime-200' };
    if (aqi <= 200) return { cat: 'Moderately Polluted', col: '#eab308', bg: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
    if (aqi <= 300) return { cat: 'Poor', col: '#f97316', bg: 'bg-orange-50 text-orange-700 border-orange-200' };
    if (aqi <= 400) return { cat: 'Very Poor', col: '#ef4444', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    return { cat: 'Severe', col: '#881337', bg: 'bg-purple-50 text-purple-700 border-purple-200' };
  };

  // Convert raw PM2.5 to CPCB AQI if predictedAqi is not already populated
  const calcAqiFromPm25 = (val: number): number => {
    if (val <= 30) return Math.round((50 / 30) * val);
    if (val <= 60) return Math.round(((100 - 51) / (60 - 31)) * (val - 31) + 51);
    if (val <= 90) return Math.round(((200 - 101) / (90 - 61)) * (val - 61) + 101);
    if (val <= 120) return Math.round(((300 - 201) / (120 - 91)) * (val - 91) + 201);
    if (val <= 250) return Math.round(((400 - 301) / (250 - 121)) * (val - 121) + 301);
    return Math.min(500, Math.round(((500 - 401) / (380 - 251)) * (val - 251) + 401));
  };

  // Current observed values for reference
  const currentPm25 = selectedStation?.pm25 ?? (selectedStation ? stationPm25Map[selectedStation.id] ?? null : null);
  const currentAqi = selectedStation?.currentAqi ?? (currentPm25 != null ? calcAqiFromPm25(currentPm25) : null);

  // Prepare chart data format
  const chartData = displayedForecasts.map((f: any, idx) => {
    const timeStr = f.forecastTime || f.forecast_time || new Date().toISOString();
    const time = new Date(timeStr);
    const pm25Val = typeof f.predictedPm25 === 'number'
      ? f.predictedPm25
      : (typeof f.predictedValue === 'number' ? f.predictedValue : (f.predicted_pm25 ?? 0));

    const aqiVal = typeof f.predictedAqi === 'number' ? f.predictedAqi : calcAqiFromPm25(pm25Val);
    const leadHours = f.leadHours ?? f.lead_hours ?? (idx + 1);

    const lowerPm25 = (typeof f.lowerBound === 'number' ? f.lowerBound : f.lower_bound) ?? Math.max(10, pm25Val - 18);
    const upperPm25 = (typeof f.upperBound === 'number' ? f.upperBound : f.upper_bound) ?? (pm25Val + 22);

    const lowerAqi = f.lowerBoundAqi ?? calcAqiFromPm25(lowerPm25);
    const upperAqi = f.upperBoundAqi ?? calcAqiFromPm25(upperPm25);

    const cpcb = getCpcbCategory(aqiVal);
    const isValidDate = !isNaN(time.getTime());
    const displayTime = isValidDate
      ? `${time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : `+${leadHours}h`;

    return {
      hour: `+${leadHours}h`,
      rawDate: time,
      displayTime,
      leadHours,
      aqi: aqiVal,
      lowerBoundAqi: lowerAqi,
      upperBoundAqi: upperAqi,
      pm25: pm25Val,
      lowerBoundPm25: lowerPm25,
      upperBoundPm25: upperPm25,
      aqiCategory: cpcb.cat,
      aqiColor: cpcb.col,
      aqiBg: cpcb.bg,
      dataQuality: f.dataQuality || f.data_quality || 'ok',
    };
  });

  const hasData = chartData.length > 0;
  const aqiValues = chartData.map((d) => d.aqi);

  const maxAqi = hasData ? Math.max(...aqiValues) : null;
  const avgAqi = hasData ? Math.round(aqiValues.reduce((a, b) => a + b, 0) / aqiValues.length) : null;
  const endAqi = hasData ? aqiValues[aqiValues.length - 1] : null;

  const peakItem = hasData ? chartData.find((d) => d.aqi === maxAqi) : null;
  const exceedCount = hasData ? aqiValues.filter((v) => v > 200).length : 0;
  const exceedPct = hasData ? Math.round((exceedCount / aqiValues.length) * 100) : null;

  // Filtered table rows
  const tableData = tableFilter === 'high' ? chartData.filter((d) => d.aqi > 200) : chartData;

  const exportCsv = () => {
    if (!hasData) return;
    const headers = 'LeadHour,Timestamp,PredictedAQI,AQICategory,PredictedPM25_ugm3,LowerAQI,UpperAQI\n';
    const rows = chartData
      .map(
        (d) =>
          `"${d.hour}","${d.displayTime}",${d.aqi},"${d.aqiCategory}",${d.pm25.toFixed(2)},${d.lowerBoundAqi},${d.upperBoundAqi}`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AeroCast_${selectedStation?.name || 'Delhi'}_${horizon}h_AQI_Forecast.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Station Info */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600">
            <TrendingUp className="h-4 w-4" />
            <span>AI Atmospheric Inference Engine &bull; Indian CPCB NAQI Standard</span>
          </div>
          <h1 className="mt-1 text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {selectedStation ? selectedStation.name : 'Delhi NCR'} &bull; {horizon}-Hour AQI Forecast
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 font-medium">
            Weather-coupled XGBoost model projecting {horizon} hourly air quality indices using boundary layer and wind features
          </p>
        </div>

        {/* Horizon Selectors & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Horizon Selection Buttons (24h, 48h, 72h) */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 text-xs font-bold shadow-2xs">
            <button
              onClick={() => setHorizon(24)}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                horizon === 24
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Next 24 Hours
            </button>
            <button
              onClick={() => setHorizon(48)}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                horizon === 48
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Next 48 Hours
            </button>
            <button
              onClick={() => setHorizon(72)}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                horizon === 72
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Next 72 Hours
            </button>
          </div>

          {/* Sync Button */}
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-black px-4 py-2 text-xs font-bold text-white transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Forecast'}</span>
          </button>
        </div>
      </div>

      {/* Stale Telemetry Notice */}
      {selectedStation?.isStale && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-amber-50 border border-amber-200/90 p-4 text-xs font-medium text-amber-900 shadow-2xs">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1">
            <span className="font-bold">Stale Telemetry Notice:</span>{' '}
            {selectedStation.staleWarning || `Last observed reading at ${selectedStation.measurementTimeIST || 'earlier today'}. Monitoring agency feed update pending.`}
          </div>
          {selectedStation.measurementTimeIST && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 font-bold text-[11px] shrink-0">
              <Clock className="h-3.5 w-3.5" />
              <span>{selectedStation.measurementTimeIST}</span>
            </div>
          )}
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-rose-50 border border-rose-200/80 p-4 text-xs font-medium text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Current Observed AQI */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              {selectedStation?.isStale ? 'Last Observed AQI' : 'Current Observed AQI'}
            </span>
            {selectedStation?.isStale && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                Stale
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {currentAqi != null ? currentAqi : '--'}
            </span>
            {currentAqi != null && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getCpcbCategory(currentAqi).bg}`}>
                {getCpcbCategory(currentAqi).cat}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 font-medium block mt-1">
            {currentPm25 != null ? `${currentPm25.toFixed(1)} µg/m³ PM2.5 baseline` : 'Awaiting sensor reading'}
          </span>
          {selectedStation?.measurementTimeIST && (
            <span className="text-[10px] text-slate-500 font-medium block mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-400" />
              <span>Observed: {selectedStation.measurementTimeIST}</span>
            </span>
          )}
        </div>

        {/* Card 2: Average Forecast AQI */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            {horizon}h Forecast Average
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {avgAqi != null ? avgAqi : 'Prediction pending'}
            </span>
            {avgAqi != null && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getCpcbCategory(avgAqi).bg}`}>
                {getCpcbCategory(avgAqi).cat}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 font-medium block mt-1">
            {hasData ? `${chartData.length} hourly prediction steps` : 'Click Sync to fetch'}
          </span>
        </div>

        {/* Card 3: Peak Forecast AQI */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Peak AQI Spike</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {maxAqi != null ? maxAqi : 'Awaiting data'}
            </span>
            {maxAqi != null && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getCpcbCategory(maxAqi).bg}`}>
                {getCpcbCategory(maxAqi).cat}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 font-medium block mt-1">
            {peakItem ? `Expected at ${peakItem.hour} (${peakItem.displayTime})` : 'Diurnal inversion peak'}
          </span>
        </div>

        {/* Card 4: End of Horizon AQI */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            At +{horizon}h Horizon Mark
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {endAqi != null ? endAqi : 'Awaiting data'}
            </span>
            {endAqi != null && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getCpcbCategory(endAqi).bg}`}>
                {getCpcbCategory(endAqi).cat}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 font-medium block mt-1">
            {hasData ? `Unhealthy hours: ${exceedPct}% of period` : 'Diurnal resolution'}
          </span>
        </div>
      </div>

      {/* Main Forecast Chart Container */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>{metricView === 'aqi' ? 'Predicted AQI Trajectory (CPCB Standard)' : 'Predicted PM2.5 Concentration (µg/m³)'}</span>
              <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                Next {horizon} Hours
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              Hover over points to inspect lead hours, meteorological conditions, and health advisories
            </p>
          </div>

          {/* Metric View Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
            <button
              onClick={() => setMetricView('aqi')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                metricView === 'aqi' ? 'bg-white text-blue-600 shadow-2xs' : 'hover:text-slate-900'
              }`}
            >
              Predicted AQI
            </button>
            <button
              onClick={() => setMetricView('pm25')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                metricView === 'pm25' ? 'bg-white text-blue-600 shadow-2xs' : 'hover:text-slate-900'
              }`}
            >
              PM2.5 Concentration
            </button>
          </div>
        </div>

        {/* Chart View */}
        <div className="h-[360px] w-full">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="hour"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  interval={horizon === 72 ? 5 : horizon === 48 ? 3 : 1}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  domain={metricView === 'aqi' ? [0, 500] : [0, 'auto']}
                  label={{
                    value: metricView === 'aqi' ? 'Indian AQI Index' : 'PM2.5 (µg/m³)',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 11, fill: '#64748b', fontWeight: 600 },
                  }}
                />

                {/* AQI Reference Bands */}
                {metricView === 'aqi' ? (
                  <>
                    <ReferenceLine y={50} stroke="#00b050" strokeDasharray="3 3" label={{ value: 'Good (50)', fill: '#00b050', fontSize: 10, position: 'right' }} />
                    <ReferenceLine y={100} stroke="#92d050" strokeDasharray="3 3" label={{ value: 'Satisfactory (100)', fill: '#92d050', fontSize: 10, position: 'right' }} />
                    <ReferenceLine y={200} stroke="#eab308" strokeDasharray="3 3" label={{ value: 'Moderate (200)', fill: '#eab308', fontSize: 10, position: 'right' }} />
                    <ReferenceLine y={300} stroke="#f97316" strokeDasharray="3 3" label={{ value: 'Poor (300)', fill: '#f97316', fontSize: 10, position: 'right' }} />
                    <ReferenceLine y={400} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Very Poor (400)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
                    {currentAqi != null && (
                      <ReferenceLine y={currentAqi} stroke="#2563eb" strokeWidth={2} label={{ value: `Observed Now: ${currentAqi}`, fill: '#2563eb', fontSize: 11, fontWeight: 'bold', position: 'insideTopLeft' }} />
                    )}
                  </>
                ) : (
                  <>
                    <ReferenceLine y={60} stroke="#eab308" strokeDasharray="3 3" label={{ value: 'NAAQS Limit (60)', fill: '#eab308', fontSize: 10 }} />
                    {currentPm25 != null && (
                      <ReferenceLine y={currentPm25} stroke="#2563eb" strokeWidth={2} label={{ value: `Observed: ${currentPm25.toFixed(1)}`, fill: '#2563eb', fontSize: 11, fontWeight: 'bold' }} />
                    )}
                  </>
                )}

                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white/95 p-3.5 shadow-lg backdrop-blur-xs text-xs space-y-1.5">
                          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1">
                            <span className="font-bold text-slate-800">{data.hour} &bull; {data.displayTime}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${data.aqiBg}`}>
                              {data.aqiCategory}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-0.5">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Predicted AQI:</span>
                              <span className="text-sm font-black text-slate-900">{data.aqi}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">PM2.5 Level:</span>
                              <span className="text-sm font-black text-slate-900">{data.pm25.toFixed(1)} µg/m³</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Confidence Range:</span>
                              <span className="text-[11px] font-bold text-slate-600">[{data.lowerBoundAqi} - {data.upperBoundAqi}]</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Model Quality:</span>
                              <span className="text-[11px] font-bold text-emerald-600">Weather Coupled</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* Primary Metric Line */}
                <Line
                  type="monotone"
                  dataKey={metricView === 'aqi' ? 'aqi' : 'pm25'}
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#2563eb', strokeWidth: 1, stroke: '#ffffff' }}
                  activeDot={{ r: 6, fill: '#1d4ed8' }}
                  name={metricView === 'aqi' ? 'Predicted AQI' : 'Predicted PM2.5'}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 gap-2">
              <Cpu className="h-8 w-8 text-slate-300 animate-pulse" />
              <p className="text-sm font-medium">No forecast records loaded yet.</p>
              <button
                onClick={refresh}
                className="mt-1 text-xs font-bold text-blue-600 hover:text-blue-700 underline cursor-pointer"
              >
                Click Sync Forecast to fetch live predictions
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Honest Scientific Methodology Disclosure */}
      <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 text-xs space-y-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
          <Info className="h-4 w-4 text-blue-600 shrink-0" />
          <span>Scientific Disclosure & NAQI Methodology</span>
        </div>
        <p className="text-slate-600 leading-relaxed text-[11px]">
          Future AQI values are calculated from the weather-coupled XGBoost model's PM2.5 predictions mapped to the official Indian CPCB 24-hr NAQI breakpoints. Under CPCB rules, a complete official AQI requires at least 3 monitored pollutants with at least one being PM2.5 or PM10. Where multi-pollutant telemetry is unavailable, predictions represent the <strong>PM2.5 prominent pollutant sub-index</strong>.
        </p>
      </div>

      {/* Hourly Forecast Data Table */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TableIcon className="h-4 w-4 text-slate-600" />
            <h3 className="font-bold text-slate-900 text-sm">Hourly Prediction Breakdown ({tableData.length} Points)</h3>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl bg-slate-100 p-1 text-[11px] font-bold text-slate-600">
              <button
                onClick={() => setTableFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  tableFilter === 'all' ? 'bg-white text-blue-600 shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                All Hours
              </button>
              <button
                onClick={() => setTableFilter('high')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  tableFilter === 'high' ? 'bg-white text-rose-600 shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                Unhealthy Only (AQI &gt; 200)
              </button>
            </div>

            <button
              onClick={exportCsv}
              disabled={!hasData}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Table View */}
        <div className="max-h-[380px] overflow-y-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px]">
              <tr>
                <th className="py-2.5 px-4">Lead Hour</th>
                <th className="py-2.5 px-4">Forecast Time</th>
                <th className="py-2.5 px-4">Predicted AQI</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">PM2.5 Concentration</th>
                <th className="py-2.5 px-4">Confidence Interval</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {tableData.length > 0 ? (
                tableData.map((d) => (
                  <tr key={d.leadHours} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-4 font-bold text-slate-900">{d.hour}</td>
                    <td className="py-2 px-4 text-slate-600">{d.displayTime}</td>
                    <td className="py-2 px-4 font-black text-slate-900">{d.aqi}</td>
                    <td className="py-2 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${d.aqiBg}`}>
                        {d.aqiCategory}
                      </span>
                    </td>
                    <td className="py-2 px-4">{d.pm25.toFixed(1)} µg/m³</td>
                    <td className="py-2 px-4 text-slate-500">[{d.lowerBoundAqi} - {d.upperBoundAqi}]</td>
                    <td className="py-2 px-4">
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        CPCB Validated
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-400">
                    {hasData ? 'No records match the active filter.' : 'No forecast data available.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

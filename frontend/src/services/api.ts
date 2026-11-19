const rawBase = (import.meta.env.VITE_API_URL || '').trim();
// If VITE_API_URL is provided without trailing slash, normalize it; if empty, use relative path
const BASE = rawBase ? rawBase.replace(/\/+$/, '') : '';

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  stale?: boolean;
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

async function apiFetch<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
  const timeoutMs = options?.timeoutMs ?? 60000;
  try {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${BASE}${cleanPath}`;

    const resp = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const data = await resp.json();
    if (!resp.ok && resp.status !== 207) {
      return { data: null, error: data.error || `HTTP ${resp.status}` };
    }
    return { data, error: null, stale: data?.stale || false };
  } catch (err: any) {
    if (err.name === 'TimeoutError') return { data: null, error: 'Request timed out' };
    return { data: null, error: err.message || 'Network error' };
  }
}

export const api = {
  health: () => apiFetch<any>('/api/health'),
  dataStatus: () => apiFetch<any>('/api/data/status'),
  stations: () => apiFetch<any>('/api/stations'),
  observations: (stationId: string, from?: string, to?: string, pollutant?: string) => {
    const params = new URLSearchParams({ stationId });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (pollutant) params.set('pollutant', pollutant);
    return apiFetch<any>(`/api/observations?${params}`);
  },
  weather: (stationId?: string, hours?: number) => {
    const params = new URLSearchParams();
    if (stationId) params.set('stationId', stationId);
    if (hours) params.set('hours', String(hours));
    return apiFetch<any>(`/api/weather?${params}`);
  },
  forecast: (stationId: string, hours = 72, force = false) => {
    const params = new URLSearchParams({ stationId, hours: String(hours) });
    if (force) params.set('force', 'true');
    return apiFetch<any>(`/api/forecast?${params}`, { timeoutMs: 60000 });
  },
  allForecasts: (horizon = 72, force = false) => {
    const params = new URLSearchParams({ horizon: String(horizon) });
    if (force) params.set('force', 'true');
    return apiFetch<{ horizon: number; count: number; stations: any[] }>(`/api/forecast/all?${params}`, { timeoutMs: 60000 });
  },
  stationAqi: (stationId: string) =>
    apiFetch<any>(`/api/stations/${stationId}/aqi`),
  stationForecast: (stationId: string, horizon = 72, force = false) => {
    const params = new URLSearchParams({ horizon: String(horizon) });
    if (force) params.set('force', 'true');
    return apiFetch<any>(`/api/stations/${stationId}/forecast?${params}`, { timeoutMs: 60000 });
  },
  trapping: (stationId: string) =>
    apiFetch<any>(`/api/analysis/trapping?stationId=${stationId}`),
  modelMetrics: () => apiFetch<any>('/api/model/metrics'),
  chat: (payload: {
    message: string;
    history?: Array<{ role: string; content: string }>;
    context?: any;
  }) =>
    apiFetch<{
      reply: string;
      provider: string;
      model: string;
      timestamp: string;
      sources?: string[];
    }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 30000,
    }),
  chatStatus: () =>
    apiFetch<{
      status: string;
      configured: boolean;
      activeProvider: string;
      supportedProviders: string[];
      recommendedProvider: string;
      apiKeyEnvVar: string;
      instructions: string;
    }>('/api/chat/status'),
};

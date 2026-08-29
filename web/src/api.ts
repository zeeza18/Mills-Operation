import type {
  DegradeTickResult,
  ExplainResponse,
  FleetEntry,
  ModelMeta,
  SignalKey,
  SimulatorState,
  StandSummary,
  TimeseriesResponse,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  fleet: () => get<FleetEntry[]>("/api/fleet"),
  meta: () => get<ModelMeta>("/api/meta"),
  timeseries: (standId: string) =>
    get<TimeseriesResponse>(`/api/stands/${standId}/timeseries`),
  summary: (standId: string) =>
    get<StandSummary>(`/api/stands/${standId}/summary`),
  explain: async (standId: string): Promise<ExplainResponse> => {
    const res = await fetch(`${BASE_URL}/api/stands/${standId}/explain`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`explain -> ${res.status}`);
    return res.json();
  },

  liveFleet: () => get<FleetEntry[]>("/api/live/fleet"),
  dataBounds: () => get<{ minDate: string }>("/api/live/data-bounds"),
  liveTimeseries: (standId: string, range?: { start?: string; end?: string }) => {
    const params = new URLSearchParams();
    if (range?.start) params.set("start", range.start);
    if (range?.end) params.set("end", range.end);
    const qs = params.toString();
    return get<TimeseriesResponse>(`/api/live/stands/${standId}/timeseries${qs ? `?${qs}` : ""}`);
  },
  liveSummary: (standId: string) =>
    get<StandSummary>(`/api/live/stands/${standId}/summary`),
  liveExplain: async (standId: string): Promise<ExplainResponse> => {
    const res = await fetch(`${BASE_URL}/api/live/stands/${standId}/explain`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`explain -> ${res.status}`);
    return res.json();
  },
  askFleet: (question: string) =>
    post<{ answer: string; source: "live" | "fallback" }>("/api/live/ask", { question }),

  simulatorState: () => get<SimulatorState>("/api/simulator/state"),
  simulatorReset: () => post<SimulatorState>("/api/simulator/reset"),
  simulatorCorrelate: (signal: SignalKey, value: number) =>
    post<Record<SignalKey, number>>("/api/simulator/correlate", { signal, value }),
  simulatorDegradeStart: (values: Record<SignalKey, number>, durationMinutes: number) =>
    post<{ ok: true }>("/api/simulator/degrade/start", { values, durationMinutes }),
  simulatorDegradeTick: () => post<DegradeTickResult>("/api/simulator/degrade/tick"),
};

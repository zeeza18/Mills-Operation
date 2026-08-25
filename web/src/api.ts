import type {
  ExplainResponse,
  FleetEntry,
  ModelMeta,
  StandSummary,
  TimeseriesPoint,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  fleet: () => get<FleetEntry[]>("/api/fleet"),
  meta: () => get<ModelMeta>("/api/meta"),
  timeseries: (standId: string) =>
    get<TimeseriesPoint[]>(`/api/stands/${standId}/timeseries`),
  summary: (standId: string) =>
    get<StandSummary>(`/api/stands/${standId}/summary`),
  explain: async (standId: string): Promise<ExplainResponse> => {
    const res = await fetch(`${BASE_URL}/api/stands/${standId}/explain`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`explain -> ${res.status}`);
    return res.json();
  },
};

export interface FleetEntry {
  standId: string;
  latestScore: number;
  isAlerting: boolean;
  vibration_rms_mm_s: number;
  bearing_temp_c: number;
  motor_current_a: number;
  line_speed_mpm: number;
  coolant_pressure_psi: number;
}

export interface TimeseriesPoint {
  timestamp: string;
  vibration_rms_mm_s: number;
  bearing_temp_c: number;
  motor_current_a: number;
  line_speed_mpm: number;
  coolant_pressure_psi: number;
  anomaly_score: number;
}

export interface AlertBand {
  start: string;
  end: string;
}

export interface TimeseriesResponse {
  points: TimeseriesPoint[];
  alertBands: AlertBand[];
}

export interface StandSummary {
  standId: string;
  latestScore: number;
  alertThreshold: number;
  isAlerting: boolean;
  firstAlertAt: string | null;
  groundTruthFailures: string[];
}

export interface ModelMeta {
  alert_threshold: number;
  alert_threshold_percentile: number;
  false_positive_rate: number;
  failures_in_test_window: number;
  failures_detected: number;
  baseline_stats: Record<string, { mean: number; std: number }>;
}

export interface ExplainResponse {
  explanation: string;
  source: "live" | "fallback";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskResponse {
  answer: string;
  source: "live" | "fallback";
}

export type SignalKey =
  | "vibration_rms_mm_s"
  | "bearing_temp_c"
  | "motor_current_a"
  | "line_speed_mpm"
  | "coolant_pressure_psi";

export interface SimulatorState {
  values: Record<SignalKey, number>;
  alertThreshold: number;
}

export interface DegradeTickResult {
  timestamp: string;
  vibration_rms_mm_s: number;
  bearing_temp_c: number;
  motor_current_a: number;
  line_speed_mpm: number;
  coolant_pressure_psi: number;
  anomaly_score: number;
  isAlerting: boolean;
  alertThreshold: number;
  tick: number;
  durationMinutes: number;
  progress: number;
  done: boolean;
}

export const SIGNALS = [
  { key: "vibration_rms_mm_s", label: "Vibration", unit: "mm/s RMS" },
  { key: "bearing_temp_c", label: "Bearing Temp", unit: "°C" },
  { key: "motor_current_a", label: "Motor Current", unit: "A" },
  { key: "line_speed_mpm", label: "Line Speed", unit: "m/min" },
  { key: "coolant_pressure_psi", label: "Coolant Pressure", unit: "psi" },
] as const;

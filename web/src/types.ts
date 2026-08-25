export interface FleetEntry {
  standId: string;
  latestScore: number;
  isAlerting: boolean;
}

export interface TimeseriesPoint {
  timestamp: string;
  vibration_rms_mm_s: number;
  bearing_temp_c: number;
  motor_current_a: number;
  line_speed_mpm: number;
  coolant_pressure_psi: number;
  anomaly_score: number;
  is_alert: boolean;
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

export const SIGNALS = [
  { key: "vibration_rms_mm_s", label: "Vibration", unit: "mm/s RMS" },
  { key: "bearing_temp_c", label: "Bearing Temp", unit: "°C" },
  { key: "motor_current_a", label: "Motor Current", unit: "A" },
  { key: "line_speed_mpm", label: "Line Speed", unit: "m/min" },
  { key: "coolant_pressure_psi", label: "Coolant Pressure", unit: "psi" },
] as const;

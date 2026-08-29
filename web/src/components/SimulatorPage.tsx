import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { announceAlert, playSiren } from "../lib/alertSound";
import { RollStandIcon } from "./RollStandIcon";
import { SignalChart } from "./SignalChart";
import type { DegradeTickResult, SignalKey, SimulatorState } from "../types";
import { SIGNALS } from "../types";

const TICK_MS = 400; // real ms per simulated minute of degradation, watchable but not slow
const DEFAULT_DURATION = 15;
const ALERT_REPEAT_MS = 12_000; // matches the fleet siren's repeat cadence in App.tsx

type Values = Record<SignalKey, number>;

interface Props {
  soundEnabled: boolean;
}

export function SimulatorPage({ soundEnabled }: Props) {
  const [values, setValues] = useState<Values | null>(null);
  const [drafts, setDrafts] = useState<Record<SignalKey, string>>({} as Record<SignalKey, string>);
  const [alertThreshold, setAlertThreshold] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<DegradeTickResult[]>([]);
  const [latest, setLatest] = useState<DegradeTickResult | null>(null);
  const [firstAlertTick, setFirstAlertTick] = useState<number | null>(null);
  const tickInFlight = useRef(false);

  useEffect(() => {
    api.simulatorState().then(applyState);
  }, []);

  function applyState(state: SimulatorState) {
    setValues(state.values);
    setDrafts(stringify(state.values));
    setAlertThreshold(state.alertThreshold);
  }

  function stringify(v: Values): Record<SignalKey, string> {
    const out = {} as Record<SignalKey, string>;
    for (const s of SIGNALS) out[s.key] = String(v[s.key]);
    return out;
  }

  function handleDraftChange(key: SignalKey, raw: string) {
    setDrafts((d) => ({ ...d, [key]: raw }));
  }

  async function commitDraft(key: SignalKey) {
    const raw = drafts[key];
    const parsed = Number(raw);
    if (!values || Number.isNaN(parsed)) {
      if (values) setDrafts(stringify(values));
      return;
    }
    const correlated = await api.simulatorCorrelate(key, parsed);
    setValues(correlated);
    setDrafts(stringify(correlated));
  }

  async function reset() {
    setRunning(false);
    setHistory([]);
    setLatest(null);
    setFirstAlertTick(null);
    const state = await api.simulatorReset();
    applyState(state);
  }

  async function startDegrade() {
    if (!values) return;
    setHistory([]);
    setLatest(null);
    setFirstAlertTick(null);
    await api.simulatorDegradeStart(values, durationMinutes);
    setRunning(true);
  }

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(async () => {
      if (tickInFlight.current) return;
      tickInFlight.current = true;
      try {
        const result = await api.simulatorDegradeTick();
        setLatest(result);
        setHistory((h) => [...h, result]);
        setValues({
          vibration_rms_mm_s: result.vibration_rms_mm_s,
          bearing_temp_c: result.bearing_temp_c,
          motor_current_a: result.motor_current_a,
          line_speed_mpm: result.line_speed_mpm,
          coolant_pressure_psi: result.coolant_pressure_psi,
        });
        setFirstAlertTick((prev) => (prev === null && result.isAlerting ? result.tick : prev));
        if (result.done) setRunning(false);
      } catch {
        setRunning(false);
      } finally {
        tickInFlight.current = false;
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [running]);

  const isAlerting = latest?.isAlerting ?? false;

  // Same repeating siren + spoken cue as the live fleet (App.tsx), just keyed
  // off this simulator's own alert state instead of /api/live/fleet, which
  // has no idea this virtual stand exists.
  useEffect(() => {
    if (!soundEnabled || !isAlerting) return;
    const sound = () => {
      playSiren();
      announceAlert(["SIM-STAND"]);
    };
    sound();
    const interval = setInterval(sound, ALERT_REPEAT_MS);
    return () => clearInterval(interval);
  }, [soundEnabled, isAlerting]);

  if (!values) {
    return <div className="h-64 animate-pulse rounded-xl border border-border bg-surface" />;
  }

  return (
    <div className="page-transition">
      <section className="mb-6">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-faint">
          Degradation simulator
        </h2>
        <p className="max-w-2xl text-sm text-text-muted">
          One virtual stand. Change a signal by hand or run a timed degradation and watch the
          real trained model score it live, minute by minute.
        </p>
      </section>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface p-8">
          <RollStandIcon color={isAlerting ? "#c0392b" : "#4a7fb5"} isAlerting={isAlerting} size={200} />

          <div className="flex flex-col items-center gap-1 text-center">
            <span
              className={[
                "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                isAlerting ? "bg-alert-dim text-alert" : "bg-ok-dim text-ok",
              ].join(" ")}
            >
              {isAlerting ? "Alert" : "Normal"}
            </span>
            <span className="font-mono text-xs text-text-faint">
              anomaly score {latest ? latest.anomaly_score.toFixed(3) : "—"} / threshold{" "}
              {alertThreshold.toFixed(3)}
            </span>
            {running && latest && (
              <span className="text-xs text-text-muted">
                minute {latest.tick} of {latest.durationMinutes}
              </span>
            )}
            {firstAlertTick !== null && (
              <span className="text-xs font-medium text-alert">
                Alert triggered at minute {firstAlertTick} of {durationMinutes}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">Degrade over</label>
            <input
              type="number"
              min={1}
              max={180}
              value={durationMinutes}
              disabled={running}
              onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 rounded-md border border-border bg-bg px-2 py-1 text-center font-mono text-sm text-text disabled:opacity-50"
            />
            <span className="text-xs text-text-muted">minutes</span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={startDegrade}
              disabled={running}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {running ? "Degrading..." : "Start degradation"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text transition-colors hover:border-border-subtle"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-96">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-faint">
              Signal values
            </h3>
            <div className="flex flex-col gap-3">
              {SIGNALS.map((s) => (
                <label key={s.key} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-text-muted">
                    {s.label} <span className="text-text-faint">({s.unit})</span>
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={drafts[s.key] ?? ""}
                    disabled={running}
                    onChange={(e) => handleDraftChange(s.key, e.target.value)}
                    onBlur={() => commitDraft(s.key)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-24 rounded-md border border-border bg-bg px-2 py-1 text-right font-mono text-sm text-text disabled:opacity-50"
                  />
                </label>
              ))}
            </div>
          </div>

          {history.length > 1 && (
            <SignalChart
              label="Vibration during this run"
              unit="mm/s RMS"
              signalKey="vibration_rms_mm_s"
              data={history}
              alertBands={alertBandsFromHistory(history)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function alertBandsFromHistory(history: DegradeTickResult[]) {
  const bands: { start: string; end: string }[] = [];
  let start: string | null = null;
  for (const point of history) {
    if (point.isAlerting && start === null) start = point.timestamp;
    if (!point.isAlerting && start !== null) {
      bands.push({ start, end: point.timestamp });
      start = null;
    }
  }
  if (start !== null) bands.push({ start, end: history[history.length - 1].timestamp });
  return bands;
}

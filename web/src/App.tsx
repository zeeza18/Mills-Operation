import { useEffect, useState } from "react";
import { api } from "./api";
import { CopilotPanel } from "./components/CopilotPanel";
import { FleetStrip } from "./components/FleetStrip";
import { SignalChart } from "./components/SignalChart";
import { MiniFleetPanel } from "./components/MiniFleetPanel";
import { ModelPerformancePanel, StandDetailPanel } from "./components/StatusPanel";
import { SimulatorPage } from "./components/SimulatorPage";
import { SoundToggle } from "./components/SoundToggle";
import { TimeRangeFilter } from "./components/TimeRangeFilter";
import type { RangePreset } from "./components/TimeRangeFilter";
import { announceAlert, playSiren, stopAlertSound, unlockAudio } from "./lib/alertSound";
import type { FleetEntry, ModelMeta, StandSummary, TimeseriesResponse } from "./types";
import { SIGNALS } from "./types";

const ALERT_REPEAT_MS = 12_000;
const FLEET_POLL_MS = 20_000;
const TIMESERIES_POLL_MS = 20_000;

type View = "fleet" | "detail";
type Tab = "live" | "simulator";

// All the timestamps this app generates (the live feed, the historical
// scoring pass) are timezone-naive local wall-clock time, not UTC. Date's
// own toISOString() always emits UTC ("...Z"), which pandas then parses as
// tz-AWARE, and comparing that against the naive backend data throws
// ("Cannot compare tz-naive and tz-aware timestamps"). Formatting from the
// local getters instead keeps everything on the same naive local clock.
function toLocalNaive(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayStr(): string {
  return toLocalNaive(new Date()).slice(0, 10);
}

function computeRange(
  preset: RangePreset,
  customStart: string,
  customEnd: string,
): { start: string; end: string } {
  const now = new Date();
  if (preset === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start: toLocalNaive(start), end: toLocalNaive(now) };
  }
  if (preset === "week") {
    return { start: toLocalNaive(new Date(now.getTime() - 7 * 86_400_000)), end: toLocalNaive(now) };
  }
  if (preset === "month") {
    return { start: toLocalNaive(new Date(now.getTime() - 30 * 86_400_000)), end: toLocalNaive(now) };
  }
  return { start: customStart, end: customEnd || todayStr() };
}

export default function App() {
  const [fleet, setFleet] = useState<FleetEntry[] | null>(null);
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("fleet");
  const [timeseries, setTimeseries] = useState<TimeseriesResponse | null>(null);
  const [summary, setSummary] = useState<StandSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Off by default. Browsers refuse to play any audio at all until the
  // page's first real user gesture happens, no exception exists for this,
  // it's the same restriction that blocks autoplaying ads. Defaulting to
  // "on" was actively misleading: the icon claimed sound was active while
  // it was really just silently blocked, waiting for a click that might not
  // come for a while. Starting muted matches what's actually true, and a
  // click both turns it on and unlocks audio in the same action, so it
  // plays immediately, no separate "enable" step needed.
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [fleetPanelOpen, setFleetPanelOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("live");
  const [rangePreset, setRangePreset] = useState<RangePreset>("today");
  const [minDate, setMinDate] = useState(todayStr); // refined once /data-bounds resolves
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(todayStr);

  // The historical set is a rolling window ending yesterday (see
  // historical.ensure_fresh in the backend), not a fixed calendar date, so
  // the earliest selectable custom-range date has to come from the API.
  useEffect(() => {
    api.dataBounds().then(({ minDate: d }) => {
      setMinDate(d);
      setCustomStart((prev) => prev || d);
    });
  }, []);

  // Live tab: sourced from the always-running live feed (app/live_feed.py),
  // which ticks once per real minute, not the static held-out test set. Polled
  // rather than pushed since a new minute only lands every 60s anyway.
  useEffect(() => {
    let cancelled = false;
    function load() {
      Promise.all([api.liveFleet(), api.meta()])
        .then(([fleetData, metaData]) => {
          if (cancelled) return;
          setFleet(fleetData);
          setMeta(metaData);
        })
        .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : "Failed to load"));
    }
    load();
    const interval = setInterval(load, FLEET_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function toggleSound() {
    unlockAudio(); // this click is the user gesture that unlocks the AudioContext
    setSoundEnabled((v) => {
      const next = !v;
      // Muting stops the currently playing wail/announcement immediately,
      // not just future repeats. Without this, a mute click mid-cycle looked
      // like it did nothing until the ~2.8s siren finished on its own.
      if (!next) stopAlertSound();
      return next;
    });
  }

  // Repeats the siren + spoken stand list every 12 seconds for as long as
  // any stand is alerting and sound is enabled. Fires immediately when
  // turned on (or a new alert appears) rather than waiting a full 12s for
  // the first cue.
  useEffect(() => {
    if (!fleet || !soundEnabled) return;
    const alertingIds = fleet.filter((f) => f.isAlerting).map((f) => f.standId);
    if (alertingIds.length === 0) return;

    const sound = () => {
      playSiren();
      announceAlert(alertingIds);
    };
    sound();
    const interval = setInterval(sound, ALERT_REPEAT_MS);
    return () => clearInterval(interval);
  }, [fleet, soundEnabled]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setTimeseries(null);
    setSummary(null);
    function load() {
      if (!selected) return;
      const range = computeRange(rangePreset, customStart, customEnd);
      Promise.all([api.liveTimeseries(selected, range), api.liveSummary(selected)])
        .then(([ts, sum]) => {
          if (cancelled) return;
          setTimeseries(ts);
          setSummary(sum);
        })
        .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : "Failed to load stand"));
    }
    load();
    const interval = setInterval(load, TIMESERIES_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selected, rangePreset, customStart, customEnd]);

  function openStand(standId: string) {
    setSelected(standId);
    setView("detail");
  }

  function backToFleet() {
    setTab("live");
    setView("fleet");
  }

  const onFleetLanding = tab === "live" && view === "fleet";

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-8 text-center">
        <div className="max-w-md">
          <p className="mb-2 font-medium text-alert">Couldn't reach the API</p>
          <p className="text-sm text-text-muted">
            {loadError}. Make sure the backend is running:{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs">
              uvicorn app.api:app --port 8000
            </code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <SoundToggle enabled={soundEnabled} onToggle={toggleSound} />
      <header className={["border-b border-border-subtle px-6", onFleetLanding ? "py-5" : "py-3"].join(" ")}>
        <div className="flex items-center justify-between gap-4">
          {/* Only exists once you've left the plain fleet landing screen
              (pressed into a stand card, or on the simulator). Sharing this
              row with the title via justify-between is what pushes the
              title to the right once this shows up; with nothing on the
              left, the title just sits at its normal spot. */}
          {!onFleetLanding && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={backToFleet}
                className="group flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-sm font-medium text-text shadow-sm transition-all hover:-translate-x-0.5 hover:border-border-subtle hover:bg-surface-raised hover:shadow-md"
              >
                <span
                  aria-hidden
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-base text-text transition-colors group-hover:bg-accent-dim group-hover:text-accent"
                >
                  &#8592;
                </span>
                Back to fleet
              </button>

              {view === "detail" && !fleetPanelOpen && (
                <button
                  type="button"
                  onClick={() => setFleetPanelOpen(true)}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1 text-sm text-text-muted transition-colors hover:border-border-subtle hover:bg-surface-raised hover:text-text"
                >
                  Show fleet
                </button>
              )}
            </div>
          )}

          <div className={onFleetLanding ? undefined : "text-right"}>
            <h1 className="text-lg font-semibold tracking-tight text-text">
              Mills-Operation <span className="text-text-faint">/</span> Reliability Console
            </h1>
            {/* Boilerplate intro, only worth the vertical space on first
                landing; once you're inside a stand or the simulator, the
                title alone is enough context. */}
            {onFleetLanding && (
              <p className="mt-1 max-w-2xl text-sm text-text-muted">
                Prototype for a hot mill shift supervisor. Flags roll stand bearing degradation
                before it becomes unplanned downtime.
              </p>
            )}
          </div>
        </div>

        {/* Hidden on the plain fleet landing screen on purpose: only shows up
            once you've pressed into a stand card (or are already on the
            simulator), so the fleet cards aren't sharing space with tabs
            unrelated to picking a stand. */}
        {!onFleetLanding && (
          <div className="mt-3 flex justify-center gap-1 border-b border-border-subtle">
            <TabButton active={tab === "live"} onClick={() => setTab("live")}>
              Live monitor
            </TabButton>
            <TabButton active={tab === "simulator"} onClick={() => setTab("simulator")}>
              Degradation simulator
            </TabButton>
          </div>
        )}
      </header>

      <main
        className={[
          "mx-auto px-6 py-6",
          tab === "live" && view !== "fleet" ? "max-w-[100rem]" : "max-w-7xl",
        ].join(" ")}
      >
        {tab === "simulator" ? (
          <SimulatorPage soundEnabled={soundEnabled} />
        ) : view === "fleet" ? (
          <div key="fleet" className="page-transition">
            <section className="mb-6">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-faint">
                Fleet status
              </h2>
              <p className="mb-3 text-xs text-text-faint">
                Click a stand to see its live signal charts.
              </p>
              {fleet ? (
                <FleetStrip fleet={fleet} selected={selected} onSelect={openStand} />
              ) : (
                <SkeletonRow />
              )}
            </section>

            {meta && (
              <section>
                <ModelPerformancePanel meta={meta} />
              </section>
            )}
          </div>
        ) : (
          <div key="detail" className="page-transition">
            <h2 className="mb-4 font-mono text-lg font-semibold text-text">{selected}</h2>

            <TimeRangeFilter
              preset={rangePreset}
              onPresetChange={setRangePreset}
              customStart={customStart}
              customEnd={customEnd}
              onCustomChange={(start, end) => {
                setCustomStart(start);
                setCustomEnd(end);
              }}
              minDate={minDate}
              maxDate={todayStr()}
            />

            <section className="flex flex-col gap-6 lg:flex-row">
              {fleetPanelOpen && fleet && selected && (
                <MiniFleetPanel
                  fleet={fleet}
                  selected={selected}
                  onSelect={openStand}
                  onClose={() => setFleetPanelOpen(false)}
                />
              )}

              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                {timeseries
                  ? SIGNALS.map((s) => (
                      <SignalChart
                        key={s.key}
                        label={s.label}
                        unit={s.unit}
                        signalKey={s.key}
                        data={timeseries.points}
                        alertBands={timeseries.alertBands}
                      />
                    ))
                  : SIGNALS.map((s) => <ChartSkeleton key={s.key} />)}
              </div>

              <div className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
                {summary ? (
                  <>
                    <StandDetailPanel summary={summary} />
                    <CopilotPanel standId={selected!} live />
                  </>
                ) : (
                  <SidebarSkeleton />
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-accent text-text"
          : "border-transparent text-text-muted hover:text-text",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[220px] animate-pulse rounded-xl border border-border bg-surface" />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-[200px] animate-pulse rounded-lg border border-border bg-surface" />;
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-[140px] animate-pulse rounded-lg border border-border bg-surface" />
      <div className="h-[100px] animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  );
}

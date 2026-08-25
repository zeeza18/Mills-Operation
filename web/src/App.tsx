import { useEffect, useState } from "react";
import { api } from "./api";
import { CopilotPanel } from "./components/CopilotPanel";
import { FleetStrip } from "./components/FleetStrip";
import { SignalChart } from "./components/SignalChart";
import { StatusPanel } from "./components/StatusPanel";
import type { FleetEntry, ModelMeta, StandSummary, TimeseriesPoint } from "./types";
import { SIGNALS } from "./types";

export default function App() {
  const [fleet, setFleet] = useState<FleetEntry[] | null>(null);
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[] | null>(null);
  const [summary, setSummary] = useState<StandSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.fleet(), api.meta()])
      .then(([fleetData, metaData]) => {
        setFleet(fleetData);
        setMeta(metaData);
        const firstAlerting = fleetData.find((f) => f.isAlerting);
        setSelected((firstAlerting ?? fleetData[0])?.standId ?? null);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setTimeseries(null);
    setSummary(null);
    Promise.all([api.timeseries(selected), api.summary(selected)])
      .then(([ts, sum]) => {
        setTimeseries(ts);
        setSummary(sum);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load stand"));
  }, [selected]);

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
      <header className="border-b border-border-subtle px-6 py-5">
        <h1 className="text-lg font-semibold tracking-tight text-text">
          Mills-Operation <span className="text-text-faint">/</span> Reliability Console
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Prototype for a hot mill shift supervisor. Flags roll stand bearing degradation before
          it becomes unplanned downtime.
        </p>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <section className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-faint">
            Fleet status
          </h2>
          {fleet && selected ? (
            <FleetStrip fleet={fleet} selected={selected} onSelect={setSelected} />
          ) : (
            <SkeletonRow />
          )}
        </section>

        {selected && (
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {timeseries
                ? SIGNALS.map((s) => (
                    <SignalChart
                      key={s.key}
                      label={s.label}
                      unit={s.unit}
                      signalKey={s.key}
                      data={timeseries}
                    />
                  ))
                : SIGNALS.map((s) => <ChartSkeleton key={s.key} />)}
            </div>

            <div className="flex flex-col gap-3">
              {summary && meta ? (
                <>
                  <StatusPanel summary={summary} meta={meta} />
                  <CopilotPanel standId={selected} />
                </>
              ) : (
                <SidebarSkeleton />
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[70px] animate-pulse rounded-lg border border-border bg-surface" />
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

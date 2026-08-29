import type { FleetEntry } from "../types";
import { SIGNALS } from "../types";

interface Props {
  entry: FleetEntry;
}

export function CurrentReadingsPanel({ entry }: Props) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4" data-testid="current-readings-panel">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-faint">
        Current readings
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {SIGNALS.map((s) => (
          <div key={s.key}>
            <p className="text-[10px] uppercase tracking-wide text-text-faint">{s.label}</p>
            <p className="font-mono text-sm text-text">
              {entry[s.key].toFixed(2)} <span className="text-xs text-text-faint">{s.unit}</span>
            </p>
          </div>
        ))}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-faint">Anomaly score</p>
          <p className={["font-mono text-sm", entry.isAlerting ? "text-alert" : "text-text"].join(" ")}>
            {entry.latestScore.toFixed(3)}
          </p>
        </div>
      </div>
    </div>
  );
}

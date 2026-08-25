import type { FleetEntry } from "../types";

interface Props {
  fleet: FleetEntry[];
  selected: string;
  onSelect: (standId: string) => void;
}

export function FleetStrip({ fleet, selected, onSelect }: Props) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      data-testid="fleet-strip"
    >
      {fleet.map((s) => {
        const isSelected = s.standId === selected;
        return (
          <button
            key={s.standId}
            type="button"
            onClick={() => onSelect(s.standId)}
            data-testid={`fleet-card-${s.standId}`}
            data-alerting={s.isAlerting}
            className={[
              "rounded-lg border px-4 py-3 text-left transition-colors",
              isSelected
                ? "border-accent bg-surface-raised"
                : "border-border bg-surface hover:border-border-subtle hover:bg-surface-raised",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-medium text-text">
                {s.standId}
              </span>
              <span
                className={[
                  "h-2 w-2 shrink-0 rounded-full",
                  s.isAlerting ? "bg-alert" : "bg-ok",
                ].join(" ")}
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span
                className={[
                  "text-xs font-medium uppercase tracking-wide",
                  s.isAlerting ? "text-alert" : "text-ok",
                ].join(" ")}
              >
                {s.isAlerting ? "Alert" : "Normal"}
              </span>
              <span className="tabular font-mono text-sm text-text-muted">
                {s.latestScore.toFixed(2)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

import { RollStandIcon } from "./RollStandIcon";
import type { FleetEntry } from "../types";
import { SIGNALS } from "../types";

const STAND_COLORS = [
  "var(--color-stand-1)",
  "var(--color-stand-2)",
  "var(--color-stand-3)",
  "var(--color-stand-4)",
  "var(--color-stand-5)",
  "var(--color-stand-6)",
];

interface Props {
  stand: FleetEntry;
  index: number;
  isSelected: boolean;
  onSelect: (standId: string) => void;
}

export function StandCard({ stand, index, isSelected, onSelect }: Props) {
  const color = STAND_COLORS[index % STAND_COLORS.length];

  return (
    <button
      type="button"
      onClick={() => onSelect(stand.standId)}
      data-testid={`fleet-card-${stand.standId}`}
      data-alerting={stand.isAlerting}
      className={[
        "flex flex-col items-center gap-3 rounded-xl border px-4 py-5 text-left",
        "transition-all duration-150 ease-out will-change-transform",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20",
        "active:translate-y-0 active:scale-[0.97] active:duration-75",
        isSelected
          ? "border-accent bg-surface-raised"
          : "border-border bg-surface hover:border-border-subtle hover:bg-surface-raised",
      ].join(" ")}
    >
      <div className="flex w-full items-center justify-between">
        <span className="font-mono text-sm font-semibold text-text">{stand.standId}</span>
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            stand.isAlerting ? "bg-alert-dim text-alert" : "bg-ok-dim text-ok",
          ].join(" ")}
        >
          {stand.isAlerting ? "Alert" : "Normal"}
        </span>
      </div>

      <RollStandIcon color={color} isAlerting={stand.isAlerting} />

      <div className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5">
        {SIGNALS.map((s) => (
          <div key={s.key} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-text-faint">{s.label}</span>
            <span className="tabular font-mono text-xs text-text">
              {stand[s.key].toFixed(1)}
              <span className="ml-1 text-text-faint">{s.unit}</span>
            </span>
          </div>
        ))}
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-text-faint">Anomaly score</span>
          <span
            className={[
              "tabular font-mono text-xs font-medium",
              stand.isAlerting ? "text-alert" : "text-text",
            ].join(" ")}
          >
            {stand.latestScore.toFixed(2)}
          </span>
        </div>
      </div>
    </button>
  );
}

import type { FleetEntry } from "../types";

interface Props {
  fleet: FleetEntry[];
  selected: string;
  onSelect: (standId: string) => void;
  onClose: () => void;
}

export function MiniFleetPanel({ fleet, selected, onSelect, onClose }: Props) {
  // Alerting stands first, so the ones that actually need attention aren't
  // scrolled out of view below the normal ones.
  const sorted = [...fleet].sort((a, b) => {
    if (a.isAlerting !== b.isAlerting) return a.isAlerting ? -1 : 1;
    return a.standId.localeCompare(b.standId);
  });

  return (
    <div className="flex w-52 shrink-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-faint">Fleet</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fleet panel"
          className="text-text-faint transition-colors hover:text-text"
        >
          &#10005;
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {sorted.map((s) => {
          const isSelected = s.standId === selected;
          return (
            <button
              key={s.standId}
              type="button"
              onClick={() => onSelect(s.standId)}
              className={[
                "flex items-center justify-between rounded-md border px-2.5 py-2 text-left transition-colors",
                isSelected
                  ? "border-accent bg-surface-raised"
                  : "border-border hover:border-border-subtle hover:bg-surface-raised",
              ].join(" ")}
            >
              <span className="font-mono text-xs font-medium text-text">{s.standId}</span>
              <span
                className={[
                  "rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
                  s.isAlerting ? "bg-alert-dim text-alert" : "bg-ok-dim text-ok",
                ].join(" ")}
              >
                {s.isAlerting ? "Alert" : "Normal"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

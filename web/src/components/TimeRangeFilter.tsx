export type RangePreset = "today" | "week" | "month" | "custom";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Past week" },
  { key: "month", label: "Last month" },
  { key: "custom", label: "Custom range" },
];

interface Props {
  preset: RangePreset;
  onPresetChange: (p: RangePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomChange: (start: string, end: string) => void;
  minDate: string;
  maxDate: string;
}

export function TimeRangeFilter({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomChange,
  minDate,
  maxDate,
}: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPresetChange(p.key)}
          className={[
            "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            preset === p.key
              ? "border-accent bg-accent-dim text-accent"
              : "border-border bg-surface text-text-muted hover:border-border-subtle hover:text-text",
          ].join(" ")}
        >
          {p.label}
        </button>
      ))}

      {preset === "custom" && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <input
            type="date"
            min={minDate}
            max={maxDate}
            value={customStart}
            onChange={(e) => onCustomChange(e.target.value, customEnd)}
            className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-text"
          />
          <span>to</span>
          <input
            type="date"
            min={minDate}
            max={maxDate}
            value={customEnd}
            onChange={(e) => onCustomChange(customStart, e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-text"
          />
        </div>
      )}
    </div>
  );
}

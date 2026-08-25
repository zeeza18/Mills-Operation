import {
  CartesianGrid,
  Line,
  ComposedChart,
  Scatter,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimeseriesPoint } from "../types";

interface Props {
  label: string;
  unit: string;
  signalKey: keyof TimeseriesPoint;
  data: TimeseriesPoint[];
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function SignalChart({ label, unit, signalKey, data }: Props) {
  const chartData = data.map((d) => ({
    timestamp: d.timestamp,
    t: new Date(d.timestamp).getTime(),
    value: d[signalKey] as number,
    alertValue: d.is_alert ? (d[signalKey] as number) : null,
  }));

  return (
    <div
      className="rounded-lg border border-border bg-surface p-4"
      data-testid={`chart-${signalKey}`}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-text">{label}</h3>
        <span className="text-xs text-text-faint">{unit}</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border-subtle)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => dateFmt.format(new Date(t))}
            stroke="var(--color-text-faint)"
            tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            minTickGap={40}
          />
          <YAxis
            stroke="var(--color-text-faint)"
            tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
            labelFormatter={(t) => new Date(t as number).toLocaleString()}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent)"
            strokeWidth={1.25}
            dot={false}
            isAnimationActive={false}
          />
          <Scatter dataKey="alertValue" fill="var(--color-alert)" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

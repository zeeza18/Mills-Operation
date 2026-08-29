import {
  CartesianGrid,
  Line,
  ComposedChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AlertBand, TimeseriesPoint } from "../types";

interface Props {
  label: string;
  unit: string;
  signalKey: keyof TimeseriesPoint;
  data: TimeseriesPoint[];
  alertBands: AlertBand[];
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function SignalChart({ label, unit, signalKey, data, alertBands }: Props) {
  const chartData = data.map((d) => ({
    t: new Date(d.timestamp).getTime(),
    value: d[signalKey] as number,
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
          {alertBands.map((band) => (
            <ReferenceArea
              key={band.start}
              x1={new Date(band.start).getTime()}
              x2={new Date(band.end).getTime()}
              fill="var(--color-alert)"
              fillOpacity={0.18}
              stroke="var(--color-alert)"
              strokeOpacity={0.4}
              ifOverflow="visible"
            />
          ))}
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent)"
            strokeWidth={1.25}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

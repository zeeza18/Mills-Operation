import type { ModelMeta, StandSummary } from "../types";

function Metric({ label, value, tone }: { label: string; value: string; tone?: "ok" | "alert" }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-xs text-text-muted">{label}</span>
      <span
        className={[
          "tabular font-mono text-sm font-medium",
          tone === "alert" ? "text-alert" : tone === "ok" ? "text-ok" : "text-text",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-faint">
        {title}
      </h3>
      <div className="divide-y divide-border-subtle">{children}</div>
    </div>
  );
}

export function ModelPerformancePanel({ meta }: { meta: ModelMeta }) {
  return (
    <div data-testid="status-panel">
      <Section title="Model performance (held-out test)">
        <Metric
          label="Failures detected"
          value={`${meta.failures_detected}/${meta.failures_in_test_window}`}
          tone="ok"
        />
        <Metric
          label="False alarm rate"
          value={`${(meta.false_positive_rate * 100).toFixed(2)}%`}
        />
        <Metric label="Alert threshold" value={meta.alert_threshold.toFixed(3)} />
      </Section>
    </div>
  );
}

export function StandDetailPanel({ summary }: { summary: StandSummary }) {
  return (
    <div className="flex flex-col gap-3" data-testid="stand-detail-panel">
      <Section title="Status">
        <Metric
          label="Latest anomaly score"
          value={summary.latestScore.toFixed(3)}
          tone={summary.isAlerting ? "alert" : "ok"}
        />
        <Metric label="Alert threshold" value={summary.alertThreshold.toFixed(3)} />
        {summary.firstAlertAt && (
          <Metric label="First alert" value={summary.firstAlertAt} />
        )}
      </Section>

      {summary.groundTruthFailures.length > 0 && (
        <Section title="Ground truth (synthetic, for evaluation)">
          {summary.groundTruthFailures.map((ts) => (
            <Metric key={ts} label="Actual failure" value={ts} />
          ))}
        </Section>
      )}
    </div>
  );
}

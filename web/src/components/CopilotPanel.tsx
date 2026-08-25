import { useState } from "react";
import { api } from "../api";

interface Props {
  standId: string;
}

export function CopilotPanel({ standId }: Props) {
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [source, setSource] = useState<"live" | "fallback" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.explain(standId);
      setExplanation(res.explanation);
      setSource(res.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4" data-testid="copilot-panel">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
        Ask the copilot
      </h3>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        data-testid="explain-button"
        className="w-full rounded-md border border-accent bg-accent-dim px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Asking the copilot…" : `Explain ${standId}'s status`}
      </button>

      {error && (
        <p className="mt-3 text-sm text-alert" data-testid="explain-error">
          {error}
        </p>
      )}

      {explanation && (
        <div className="mt-3" data-testid="explain-response">
          {source === "fallback" && (
            <p className="mb-2 text-xs italic text-text-faint">
              Offline fallback. No live model call.
            </p>
          )}
          <p className="whitespace-pre-line text-sm leading-relaxed text-text-muted">
            {explanation}
          </p>
        </div>
      )}
    </div>
  );
}

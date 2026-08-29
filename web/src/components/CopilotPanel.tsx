import { useState } from "react";
import { api } from "../api";

interface Props {
  standId: string;
  live?: boolean;
}

interface QaEntry {
  question: string;
  answer: string;
  source: "live" | "fallback";
}

// The copilot's prompts ask it to use **bold** for key numbers/recommendations.
// Rendered as real bold here instead of stripping it, so the emphasis survives
// without showing the reader literal asterisks.
function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-text">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

export function CopilotPanel({ standId, live = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [source, setSource] = useState<"live" | "fallback" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  // One exchange at a time, on purpose: each question is answered fresh, with
  // no memory of earlier ones (the backend doesn't send prior Q&A back to the
  // model either), so showing a growing chat log would misleadingly imply
  // this remembers context between questions when it doesn't.
  const [lastAnswer, setLastAnswer] = useState<QaEntry | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = live ? await api.liveExplain(standId) : await api.explain(standId);
      setExplanation(res.explanation);
      setSource(res.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || asking) return;
    setAsking(true);
    setAskError(null);
    try {
      const res = await api.askFleet(text);
      setLastAnswer({ question: text, answer: res.answer, source: res.source });
      setQuestion("");
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAsking(false);
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
            {renderBold(explanation)}
          </p>
        </div>
      )}

      <div className="mt-4 border-t border-border-subtle pt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
          Ask about the fleet
        </h3>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. compare vibration on STAND-01 and STAND-03"
            disabled={asking}
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="shrink-0 rounded-md border border-accent bg-accent-dim px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {asking ? "Asking…" : "Ask"}
          </button>
        </form>

        {askError && <p className="mt-3 text-sm text-alert">{askError}</p>}

        {lastAnswer && (
          <div className="mt-3 border-t border-border-subtle pt-3">
            <p className="text-sm font-medium text-text">{lastAnswer.question}</p>
            {lastAnswer.source === "fallback" && (
              <p className="mt-1 text-xs italic text-text-faint">
                Offline fallback. No live model call.
              </p>
            )}
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-text-muted">
              {renderBold(lastAnswer.answer)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

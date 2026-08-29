import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { renderBold } from "../lib/markdown";
import type { ChatMessage } from "../types";

export interface DisplayMessage extends ChatMessage {
  source?: "live" | "fallback";
}

interface Props {
  selectedStandId: string | null;
  // Lifted up to App.tsx on purpose: this component unmounts whenever the
  // tab switches away from "copilot", so state kept locally here (the
  // conversation itself) would reset to empty every time someone checks a
  // chart and comes back, which defeats the point of a chat with memory.
  messages: DisplayMessage[];
  setMessages: React.Dispatch<React.SetStateAction<DisplayMessage[]>>;
}

export function FleetCopilotPage({ selectedStandId, messages, setMessages }: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || sending) return;
    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await api.askFleet(next.map(({ role, content }) => ({ role, content })));
      setMessages((m) => [...m, { role: "assistant", content: res.answer, source: res.source }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSending(false);
    }
  }

  async function explainSelected() {
    if (!selectedStandId || sending) return;
    const question = `Explain ${selectedStandId}'s status`;
    setMessages((m) => [...m, { role: "user", content: question }]);
    setSending(true);
    setError(null);
    try {
      const res = await api.liveExplain(selectedStandId);
      setMessages((m) => [...m, { role: "assistant", content: res.explanation, source: res.source }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSending(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
  }

  return (
    <div className="page-transition flex h-[70vh] min-h-[420px] flex-col">
      <section className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-faint">
            Copilot
          </h2>
          <p className="max-w-2xl text-sm text-text-muted">
            Ask about any stand: compare readings, check who's alerting, look up alert history.
            Answers are grounded in real fleet data, never invented.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            className="shrink-0 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-border-subtle hover:bg-surface-raised hover:text-text"
          >
            Clear chat
          </button>
        )}
      </section>

      {selectedStandId && (
        <button
          type="button"
          onClick={explainSelected}
          disabled={sending}
          data-testid="explain-button"
          className="mb-3 w-fit rounded-full border border-accent bg-accent-dim px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          Explain {selectedStandId}'s status
        </button>
      )}

      <div
        className="flex-1 overflow-y-auto rounded-lg border border-border bg-surface p-4"
        data-testid="copilot-chat"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-text-faint">
            Ask a question to get started, e.g. "which stand has the highest bearing temperature?"
            or "compare vibration on STAND-01 and STAND-03".
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={[
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                    m.role === "user" ? "bg-accent text-bg" : "bg-surface-raised text-text",
                  ].join(" ")}
                  data-testid={i === messages.length - 1 && m.role === "assistant" ? "explain-response" : undefined}
                >
                  {m.role === "assistant" && m.source === "fallback" && (
                    <p className="mb-1 text-xs italic opacity-70">Offline fallback. No live model call.</p>
                  )}
                  <p className="whitespace-pre-line">{renderBold(m.content)}</p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg bg-surface-raised px-3 py-2 text-sm text-text-faint">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-alert">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the fleet..."
          disabled={sending}
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="shrink-0 rounded-md border border-accent bg-accent-dim px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Asking…" : "Send"}
        </button>
      </form>
    </div>
  );
}

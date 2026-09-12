import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../types/api";
import { MarkdownLite } from "../../components/MarkdownLite";

interface Props {
  chatHistory: ChatMessage[];
  sending: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onCancel: () => void;
}

const SUGGESTIONS = [
  "Create a 60-second video teaching ABC with farm animals.",
  "Make it more colorful.",
  "Regenerate scene 3.",
  "Make the narration slower.",
];

export function ChatPanel({ chatHistory, sending, error, onSend, onCancel }: Props) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatHistory, sending]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <section className="chat-panel">
      <div className="chat-messages" ref={scrollRef}>
        {chatHistory.length === 0 && (
          <div className="empty-state" style={{ height: "auto", padding: 30 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Describe the video you want</div>
            <div style={{ fontSize: 12.5 }}>The agent will plan, script, generate and assemble it for you.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 10 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="icon-btn" onClick={() => setText(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {chatHistory
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => (
            <div key={m.id} className={`chat-message ${m.role}`}>
              <MarkdownLite text={m.content} />
            </div>
          ))}
      </div>

      {sending && (
        <div className="thinking-row">
          <span className="spinner" />
          Agent is working…
          <button className="cancel-btn" style={{ marginLeft: "auto", padding: "2px 10px" }} onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="chat-input-row">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Tell the agent what to do…"
          disabled={sending}
        />
        <button className="send-btn" onClick={submit} disabled={sending || !text.trim()}>
          Send
        </button>
      </div>
    </section>
  );
}

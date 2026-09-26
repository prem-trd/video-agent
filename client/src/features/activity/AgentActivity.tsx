import { useLayoutEffect, useRef } from "react";
import type { AgentLog, AgentState } from "../../types/api";
import { StatusBadge } from "../../components/StatusBadge";

interface Props {
  agentState: AgentState | undefined;
  logs: AgentLog[];
  sending: boolean;
  activeTool: string | null;
}

function iconFor(log: AgentLog): { icon: string; cls: string } {
  if (log.level === "error" || log.level === "warn") return { icon: "✗", cls: "err" };
  return { icon: "✓", cls: "ok" };
}

export function AgentActivity({ agentState, logs, sending, activeTool }: Props) {
  // logs come back newest-first from the API; show oldest-first like a running log
  const ordered = [...logs].reverse();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Follow the newest row like a terminal, unless the user has scrolled up to read history.
  const stickToBottom = useRef(true);
  const lastLogId = logs[0]?.id;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastLogId, activeTool, sending]);

  return (
    <div
      className="agent-activity"
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      <div className="agent-activity-header">
        <span className="agent-activity-title">
          Agent Activity {agentState && <StatusBadge status={agentState} />}
          {sending && <span className="spinner" />}
        </span>
      </div>
      <div className="activity-log">
        {ordered.length === 0 && <div className="activity-text">No activity yet.</div>}
        {ordered.map((log) => {
          const { icon, cls } = iconFor(log);
          return (
            <div className="activity-log-row" key={log.id}>
              <span className={`activity-icon ${cls}`}>{icon}</span>
              <span className="activity-text">
                {log.tool ? `[${log.tool}] ` : ""}
                {log.message}
                {log.durationMs != null ? ` (${log.durationMs}ms)` : ""}
              </span>
            </div>
          );
        })}
        {sending && (
          <div className="activity-log-row live">
            <span className="activity-icon busy">
              <span className="spinner" />
            </span>
            <span className="activity-text">{activeTool ? `[${activeTool}] Running…` : "Agent is thinking…"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

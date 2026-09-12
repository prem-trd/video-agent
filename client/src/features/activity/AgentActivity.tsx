import type { AgentLog, AgentState } from "../../types/api";
import { StatusBadge } from "../../components/StatusBadge";

interface Props {
  agentState: AgentState | undefined;
  logs: AgentLog[];
  sending: boolean;
}

function iconFor(log: AgentLog): { icon: string; cls: string } {
  if (log.level === "error" || log.level === "warn") return { icon: "✗", cls: "err" };
  return { icon: "✓", cls: "ok" };
}

export function AgentActivity({ agentState, logs, sending }: Props) {
  // logs come back newest-first from the API; show oldest-first like a running log
  const ordered = [...logs].reverse();

  return (
    <div className="agent-activity">
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
      </div>
    </div>
  );
}

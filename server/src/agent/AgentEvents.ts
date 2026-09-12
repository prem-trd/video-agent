import { EventEmitter } from "node:events";

// Real-time progress (spec #31): a tiny per-project pub/sub so SSE
// connections can push updates to the browser as they happen, instead of
// the UI having to poll. AgentLoop/VideoAgent publish; routes/events.ts
// subscribes one listener per open SSE connection.

export type AgentEventType =
  | "agent_started"
  | "agent_state_changed"
  | "tool_called"
  | "tool_completed"
  | "error"
  | "project_completed";

export interface AgentEvent {
  type: AgentEventType;
  projectId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

class AgentEventBus extends EventEmitter {
  publish(event: Omit<AgentEvent, "timestamp">): void {
    const full: AgentEvent = { ...event, timestamp: new Date().toISOString() };
    this.emit(event.projectId, full);
  }

  subscribe(projectId: string, listener: (event: AgentEvent) => void): () => void {
    this.on(projectId, listener);
    return () => {
      this.off(projectId, listener);
    };
  }
}

export const agentEvents = new AgentEventBus();
// Many projects' worth of SSE connections can coexist in a local dev
// session; raise the default limit rather than let Node warn about it.
agentEvents.setMaxListeners(100);

import { useEffect, useRef } from "react";

export type AgentEventType = "agent_started" | "agent_state_changed" | "tool_called" | "tool_completed" | "error" | "project_completed";

export interface AgentEvent {
  type: AgentEventType;
  projectId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

/**
 * Subscribes to a project's real-time SSE event stream (spec #31) - the
 * push-based replacement for polling GET /status on a timer. The browser's
 * native EventSource reconnects automatically if the connection drops, so
 * no manual retry logic is needed here.
 */
export function useAgentEvents(projectId: string | null, onEvent: (event: AgentEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!projectId) return;

    const source = new EventSource(`/api/projects/${projectId}/events`);
    const types: AgentEventType[] = ["agent_started", "agent_state_changed", "tool_called", "tool_completed", "error", "project_completed"];

    const handler = (e: MessageEvent) => {
      try {
        onEventRef.current(JSON.parse(e.data));
      } catch {
        /* ignore malformed event */
      }
    };

    for (const type of types) source.addEventListener(type, handler);

    return () => {
      for (const type of types) source.removeEventListener(type, handler);
      source.close();
    };
  }, [projectId]);
}

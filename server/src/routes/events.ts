import { Router } from "express";
import { agentEvents, type AgentEvent } from "../agent/AgentEvents.js";

export const eventsRouter = Router({ mergeParams: true });

/**
 * Server-Sent Events stream of this project's agent activity (spec #31).
 * Replaces polling for the UI: the browser opens one EventSource per
 * selected project and receives agent_started/agent_state_changed/
 * tool_called/tool_completed/error/project_completed events as they
 * happen, pushed the moment AgentLoop/VideoAgent publish them - no
 * refresh, no fixed-interval requests.
 */
eventsRouter.get("/", (req, res) => {
  const { id: projectId } = req.params as { id: string };

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable proxy buffering (nginx et al) so events aren't batched
  });
  res.flushHeaders?.();

  const send = (event: AgentEvent) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // an initial comment line opens the stream immediately so EventSource
  // fires its "open" handler right away instead of waiting for the first
  // real event
  res.write(": connected\n\n");

  const unsubscribe = agentEvents.subscribe(projectId, send);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 20_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

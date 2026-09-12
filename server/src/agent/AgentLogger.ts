import { prisma } from "../database/prisma.js";
import { logger } from "../utils/logger.js";

export interface AgentLogEntry {
  projectId: string;
  level?: "info" | "warn" | "error" | "debug";
  agentState?: string;
  task?: string;
  tool?: string;
  message: string;
  durationMs?: number;
  data?: Record<string, unknown>;
}

/**
 * Structured logging (spec #45): every agent action is written both to the
 * process logger (console) and persisted to the AgentLog table so the UI
 * can render an activity feed / history for a project. Never pass secrets
 * in `data` - nothing here redacts field names, callers are responsible.
 */
export async function logAgentEvent(entry: AgentLogEntry): Promise<void> {
  const level = entry.level ?? "info";

  logger[level](
    {
      projectId: entry.projectId,
      agentState: entry.agentState,
      task: entry.task,
      tool: entry.tool,
      durationMs: entry.durationMs,
      data: entry.data,
    },
    entry.message
  );

  await prisma.agentLog.create({
    data: {
      projectId: entry.projectId,
      level,
      agentState: entry.agentState ?? "",
      task: entry.task ?? "",
      tool: entry.tool ?? "",
      message: entry.message,
      durationMs: entry.durationMs,
      data: JSON.stringify(entry.data ?? {}),
    },
  });
}

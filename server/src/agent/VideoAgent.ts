import { ollamaClient, OllamaClient } from "../llm/OllamaClient.js";
import type { ChatMessage } from "../llm/types.js";
import { ToolRegistry } from "../tools/registry.js";
import { toolRegistry } from "../tools/index.js";
import { AgentLoop } from "./AgentLoop.js";
import { AgentMemory } from "./AgentMemory.js";
import { logAgentEvent } from "./AgentLogger.js";
import { TaskManager } from "./TaskManager.js";
import { agentEvents } from "./AgentEvents.js";
import { ProjectService } from "../services/ProjectService.js";
import { AppError } from "../utils/errors.js";
import { env } from "../utils/env.js";

export interface ChatTurnResult {
  reply: string;
  iterations: number;
  status: "COMPLETED" | "CANCELLED" | "MAX_ITERATIONS" | "FAILED";
  toolCalls: { name: string; success: boolean }[];
  /** Present when status is FAILED - structured per spec #44. */
  error?: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> };
}

/**
 * Top-level orchestrator (spec architecture diagram): wires the LLM,
 * tool registry, memory and loop together per project, and is the single
 * entry point routes call into. Owns per-project cancellation tokens.
 */
export class VideoAgent {
  private registry: ToolRegistry;
  private loop: AgentLoop;
  private cancellations = new Map<string, AbortController>();

  constructor(llm: OllamaClient = ollamaClient, registry: ToolRegistry = toolRegistry) {
    this.registry = registry;
    this.loop = new AgentLoop(llm, this.registry, {
      maxIterations: env.MAX_AGENT_ITERATIONS,
      toolTimeoutMs: env.TOOL_TIMEOUT_MS,
      maxToolRetries: env.MAX_TOOL_RETRIES,
    });
  }

  cancel(projectId: string): boolean {
    const controller = this.cancellations.get(projectId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  async handleChatMessage(projectId: string, userText: string): Promise<ChatTurnResult> {
    // Fail fast (and propagate a real 404) if the project doesn't exist,
    // before entering the block that turns failures into a FAILED result.
    await ProjectService.get(projectId);

    const controller = new AbortController();
    this.cancellations.set(projectId, controller);

    const toolCallSummary: { name: string; success: boolean }[] = [];

    agentEvents.publish({ type: "agent_started", projectId, data: { userText } });

    try {
      await ProjectService.setAgentState(projectId, "ANALYZING");
      agentEvents.publish({ type: "agent_state_changed", projectId, data: { agentState: "ANALYZING" } });
      await logAgentEvent({ projectId, agentState: "ANALYZING", message: `User: ${userText}` });

      const systemPrompt = await AgentMemory.buildSystemPrompt(projectId);
      const history = await AgentMemory.getHistory(projectId);
      await AgentMemory.appendMessage(projectId, { role: "user", content: userText });

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userText },
      ];

      const taskId = await TaskManager.start(projectId, "chat_turn", { userText });

      const result = await this.loop.run(
        messages,
        { projectId, signal: controller.signal },
        {
          onToolStart: (call) => {
            agentEvents.publish({ type: "tool_called", projectId, data: { tool: call.function.name } });
          },
          onToolResult: (log) => {
            toolCallSummary.push({ name: log.toolName, success: log.result.success });
            agentEvents.publish({
              type: "tool_completed",
              projectId,
              data: { tool: log.toolName, success: log.result.success, durationMs: log.durationMs },
            });
            // fire-and-forget logging; failures here must not break the loop
            void logAgentEvent({
              projectId,
              agentState: "ANALYZING",
              task: "chat_turn",
              tool: log.toolName,
              durationMs: log.durationMs,
              level: log.result.success ? "info" : "warn",
              message: log.result.success
                ? `Tool ${log.toolName} succeeded (${log.retries} retries)`
                : `Tool ${log.toolName} failed: ${log.result.error?.message}`,
              data: { input: log.input, result: log.result },
            });
          },
        }
      );

      if (result.status === "COMPLETED") {
        await TaskManager.complete(taskId, { reply: result.finalText });
        await AgentMemory.appendMessage(projectId, { role: "assistant", content: result.finalText });
        await ProjectService.setAgentState(projectId, "IDLE");
        agentEvents.publish({ type: "agent_state_changed", projectId, data: { agentState: "IDLE" } });
        await logAgentEvent({ projectId, agentState: "IDLE", message: "Turn completed." });
        agentEvents.publish({ type: "project_completed", projectId, data: { status: "COMPLETED" } });
      } else if (result.status === "CANCELLED") {
        await TaskManager.fail(taskId, "Cancelled by user");
        await ProjectService.setAgentState(projectId, "CANCELLED");
        agentEvents.publish({ type: "agent_state_changed", projectId, data: { agentState: "CANCELLED" } });
        await logAgentEvent({ projectId, agentState: "CANCELLED", level: "warn", message: "Turn cancelled." });
      } else {
        await TaskManager.fail(taskId, "Max iterations exceeded");
        await ProjectService.setAgentState(projectId, "FAILED");
        agentEvents.publish({ type: "agent_state_changed", projectId, data: { agentState: "FAILED" } });
        await logAgentEvent({
          projectId,
          agentState: "FAILED",
          level: "error",
          message: `Exceeded max iterations (${env.MAX_AGENT_ITERATIONS}).`,
        });
        agentEvents.publish({ type: "error", projectId, data: { message: "Exceeded max iterations" } });
      }

      return {
        reply: result.finalText,
        iterations: result.iterations,
        status: result.status,
        toolCalls: toolCallSummary,
      };
    } catch (err) {
      const appErr = AppError.from(err);
      await ProjectService.setAgentState(projectId, "FAILED").catch(() => {});
      agentEvents.publish({ type: "agent_state_changed", projectId, data: { agentState: "FAILED" } });
      await logAgentEvent({
        projectId,
        agentState: "FAILED",
        level: "error",
        message: appErr.message,
        data: appErr.toJSON(),
      }).catch(() => {});
      agentEvents.publish({ type: "error", projectId, data: appErr.toJSON() });
      return { reply: "", iterations: 0, status: "FAILED", toolCalls: toolCallSummary, error: appErr.toJSON() };
    } finally {
      this.cancellations.delete(projectId);
    }
  }
}

export const videoAgent = new VideoAgent();

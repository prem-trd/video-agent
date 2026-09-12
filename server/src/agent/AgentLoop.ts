import type { OllamaClient } from "../llm/OllamaClient.js";
import type { ChatMessage, ToolCall } from "../llm/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import { ToolExecutor, type ToolExecutionLog } from "./ToolExecutor.js";

export interface AgentLoopOptions {
  maxIterations?: number;
  toolTimeoutMs?: number;
  maxToolRetries?: number;
}

export interface AgentLoopContext {
  projectId: string;
  signal?: AbortSignal;
}

export interface AgentLoopCallbacks {
  onIteration?: (iteration: number) => void;
  onAssistantMessage?: (message: ChatMessage) => void;
  onToolStart?: (call: ToolCall) => void;
  onToolResult?: (log: ToolExecutionLog) => void;
}

export interface AgentLoopResult {
  messages: ChatMessage[];
  finalText: string;
  iterations: number;
  status: "COMPLETED" | "CANCELLED" | "MAX_ITERATIONS";
}

/**
 * The core agent loop (spec #5):
 *
 *   while (!completed) {
 *     response = llm.call(messages, tools)
 *     if (response has tool calls) { execute tools; append results; continue }
 *     if (response is final) { complete }
 *   }
 *
 * The LLM never generates the whole project in one response - each
 * iteration is one reasoning step plus (optionally) one batch of tool
 * calls. Enforces max iterations, per-tool timeout/retry, and cooperative
 * cancellation via AbortSignal.
 */
export class AgentLoop {
  private readonly maxIterations: number;
  private readonly executor: ToolExecutor;

  constructor(private llm: OllamaClient, private registry: ToolRegistry, opts: AgentLoopOptions = {}) {
    this.maxIterations = opts.maxIterations ?? 50;
    this.executor = new ToolExecutor(registry, {
      toolTimeoutMs: opts.toolTimeoutMs,
      maxToolRetries: opts.maxToolRetries,
    });
  }

  async run(
    initialMessages: ChatMessage[],
    ctx: AgentLoopContext,
    callbacks: AgentLoopCallbacks = {}
  ): Promise<AgentLoopResult> {
    const messages = [...initialMessages];
    let iterations = 0;

    while (iterations < this.maxIterations) {
      if (ctx.signal?.aborted) {
        return { messages, finalText: "", iterations, status: "CANCELLED" };
      }

      callbacks.onIteration?.(iterations);

      const response = await this.llm.chat(messages, {
        tools: this.registry.toOpenAITools(),
        toolChoice: "auto",
        signal: ctx.signal,
      });

      messages.push(response.message);
      callbacks.onAssistantMessage?.(response.message);

      const toolCalls = response.message.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        for (const call of toolCalls) {
          if (ctx.signal?.aborted) {
            return { messages, finalText: "", iterations, status: "CANCELLED" };
          }

          callbacks.onToolStart?.(call);
          const log = await this.executor.execute(call, { projectId: ctx.projectId, signal: ctx.signal });
          callbacks.onToolResult?.(log);

          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(log.result),
          });
        }
        iterations++;
        continue;
      }

      // No tool calls -> this is the model's final answer for this turn.
      return { messages, finalText: response.message.content ?? "", iterations: iterations + 1, status: "COMPLETED" };
    }

    return { messages, finalText: "", iterations, status: "MAX_ITERATIONS" };
  }
}

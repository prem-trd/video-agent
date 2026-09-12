import type { ToolRegistry } from "../tools/registry.js";
import type { ToolCall } from "../llm/types.js";
import type { ToolContext, ToolResult } from "../tools/types.js";
import { AppError } from "../utils/errors.js";
import { env } from "../utils/env.js";

export interface ToolExecutionLog {
  toolName: string;
  toolCallId: string;
  input: unknown;
  result: ToolResult;
  durationMs: number;
  retries: number;
}

export interface ToolExecutorOptions {
  toolTimeoutMs?: number;
  maxToolRetries?: number;
  onLog?: (log: ToolExecutionLog) => void | Promise<void>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AppError("TIMEOUT_ERROR", `Tool "${label}" timed out after ${ms}ms`, { retryable: true }));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Executes a single LLM tool call: parses arguments, validates them against
 * the tool's zod schema, runs the tool with a timeout, retries transient
 * failures, and always returns a structured ToolResult (never throws) so
 * the agent loop can feed the result straight back to the LLM.
 */
export class ToolExecutor {
  constructor(private registry: ToolRegistry, private opts: ToolExecutorOptions = {}) {}

  async execute(toolCall: ToolCall, ctx: ToolContext): Promise<ToolExecutionLog> {
    const start = Date.now();
    const toolTimeoutMs = this.opts.toolTimeoutMs ?? env.TOOL_TIMEOUT_MS;
    const maxRetries = this.opts.maxToolRetries ?? env.MAX_TOOL_RETRIES;
    const name = toolCall.function.name;

    let input: unknown;
    let result: ToolResult;

    try {
      const tool = this.registry.get(name);

      try {
        input = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
      } catch {
        result = errorResult(new AppError("VALIDATION_ERROR", "Tool arguments were not valid JSON.", { retryable: false }));
        return this.finish(name, toolCall.id, input, result, start, 0);
      }

      const parsed = tool.inputSchema.safeParse(input);
      if (!parsed.success) {
        result = errorResult(
          new AppError("VALIDATION_ERROR", "Tool arguments failed schema validation.", {
            retryable: false,
            details: { issues: parsed.error.issues },
          })
        );
        return this.finish(name, toolCall.id, input, result, start, 0);
      }

      const effectiveMaxRetries = tool.retryable === false ? 0 : maxRetries;
      let attempt = 0;
      let lastError: AppError | null = null;

      while (attempt <= effectiveMaxRetries) {
        try {
          const data = await withTimeout(
            tool.execute(parsed.data, ctx),
            tool.timeoutMs ?? toolTimeoutMs,
            name
          );
          return this.finish(name, toolCall.id, parsed.data, { success: true, data }, start, attempt);
        } catch (err) {
          const appErr = AppError.from(err, "TOOL_ERROR");
          lastError = appErr;
          if (!appErr.retryable || attempt === effectiveMaxRetries) break;
          await sleep(300 * 2 ** attempt);
          attempt++;
        }
      }

      result = errorResult(lastError ?? new AppError("TOOL_ERROR", "Unknown tool failure"));
      return this.finish(name, toolCall.id, input, result, start, attempt);
    } catch (err) {
      // unknown tool name, or unexpected error resolving/validating it
      result = errorResult(AppError.from(err, "TOOL_ERROR"));
      return this.finish(name, toolCall.id, input, result, start, 0);
    }
  }

  private async finish(
    toolName: string,
    toolCallId: string,
    input: unknown,
    result: ToolResult,
    start: number,
    retries: number
  ): Promise<ToolExecutionLog> {
    const log: ToolExecutionLog = { toolName, toolCallId, input, result, durationMs: Date.now() - start, retries };
    if (this.opts.onLog) await this.opts.onLog(log);
    return log;
  }
}

function errorResult(err: AppError): ToolResult {
  return { success: false, error: err.toJSON() };
}

import { z } from "zod";
import { env, isOllamaConfigured } from "../utils/env.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";
import type { ChatMessage, ChatOptions, ChatResult, StreamChunk, ToolCall } from "./types.js";

const log = childLogger({ module: "OllamaClient" });

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = { maxRetries: 3, baseDelayMs: 500 };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thin, well-typed client over Ollama Cloud's OpenAI-compatible
 * `/chat/completions` endpoint. This is the ONLY place in the server that
 * talks to the LLM, and the ONLY place the OLLAMA_API_KEY is read. It is
 * never sent to the browser.
 *
 * Responsibilities: chat, streaming, tool calling, structured JSON output,
 * retries with backoff, timeouts, and typed error classification.
 */
export class OllamaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts?: { baseUrl?: string; apiKey?: string; model?: string; timeoutMs?: number }) {
    this.baseUrl = (opts?.baseUrl ?? env.OLLAMA_BASE_URL).replace(/\/+$/, "");
    this.apiKey = opts?.apiKey ?? env.OLLAMA_API_KEY;
    this.model = opts?.model ?? env.OLLAMA_MODEL;
    this.timeoutMs = opts?.timeoutMs ?? env.LLM_TIMEOUT_MS;
  }

  get modelName() {
    return this.model;
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  /**
   * Non-streaming chat completion, with tool-calling support and
   * automatic retry on transient failures.
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}, retry: RetryConfig = DEFAULT_RETRY): Promise<ChatResult> {
    if (!this.isConfigured()) {
      throw new AppError("LLM_AUTH_ERROR", "OLLAMA_API_KEY is not set. Add it to your .env file.", {
        retryable: false,
      });
    }

    let attempt = 0;
    let lastError: AppError | null = null;

    while (attempt <= retry.maxRetries) {
      try {
        return await this.chatOnce(messages, options);
      } catch (err) {
        const appErr = AppError.from(err, "LLM_ERROR");
        lastError = appErr;
        if (!appErr.retryable || attempt === retry.maxRetries) {
          log.error({ err: appErr.toJSON(), attempt }, "LLM chat failed, not retrying");
          throw appErr;
        }
        const delay = retry.baseDelayMs * 2 ** attempt;
        log.warn({ err: appErr.toJSON(), attempt, delay }, "LLM chat failed, retrying");
        await sleep(delay);
        attempt++;
      }
    }

    // unreachable, but keeps TS happy
    throw lastError ?? new AppError("LLM_ERROR", "Unknown LLM failure");
  }

  private async chatOnce(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    // chain caller-provided signal, if any
    const externalSignal = options.signal;
    if (externalSignal) {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
    };
    if (options.tools?.length) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice ?? "auto";
    }
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.responseFormat) body.response_format = options.responseFormat;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (controller.signal.aborted) {
        throw new AppError("LLM_TIMEOUT", `Ollama request timed out after ${this.timeoutMs}ms`, {
          retryable: true,
        });
      }
      throw new AppError("NETWORK_ERROR", `Failed to reach Ollama Cloud: ${(err as Error).message}`, {
        retryable: true,
        details: { baseUrl: this.baseUrl },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      throw await this.toApiError(res);
    }

    const json = (await res.json()) as any;
    const choice = json?.choices?.[0];
    if (!choice) {
      throw new AppError("LLM_ERROR", "Ollama response had no choices", { retryable: false, details: { json } });
    }

    return {
      message: choice.message as ChatMessage,
      finishReason: choice.finish_reason ?? null,
      model: json.model ?? this.model,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
            totalTokens: json.usage.total_tokens ?? 0,
          }
        : undefined,
      raw: json,
    };
  }

  private async toApiError(res: Response): Promise<AppError> {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      /* ignore */
    }
    const details = { status: res.status, body: bodyText.slice(0, 2000) };

    if (res.status === 401 || res.status === 403) {
      return new AppError("LLM_AUTH_ERROR", "Ollama Cloud rejected the API key (unauthorized).", {
        retryable: false,
        details,
      });
    }
    if (res.status === 429) {
      return new AppError("LLM_RATE_LIMIT", "Ollama Cloud rate limit exceeded.", { retryable: true, details });
    }
    if (res.status >= 500) {
      return new AppError("LLM_ERROR", `Ollama Cloud server error (${res.status}).`, { retryable: true, details });
    }
    return new AppError("LLM_ERROR", `Ollama Cloud request failed (${res.status}).`, { retryable: false, details });
  }

  /**
   * Streaming chat completion. Yields incremental text + tool call deltas.
   * Tool call argument fragments are accumulated internally and only
   * surfaced (complete) in the final chunk, since partial JSON isn't
   * useful to callers.
   */
  async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<StreamChunk> {
    if (!this.isConfigured()) {
      throw new AppError("LLM_AUTH_ERROR", "OLLAMA_API_KEY is not set. Add it to your .env file.", {
        retryable: false,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true,
    };
    if (options.tools?.length) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice ?? "auto";
    }
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (controller.signal.aborted) {
        throw new AppError("LLM_TIMEOUT", `Ollama stream timed out after ${this.timeoutMs}ms`, { retryable: true });
      }
      throw new AppError("NETWORK_ERROR", `Failed to reach Ollama Cloud: ${(err as Error).message}`, {
        retryable: true,
      });
    }

    if (!res.ok || !res.body) {
      clearTimeout(timeout);
      throw await this.toApiError(res);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolCallAcc = new Map<number, { id: string; name: string; args: string }>();
    let finalChunkSent = false;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            if (!finalChunkSent) {
              yield { delta: "", finishReason: "stop", done: true, toolCalls: finalizeToolCalls(toolCallAcc) };
            }
            return;
          }
          let parsed: any;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          const choice = parsed.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta ?? {};

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const existing = toolCallAcc.get(idx) ?? { id: tc.id ?? "", name: "", args: "" };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name += tc.function.name;
              if (tc.function?.arguments) existing.args += tc.function.arguments;
              toolCallAcc.set(idx, existing);
            }
          }

          const finishReason = choice.finish_reason ?? null;
          const textDelta: string = delta.content ?? "";
          if (textDelta || finishReason) {
            const isDone = Boolean(finishReason) && finishReason !== "tool_calls";
            if (isDone) finalChunkSent = true;
            yield {
              delta: textDelta,
              finishReason,
              done: isDone,
              toolCalls: finishReason ? finalizeToolCalls(toolCallAcc) : undefined,
            };
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        throw new AppError("LLM_TIMEOUT", `Ollama stream timed out after ${this.timeoutMs}ms`, { retryable: true });
      }
      throw new AppError("NETWORK_ERROR", `Ollama stream failed: ${(err as Error).message}`, { retryable: true });
    } finally {
      clearTimeout(timeout);
      reader.releaseLock();
    }
  }

  /**
   * Chat that requires a structured JSON response validated against a zod
   * schema. Retries with a corrective message if the model returns invalid
   * JSON or fails schema validation (up to `maxRetries` times).
   */
  async chatJSON<T>(
    messages: ChatMessage[],
    // Input is intentionally left as `any` (rather than defaulting to T):
    // schemas that use z.default() have an Input type looser than their
    // Output type, and T here should always bind to the Output.
    schema: z.ZodType<T, z.ZodTypeDef, any>,
    options: ChatOptions = {},
    maxRetries = 2
  ): Promise<T> {
    const working = [...messages];
    let attempt = 0;

    while (true) {
      const result = await this.chat(working, { ...options, responseFormat: { type: "json_object" } });
      const content = result.message.content ?? "";

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch {
        if (attempt >= maxRetries) {
          throw new AppError("LLM_ERROR", "Model did not return valid JSON after retries.", {
            retryable: false,
            details: { content },
          });
        }
        working.push({ role: "assistant", content });
        working.push({
          role: "user",
          content: "That was not valid JSON. Respond again with ONLY a single valid JSON object, no prose.",
        });
        attempt++;
        continue;
      }

      const validated = schema.safeParse(parsedJson);
      if (validated.success) return validated.data;

      if (attempt >= maxRetries) {
        throw new AppError("VALIDATION_ERROR", "Model JSON failed schema validation after retries.", {
          retryable: false,
          details: { issues: validated.error.issues, content },
        });
      }
      working.push({ role: "assistant", content });
      working.push({
        role: "user",
        content: `That JSON failed schema validation: ${JSON.stringify(
          validated.error.issues
        )}. Respond again with ONLY a corrected JSON object.`,
      });
      attempt++;
    }
  }
}

function finalizeToolCalls(acc: Map<number, { id: string; name: string; args: string }>): ToolCall[] | undefined {
  if (acc.size === 0) return undefined;
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => ({
      id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
      type: "function" as const,
      function: { name: tc.name, arguments: tc.args },
    }));
}

// Singleton used across the app (agent loop, tools, chat route).
export const ollamaClient = new OllamaClient();

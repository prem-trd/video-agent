import type { z } from "zod";

// Every tool the LLM can call goes through this contract (spec #25).
// Tools are the ONLY way the agent touches the filesystem, ffmpeg, or
// providers - the LLM never gets raw shell/filesystem access (spec #26).

export interface ToolContext {
  projectId: string;
  /** Per-run cancellation signal, checked by long-running tools. */
  signal?: AbortSignal;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

export interface Tool<TInput = any, TOutput = any> {
  name: string;
  description: string;
  // Input is intentionally `any` rather than defaulting to TInput: schemas
  // built with z.preprocess (looseOptional) or z.default() have an input
  // type looser than their output type T, and TInput should always bind
  // to the output.
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, any>;
  /** Tool-specific timeout override; falls back to TOOL_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Whether a transient failure should be retried by the executor. Default true. */
  retryable?: boolean;
  execute(input: TInput, ctx: ToolContext): Promise<TOutput>;
}

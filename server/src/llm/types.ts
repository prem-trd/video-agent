// Types for the OpenAI-compatible chat completion protocol that Ollama
// Cloud speaks. Kept separate from OllamaClient so tools/agent code can
// import types without pulling in the HTTP implementation.

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON-encoded string, per OpenAI protocol
  };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface ChatOptions {
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | "required";
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" } | { type: "text" };
  signal?: AbortSignal;
}

export interface ChatResult {
  message: ChatMessage;
  finishReason: string | null;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  raw: unknown;
}

export interface StreamChunk {
  /** incremental text delta, if any */
  delta: string;
  /** tool call deltas accumulate across chunks - emitted once complete */
  toolCalls?: ToolCall[];
  finishReason: string | null;
  done: boolean;
}

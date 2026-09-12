import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "./types.js";
import type { ToolDefinition } from "../llm/types.js";
import { AppError } from "../utils/errors.js";

/**
 * Central registry of every tool available to the agent. The AgentLoop
 * never hard-codes tool names - it asks the registry for the OpenAI-style
 * tool definitions to send to the LLM, and looks tools up by name when the
 * LLM asks to call one.
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new AppError("TOOL_ERROR", `Unknown tool: "${name}"`, { retryable: false });
    }
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  /** Converts every registered tool to the JSON-schema tool definitions the LLM expects. */
  toOpenAITools(): ToolDefinition[] {
    return this.list().map((tool) => {
      const schema = zodToJsonSchema(tool.inputSchema, { target: "openApi3" }) as Record<string, unknown>;
      delete schema.$schema;
      return {
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: schema,
        },
      };
    });
  }
}

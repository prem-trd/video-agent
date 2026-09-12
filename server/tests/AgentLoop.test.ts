import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { AgentLoop } from "../src/agent/AgentLoop.js";
import { ToolRegistry } from "../src/tools/registry.js";
import type { OllamaClient } from "../src/llm/OllamaClient.js";
import type { ChatResult } from "../src/llm/types.js";

function fakeLlm(chatImpl: (messages: any[]) => Promise<ChatResult>): OllamaClient {
  return { chat: vi.fn(chatImpl) } as unknown as OllamaClient;
}

function registryWithEcho(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({
    name: "echo",
    description: "echoes input",
    inputSchema: z.object({ text: z.string() }),
    async execute(input) {
      return { echoed: input.text };
    },
  });
  return registry;
}

describe("AgentLoop", () => {
  it("returns immediately when the first response has no tool calls", async () => {
    const llm = fakeLlm(async () => ({
      message: { role: "assistant", content: "All done, no tools needed." },
      finishReason: "stop",
      model: "test",
      raw: {},
    }));
    const loop = new AgentLoop(llm, registryWithEcho(), { maxIterations: 5 });

    const result = await loop.run([{ role: "user", content: "hi" }], { projectId: "p1" });

    expect(result.status).toBe("COMPLETED");
    expect(result.finalText).toBe("All done, no tools needed.");
    expect(result.iterations).toBe(1);
  });

  it("calls a tool, feeds the result back, and completes on the next turn", async () => {
    let call = 0;
    const llm = fakeLlm(async (messages) => {
      call++;
      if (call === 1) {
        return {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{ id: "c1", type: "function", function: { name: "echo", arguments: '{"text":"hi"}' } }],
          },
          finishReason: "tool_calls",
          model: "test",
          raw: {},
        };
      }
      // second call: the tool result should now be in the message history
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe("tool");
      expect(JSON.parse(lastMessage.content).data.echoed).toBe("hi");
      return {
        message: { role: "assistant", content: "Echoed successfully." },
        finishReason: "stop",
        model: "test",
        raw: {},
      };
    });

    const loop = new AgentLoop(llm, registryWithEcho(), { maxIterations: 5 });
    const onToolResult = vi.fn();
    const result = await loop.run([{ role: "user", content: "echo hi" }], { projectId: "p1" }, { onToolResult });

    expect(result.status).toBe("COMPLETED");
    expect(result.finalText).toBe("Echoed successfully.");
    expect(onToolResult).toHaveBeenCalledTimes(1);
    expect(call).toBe(2);
  });

  it("stops and reports MAX_ITERATIONS if the model keeps calling tools forever", async () => {
    const llm = fakeLlm(async () => ({
      message: {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", type: "function", function: { name: "echo", arguments: '{"text":"loop"}' } }],
      },
      finishReason: "tool_calls",
      model: "test",
      raw: {},
    }));

    const loop = new AgentLoop(llm, registryWithEcho(), { maxIterations: 3 });
    const result = await loop.run([{ role: "user", content: "go forever" }], { projectId: "p1" });

    expect(result.status).toBe("MAX_ITERATIONS");
    expect(result.iterations).toBe(3);
  });

  it("stops immediately if the signal is already aborted", async () => {
    const llm = fakeLlm(async () => {
      throw new Error("should not be called");
    });
    const loop = new AgentLoop(llm, registryWithEcho(), { maxIterations: 5 });

    const controller = new AbortController();
    controller.abort();
    const result = await loop.run([{ role: "user", content: "hi" }], { projectId: "p1", signal: controller.signal });

    expect(result.status).toBe("CANCELLED");
  });

  it("cancels mid-loop between tool call iterations", async () => {
    const controller = new AbortController();
    let call = 0;
    const llm = fakeLlm(async () => {
      call++;
      if (call === 1) {
        // abort after the first response is produced, before the loop continues
        controller.abort();
        return {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{ id: "c1", type: "function", function: { name: "echo", arguments: '{"text":"x"}' } }],
          },
          finishReason: "tool_calls",
          model: "test",
          raw: {},
        };
      }
      throw new Error("should not reach a second LLM call after cancellation");
    });

    const loop = new AgentLoop(llm, registryWithEcho(), { maxIterations: 5 });
    const result = await loop.run([{ role: "user", content: "hi" }], { projectId: "p1", signal: controller.signal });

    expect(result.status).toBe("CANCELLED");
    expect(call).toBe(1);
  });

  it("surfaces a failed tool result to the model instead of throwing", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "always_fails",
      description: "",
      inputSchema: z.object({}),
      retryable: false,
      async execute() {
        throw new Error("boom");
      },
    });

    let call = 0;
    const llm = fakeLlm(async (messages) => {
      call++;
      if (call === 1) {
        return {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{ id: "c1", type: "function", function: { name: "always_fails", arguments: "{}" } }],
          },
          finishReason: "tool_calls",
          model: "test",
          raw: {},
        };
      }
      const toolMsg = messages[messages.length - 1];
      const parsed = JSON.parse(toolMsg.content);
      expect(parsed.success).toBe(false);
      return { message: { role: "assistant", content: "Handled the failure." }, finishReason: "stop", model: "test", raw: {} };
    });

    const loop = new AgentLoop(llm, registry, { maxIterations: 5 });
    const result = await loop.run([{ role: "user", content: "try" }], { projectId: "p1" });

    expect(result.status).toBe("COMPLETED");
    expect(result.finalText).toBe("Handled the failure.");
  });
});

import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../src/tools/registry.js";
import { ToolExecutor } from "../src/agent/ToolExecutor.js";
import type { Tool } from "../src/tools/types.js";

function makeCall(name: string, args: unknown, id = "call_1") {
  return { id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } };
}

describe("ToolExecutor", () => {
  it("executes a tool and returns a successful structured result", async () => {
    const tool: Tool<{ x: number }> = {
      name: "double",
      description: "doubles a number",
      inputSchema: z.object({ x: z.number() }),
      async execute(input) {
        return { result: input.x * 2 };
      },
    };
    const registry = new ToolRegistry();
    registry.register(tool);
    const executor = new ToolExecutor(registry);

    const log = await executor.execute(makeCall("double", { x: 21 }), { projectId: "p1" });

    expect(log.result.success).toBe(true);
    expect(log.result.data).toEqual({ result: 42 });
    expect(log.retries).toBe(0);
  });

  it("returns a structured error for an unknown tool without throwing", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);

    const log = await executor.execute(makeCall("does_not_exist", {}), { projectId: "p1" });

    expect(log.result.success).toBe(false);
    expect(log.result.error?.code).toBe("TOOL_ERROR");
  });

  it("returns a validation error when arguments fail the zod schema", async () => {
    const tool: Tool<{ x: number }> = {
      name: "needs_number",
      description: "",
      inputSchema: z.object({ x: z.number() }),
      async execute(input) {
        return input;
      },
    };
    const registry = new ToolRegistry();
    registry.register(tool);
    const executor = new ToolExecutor(registry);

    const log = await executor.execute(makeCall("needs_number", { x: "not-a-number" }), { projectId: "p1" });

    expect(log.result.success).toBe(false);
    expect(log.result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns a validation error for malformed JSON arguments", async () => {
    const tool: Tool<{}> = {
      name: "noop",
      description: "",
      inputSchema: z.object({}),
      async execute() {
        return {};
      },
    };
    const registry = new ToolRegistry();
    registry.register(tool);
    const executor = new ToolExecutor(registry);

    const call = { id: "c1", type: "function" as const, function: { name: "noop", arguments: "{not valid json" } };
    const log = await executor.execute(call, { projectId: "p1" });

    expect(log.result.success).toBe(false);
    expect(log.result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("retries a retryable tool failure and eventually succeeds", async () => {
    let calls = 0;
    const tool: Tool<{}> = {
      name: "flaky",
      description: "",
      inputSchema: z.object({}),
      async execute() {
        calls++;
        if (calls < 3) {
          const { AppError } = await import("../src/utils/errors.js");
          throw new AppError("PROVIDER_ERROR", "temporary glitch", { retryable: true });
        }
        return { ok: true };
      },
    };
    const registry = new ToolRegistry();
    registry.register(tool);
    const executor = new ToolExecutor(registry, { maxToolRetries: 3 });

    const log = await executor.execute(makeCall("flaky", {}), { projectId: "p1" });

    expect(log.result.success).toBe(true);
    expect(calls).toBe(3);
    expect(log.retries).toBe(2);
  });

  it("does not retry a non-retryable failure", async () => {
    let calls = 0;
    const tool: Tool<{}> = {
      name: "always_bad_input",
      description: "",
      inputSchema: z.object({}),
      async execute() {
        calls++;
        const { AppError } = await import("../src/utils/errors.js");
        throw new AppError("VALIDATION_ERROR", "bad input", { retryable: false });
      },
    };
    const registry = new ToolRegistry();
    registry.register(tool);
    const executor = new ToolExecutor(registry, { maxToolRetries: 3 });

    const log = await executor.execute(makeCall("always_bad_input", {}), { projectId: "p1" });

    expect(log.result.success).toBe(false);
    expect(calls).toBe(1);
  });

  it("times out a hanging tool", async () => {
    const tool: Tool<{}> = {
      name: "hangs",
      description: "",
      inputSchema: z.object({}),
      timeoutMs: 30,
      retryable: false,
      async execute() {
        return new Promise(() => {}); // never resolves
      },
    };
    const registry = new ToolRegistry();
    registry.register(tool);
    const executor = new ToolExecutor(registry);

    const log = await executor.execute(makeCall("hangs", {}), { projectId: "p1" });

    expect(log.result.success).toBe(false);
    expect(log.result.error?.code).toBe("TIMEOUT_ERROR");
  });

  it("invokes onLog for every execution", async () => {
    const tool: Tool<{}> = {
      name: "noop2",
      description: "",
      inputSchema: z.object({}),
      async execute() {
        return { ok: true };
      },
    };
    const registry = new ToolRegistry();
    registry.register(tool);
    const onLog = vi.fn();
    const executor = new ToolExecutor(registry, { onLog });

    await executor.execute(makeCall("noop2", {}), { projectId: "p1" });

    expect(onLog).toHaveBeenCalledTimes(1);
  });
});

describe("ToolRegistry", () => {
  it("converts registered tools to OpenAI-style tool definitions", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "greet",
      description: "says hello",
      inputSchema: z.object({ name: z.string() }),
      async execute(input) {
        return `hello ${input.name}`;
      },
    });

    const defs = registry.toOpenAITools();
    expect(defs).toHaveLength(1);
    expect(defs[0].type).toBe("function");
    expect(defs[0].function.name).toBe("greet");
    expect(defs[0].function.parameters).toBeTypeOf("object");
  });

  it("throws when registering a duplicate tool name", () => {
    const registry = new ToolRegistry();
    const tool: Tool<{}> = { name: "dup", description: "", inputSchema: z.object({}), async execute() { return {}; } };
    registry.register(tool);
    expect(() => registry.register(tool)).toThrow();
  });
});

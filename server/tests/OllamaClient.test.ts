import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { OllamaClient } from "../src/llm/OllamaClient.js";
import { AppError } from "../src/utils/errors.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OllamaClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function client(opts: Partial<ConstructorParameters<typeof OllamaClient>[0]> = {}) {
    return new OllamaClient({
      baseUrl: "https://fake-ollama.test/v1",
      apiKey: "test-key",
      model: "gpt-oss:120b-cloud",
      timeoutMs: 5000,
      ...opts,
    });
  }

  it("throws LLM_AUTH_ERROR when no API key is configured", async () => {
    const c = client({ apiKey: "" });
    await expect(c.chat([{ role: "user", content: "hi" }])).rejects.toMatchObject({
      code: "LLM_AUTH_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the assistant message on a successful chat call", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        model: "gpt-oss:120b-cloud",
        choices: [{ message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      })
    );

    const c = client();
    const result = await c.chat([{ role: "user", content: "ping" }]);

    expect(result.message.content).toBe("pong");
    expect(result.finishReason).toBe("stop");
    expect(result.usage?.totalTokens).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fake-ollama.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });

  it("sends tools and tool_choice when tools are provided", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        model: "gpt-oss:120b-cloud",
        choices: [
          {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: "{}" } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      })
    );

    const c = client();
    const result = await c.chat([{ role: "user", content: "weather?" }], {
      tools: [
        { type: "function", function: { name: "get_weather", description: "get weather", parameters: {} } },
      ],
    });

    expect(result.message.tool_calls?.[0].function.name).toBe("get_weather");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe("auto");
  });

  it("does not retry on 401 (auth errors are not retryable)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));

    const c = client();
    await expect(c.chat([{ role: "user", content: "hi" }])).rejects.toMatchObject({
      code: "LLM_AUTH_ERROR",
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and eventually succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { error: "server error" }))
      .mockResolvedValueOnce(jsonResponse(500, { error: "server error" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          model: "gpt-oss:120b-cloud",
          choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        })
      );

    const c = client();
    const result = await c.chat([{ role: "user", content: "hi" }], {}, { maxRetries: 3, baseDelayMs: 1 });

    expect(result.message.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after maxRetries on persistent 500s", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(500, { error: "server error" })));

    const c = client();
    await expect(
      c.chat([{ role: "user", content: "hi" }], {}, { maxRetries: 2, baseDelayMs: 1 })
    ).rejects.toMatchObject({ code: "LLM_ERROR", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("classifies 429 as a retryable rate limit error", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { error: "rate limited" }));

    const c = client();
    await expect(
      c.chat([{ role: "user", content: "hi" }], {}, { maxRetries: 0, baseDelayMs: 1 })
    ).rejects.toMatchObject({ code: "LLM_RATE_LIMIT", retryable: true });
  });

  it("chatJSON validates the response against a zod schema", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        model: "gpt-oss:120b-cloud",
        choices: [{ message: { role: "assistant", content: '{"title":"ABC Video","duration":60}' }, finish_reason: "stop" }],
      })
    );

    const schema = z.object({ title: z.string(), duration: z.number() });
    const c = client();
    const data = await c.chatJSON([{ role: "user", content: "plan a video" }], schema);

    expect(data.title).toBe("ABC Video");
    expect(data.duration).toBe(60);
  });

  it("chatJSON retries with a correction message on invalid JSON", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          model: "gpt-oss:120b-cloud",
          choices: [{ message: { role: "assistant", content: "not json at all" }, finish_reason: "stop" }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          model: "gpt-oss:120b-cloud",
          choices: [{ message: { role: "assistant", content: '{"title":"Fixed","duration":30}' }, finish_reason: "stop" }],
        })
      );

    const schema = z.object({ title: z.string(), duration: z.number() });
    const c = client();
    const data = await c.chatJSON([{ role: "user", content: "plan a video" }], schema, {}, 2);

    expect(data.title).toBe("Fixed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("chatJSON gives up after maxRetries on schema validation failure", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(200, {
          model: "gpt-oss:120b-cloud",
          choices: [{ message: { role: "assistant", content: '{"title":123}' }, finish_reason: "stop" }],
        })
      )
    );

    const schema = z.object({ title: z.string(), duration: z.number() });
    const c = client();
    await expect(c.chatJSON([{ role: "user", content: "plan" }], schema, {}, 1)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it("chatStream yields text deltas and a single done event", async () => {
    const sseBody = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}`,
      `data: [DONE]`,
      "",
    ].join("\n\n");

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseBody));
        controller.close();
      },
    });

    fetchMock.mockResolvedValueOnce(
      new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } })
    );

    const c = client();
    let text = "";
    let doneCount = 0;
    for await (const chunk of c.chatStream([{ role: "user", content: "hi" }])) {
      text += chunk.delta;
      if (chunk.done) doneCount++;
    }

    expect(text).toBe("Hello");
    expect(doneCount).toBe(1);
  });

  it("wraps network failures as retryable NETWORK_ERROR", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const c = client();
    await expect(
      c.chat([{ role: "user", content: "hi" }], {}, { maxRetries: 0, baseDelayMs: 1 })
    ).rejects.toMatchObject({ code: "NETWORK_ERROR", retryable: true });
  });

  it("AppError.toJSON never leaks the api key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));
    const c = client({ apiKey: "super-secret-key" });
    try {
      await c.chat([{ role: "user", content: "hi" }]);
      expect.unreachable();
    } catch (err) {
      const serialized = JSON.stringify((err as AppError).toJSON());
      expect(serialized).not.toContain("super-secret-key");
    }
  });
});

import { Router } from "express";
import { ollamaClient } from "../llm/OllamaClient.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";

const log = childLogger({ module: "health-route" });
export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ ok: true, service: "ai-video-studio-server", time: new Date().toISOString() });
});

/**
 * Phase 1 verification endpoint: proves the full chain
 * React -> Node -> OllamaClient -> Ollama Cloud -> gpt-oss:120b works.
 * Never returns the API key - only whether it's configured.
 */
healthRouter.post("/ollama", async (_req, res) => {
  if (!ollamaClient.isConfigured()) {
    return res.status(200).json({
      ok: false,
      error: "OLLAMA_API_KEY is not set on the server. Copy .env.example to .env and add your key.",
    });
  }

  try {
    const result = await ollamaClient.chat(
      [
        { role: "system", content: "You are a connectivity test. Reply with exactly: pong" },
        { role: "user", content: "ping" },
      ],
      { temperature: 0 }
    );

    res.json({
      ok: true,
      model: result.model,
      reply: result.message.content,
      usage: result.usage,
    });
  } catch (err) {
    const appErr = AppError.from(err, "LLM_ERROR");
    log.error({ err: appErr.toJSON() }, "Ollama health check failed");
    res.status(200).json({ ok: false, error: appErr.message, code: appErr.code });
  }
});

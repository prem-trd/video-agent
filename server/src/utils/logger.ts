import pino from "pino";
import { env } from "./env.js";

// Structured logging (spec #45). Never log secrets - callers must not pass
// API keys into `data`. We defensively redact common key names anyway.
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ["*.apiKey", "*.OLLAMA_API_KEY", "*.authorization", "*.Authorization", "*.headers.authorization"],
    censor: "[REDACTED]",
  },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
      : undefined,
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

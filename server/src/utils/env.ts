import "dotenv/config";
import path from "node:path";
import { z } from "zod";

// Single source of truth for configuration (spec #40). Loaded once at
// startup; the process exits with a clear message if required values are
// missing so we never silently run half-configured.

const EnvSchema = z.object({
  OLLAMA_API_KEY: z.string().optional().default(""),
  OLLAMA_BASE_URL: z.string().default("https://ollama.com/v1"),
  OLLAMA_MODEL: z.string().default("gpt-oss:120b-cloud"),

  VIDEO_PROVIDER: z.string().default("mock"),
  IMAGE_PROVIDER: z.string().default("mock"),
  TTS_PROVIDER: z.string().default("mock"),
  MUSIC_PROVIDER: z.string().default("mock"),

  IMAGE_PROVIDER_API_KEY: z.string().optional().default(""),
  VIDEO_PROVIDER_API_KEY: z.string().optional().default(""),
  TTS_PROVIDER_API_KEY: z.string().optional().default(""),
  MUSIC_PROVIDER_API_KEY: z.string().optional().default(""),

  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),

  PROJECT_STORAGE_PATH: z.string().default("./video-projects"),

  MAX_AGENT_ITERATIONS: z.coerce.number().int().positive().default(100),
  MAX_TOOL_RETRIES: z.coerce.number().int().min(0).default(3),
  TOOL_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  DATABASE_URL: z.string().default("file:./data/dev.db"),

  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Resolved absolute path - all filesystem tools must operate under this
// root only (spec #26 tool safety / path traversal protection).
export const PROJECT_STORAGE_ROOT = path.resolve(process.cwd(), env.PROJECT_STORAGE_PATH);

export const isOllamaConfigured = () => env.OLLAMA_API_KEY.trim().length > 0;

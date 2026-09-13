import express from "express";
import cors from "cors";
import fs from "node:fs";
import { env, PROJECT_STORAGE_ROOT } from "./utils/env.js";
import { logger } from "./utils/logger.js";
import { healthRouter } from "./routes/health.js";
import { projectsRouter } from "./routes/projects.js";
import { chatRouter } from "./routes/chat.js";
import { agentRouter } from "./routes/agent.js";
import { scenesRouter } from "./routes/scenes.js";
import { assetsRouter } from "./routes/assets.js";
import { mediaRouter } from "./routes/media.js";
import { uploadRouter } from "./routes/upload.js";
import { timelineRouter } from "./routes/timeline.js";
import { eventsRouter } from "./routes/events.js";
import { AppError } from "./utils/errors.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Ensure the project storage root exists before anything tries to write
// into it (spec #8 / #26).
fs.mkdirSync(PROJECT_STORAGE_ROOT, { recursive: true });

app.use("/api/health", healthRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/projects/:id/chat", chatRouter);
app.use("/api/projects/:id/scenes", scenesRouter);
app.use("/api/projects/:id/assets", assetsRouter);
app.use("/api/projects/:id/timeline", timelineRouter);
app.use("/api/projects/:id/events", eventsRouter);
app.use("/api/projects/:id", agentRouter); // /cancel, /status, /generate-prompts, /assemble, /renders/latest
app.use("/api/projects/:id", uploadRouter); // /upload, /upload-audio, /upload-subtitles
app.use("/api/projects/:id", mediaRouter); // /video, /thumbnail, /media, /files/*

// Central error handler - every route error surfaces as
// { code, message, retryable, details } (spec #44).
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const appErr = AppError.from(err);
  logger.error({ err: appErr.toJSON() }, "Unhandled route error");
  res.status(500).json({ error: appErr.toJSON() });
});

app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, model: env.OLLAMA_MODEL, storage: PROJECT_STORAGE_ROOT },
    `AI Video Studio server listening on http://localhost:${env.PORT}`
  );
});

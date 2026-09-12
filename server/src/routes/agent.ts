import { Router } from "express";
import { videoAgent } from "../agent/VideoAgent.js";
import { ProjectService, serializeProject } from "../services/ProjectService.js";
import { prisma } from "../database/prisma.js";
import { AppError } from "../utils/errors.js";

export const agentRouter = Router({ mergeParams: true });

const FULL_PIPELINE_INSTRUCTION =
  "Create the complete video from its current state: if planning/script/scenes aren't done yet, do those first; then use generate_all_scene_media (NOT one-by-one generate_video/generate_voice calls) to generate video and narration for every scene, plus generate_music for background music; then assemble (merge_videos, add_audio, add_music, generate_subtitles, add_subtitles) and validate the final video. Skip any step that's already done (a quick list_assets/read_project check is enough - do not repeat planning steps that already succeeded).";

/**
 * Convenience endpoint (spec #33 POST /generate) for a UI "Generate Video"
 * button - runs the exact same VideoAgent.handleChatMessage path as a
 * typed chat message, so it's recorded in chat history like any other turn.
 */
agentRouter.post("/generate", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const result = await videoAgent.handleChatMessage(projectId, FULL_PIPELINE_INSTRUCTION);
    res.json(result);
  } catch (err) {
    const appErr = AppError.from(err);
    res.status(appErr.code === "NOT_FOUND" ? 404 : 500).json({ error: appErr.toJSON() });
  }
});

agentRouter.post("/cancel", async (req, res) => {
  const { id: projectId } = req.params as { id: string };
  const cancelled = videoAgent.cancel(projectId);
  res.json({ cancelled });
});

agentRouter.get("/status", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const project = await ProjectService.get(projectId);
    const recentLogs = await prisma.agentLog.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const recentTasks = await prisma.agentTask.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({ project: serializeProject(project), agentState: project.agentState, logs: recentLogs, tasks: recentTasks });
  } catch (err) {
    const appErr = AppError.from(err);
    res.status(appErr.code === "NOT_FOUND" ? 404 : 500).json({ error: appErr.toJSON() });
  }
});

import { Router } from "express";
import { videoAgent } from "../agent/VideoAgent.js";
import { ProjectService, serializeProject } from "../services/ProjectService.js";
import { prisma } from "../database/prisma.js";
import { AppError } from "../utils/errors.js";

export const agentRouter = Router({ mergeParams: true });

const GENERATE_PROMPTS_INSTRUCTION =
  "Generate (or continue generating) the video/image prompts for this project from its current state: if the config isn't set yet, analyze_request/update_project first; then create_prompt_plan (unless it already ran - check the Style Bible in read_project), then create_story_structure, then generate_scene_prompts for every scene. Skip any step that's already done - a quick read_project check is enough, do not repeat steps that already succeeded. Never generate any actual media yourself - only prompts.";

const ASSEMBLE_INSTRUCTION =
  "Assemble the final video from the current timeline: first match_media_to_scene to resolve any ambiguous uploads (ask the user about any that remain ambiguous instead of guessing), then render_timeline, then add_narration and add_music ONLY if the corresponding audio track has actually been uploaded (read_project shows audioTracks), then generate_subtitles and add_subtitles ONLY if scenes have narration/on-screen text, then validate_video always last. Skip any step that's already done or not applicable rather than treating it as a failure.";

/** Convenience endpoints for the UI's "Generate Prompts" / "Assemble Video" buttons - same VideoAgent.handleChatMessage path as a typed chat message, so it's recorded in chat history like any other turn. */
agentRouter.post("/generate-prompts", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const result = await videoAgent.handleChatMessage(projectId, GENERATE_PROMPTS_INSTRUCTION);
    res.json(result);
  } catch (err) {
    const appErr = AppError.from(err);
    res.status(appErr.code === "NOT_FOUND" ? 404 : 500).json({ error: appErr.toJSON() });
  }
});

agentRouter.post("/assemble", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const result = await videoAgent.handleChatMessage(projectId, ASSEMBLE_INSTRUCTION);
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

/** Latest assembly result (spec: preview + duration/resolution/aspect ratio/item count/file size/validation). */
agentRouter.get("/renders/latest", async (req, res) => {
  const { id: projectId } = req.params as { id: string };
  const render = await prisma.render.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
  if (!render) {
    res.json(null);
    return;
  }
  let validationIssues: string[] = [];
  try {
    validationIssues = JSON.parse(render.validationIssues);
  } catch {
    /* ignore */
  }
  res.json({ ...render, validationIssues });
});

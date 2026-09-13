import { Router } from "express";
import { z } from "zod";
import { SceneService, serializeScene } from "../services/SceneService.js";
import { PromptVersionService, serializePromptVersion } from "../services/PromptVersionService.js";
import { toolRegistry } from "../tools/index.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";
import { looseOptional } from "../utils/zodHelpers.js";

const log = childLogger({ module: "scenes-route" });
export const scenesRouter = Router({ mergeParams: true });

function handleError(err: unknown, res: import("express").Response) {
  const appErr = AppError.from(err);
  log.error({ err: appErr.toJSON() }, "Scenes route error");
  const status = appErr.code === "NOT_FOUND" ? 404 : appErr.code === "VALIDATION_ERROR" ? 400 : 500;
  res.status(status).json({ error: appErr.toJSON() });
}

scenesRouter.get("/", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const scenes = await SceneService.list(projectId);
    res.json(scenes.map(serializeScene));
  } catch (err) {
    handleError(err, res);
  }
});

const PatchSceneSchema = z
  .object({
    narration: z.string().optional(),
    onScreenText: z.string().optional(),
    duration: z.number().positive().optional(),
    visualDescription: z.string().optional(),
    imagePrompt: z.string().optional(),
    videoPrompt: z.string().optional(),
    animationDirection: z.string().optional(),
    cameraDirection: z.string().optional(),
    composition: z.string().optional(),
    negativeInstructions: z.string().optional(),
    continuityNotes: z.string().optional(),
    characters: z.array(z.string()).optional(),
    environmentKey: z.string().optional(),
    transition: z.string().optional(),
    soundEffects: z.string().optional(),
    status: z.enum(["PLANNED", "GENERATING", "READY", "FAILED", "REGENERATING", "APPROVED"]).optional(),
  })
  .strict();

/** Direct UI-driven edit of a scene's fields - the human equivalent of the update_scene tool, without going through the LLM. */
scenesRouter.patch("/:sceneId", async (req, res) => {
  try {
    const { id: projectId, sceneId } = req.params as { id: string; sceneId: string };
    const patch = PatchSceneSchema.parse(req.body);
    const scene = await SceneService.update(projectId, sceneId, patch as any);
    res.json(serializeScene(scene));
  } catch (err) {
    handleError(err, res);
  }
});

/** Direct UI "+ Add scene(s)" action - runs the same add_scenes tool logic. */
const AddScenesBodySchema = z.object({ count: looseOptional(z.number().int().positive()), guidance: z.string().optional() }).strict();
scenesRouter.post("/", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const body = AddScenesBodySchema.parse(req.body ?? {});
    const tool = toolRegistry.get("add_scenes");
    const result = await tool.execute({ count: body.count ?? 1, guidance: body.guidance }, { projectId });
    res.json({ scenes: await SceneService.list(projectId).then((s) => s.map(serializeScene)), result });
  } catch (err) {
    handleError(err, res);
  }
});

/** Direct UI "delete scene" action. */
scenesRouter.delete("/:sceneId", async (req, res) => {
  try {
    const { id: projectId, sceneId } = req.params as { id: string; sceneId: string };
    await SceneService.get(projectId, sceneId);
    const tool = toolRegistry.get("remove_scene");
    await tool.execute({ sceneId }, { projectId });
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});

/** Direct UI reorder action ("move before/after"). */
const MoveSceneSchema = z.object({ beforeSceneNumber: looseOptional(z.number().int().positive()), afterSceneNumber: looseOptional(z.number().int().positive()) }).strict();
scenesRouter.post("/:sceneId/move", async (req, res) => {
  try {
    const { id: projectId, sceneId } = req.params as { id: string; sceneId: string };
    const body = MoveSceneSchema.parse(req.body);
    await SceneService.move(projectId, sceneId, body);
    res.json(await SceneService.get(projectId, sceneId).then(serializeScene));
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * Regenerates one scene's prompt directly (UI "regenerate" button). Runs
 * the same regenerate_scene_prompt tool logic used from chat.
 */
scenesRouter.post("/:sceneId/regenerate", async (req, res) => {
  try {
    const { id: projectId, sceneId } = req.params as { id: string; sceneId: string };
    await SceneService.get(projectId, sceneId);
    const tool = toolRegistry.get("regenerate_scene_prompt");
    const result = await tool.execute({ sceneId }, { projectId });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

/** Lists every historical prompt version for a scene. */
scenesRouter.get("/:sceneId/prompt-versions", async (req, res) => {
  try {
    const { id: projectId, sceneId } = req.params as { id: string; sceneId: string };
    await SceneService.get(projectId, sceneId); // 404s if missing/wrong project
    const versions = await PromptVersionService.listForScene(projectId, sceneId);
    res.json(versions.map(serializePromptVersion));
  } catch (err) {
    handleError(err, res);
  }
});

/** Restores a scene's prompt fields from a chosen historical version. */
scenesRouter.post("/:sceneId/prompt-versions/:versionId/activate", async (req, res) => {
  try {
    const { id: projectId, sceneId, versionId } = req.params as { id: string; sceneId: string; versionId: string };
    const scene = await PromptVersionService.activate(projectId, sceneId, versionId);
    res.json(serializeScene(scene));
  } catch (err) {
    handleError(err, res);
  }
});

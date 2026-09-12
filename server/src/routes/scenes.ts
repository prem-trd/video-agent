import { Router } from "express";
import { z } from "zod";
import { SceneService, serializeScene } from "../services/SceneService.js";
import { AssetService, serializeAsset, type AssetType } from "../services/AssetService.js";
import { toolRegistry } from "../tools/index.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";

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

const RegenerateSchema = z.object({ type: z.enum(["video", "voice", "image"]).default("video") }).strict();

/**
 * Regenerates one scene's media directly (spec #16 "regenerate scene",
 * #33 API). Runs the same underlying tool logic as generate_video /
 * generate_voice / generate_image so caching/versioning behave identically
 * whether triggered from chat or from a UI button.
 */
scenesRouter.post("/:sceneId/regenerate", async (req, res) => {
  try {
    const { id: projectId, sceneId } = req.params as { id: string; sceneId: string };
    const { type } = RegenerateSchema.parse(req.body ?? {});
    const scene = await SceneService.get(projectId, sceneId);

    await SceneService.update(projectId, sceneId, { status: "REGENERATING" });

    const toolName = type === "video" ? "generate_video" : type === "voice" ? "generate_voice" : "generate_image";
    const tool = toolRegistry.get(toolName);
    const result = await tool.execute({ sceneId: scene.id, force: true }, { projectId });

    res.json({ scene: serializeScene(await SceneService.get(projectId, sceneId)), result });
  } catch (err) {
    handleError(err, res);
  }
});

/** Lists every generated version of one scene's asset of a given type (spec #28). */
scenesRouter.get("/:sceneId/versions", async (req, res) => {
  try {
    const { id: projectId, sceneId } = req.params as { id: string; sceneId: string };
    const type = (req.query.type as AssetType | undefined) ?? "VIDEO";
    await SceneService.get(projectId, sceneId); // 404s if the scene doesn't belong to this project
    const versions = await AssetService.listForScene(projectId, sceneId, type);
    res.json(versions.map(serializeAsset));
  } catch (err) {
    handleError(err, res);
  }
});

/** Switches which version of a scene's asset is active (spec #28 "Use version 2"). */
scenesRouter.post("/:sceneId/versions/:assetId/activate", async (req, res) => {
  try {
    const { id: projectId, sceneId, assetId } = req.params as { id: string; sceneId: string; assetId: string };
    const asset = await AssetService.setActiveVersion(projectId, sceneId, assetId);
    res.json({ scene: serializeScene(await SceneService.get(projectId, sceneId)), activatedAsset: serializeAsset(asset) });
  } catch (err) {
    handleError(err, res);
  }
});

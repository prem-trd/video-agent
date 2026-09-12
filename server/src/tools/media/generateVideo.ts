import { z } from "zod";
import type { Tool } from "../types.js";
import { SceneService } from "../../services/SceneService.js";
import { AssetService, computeGenerationHash, serializeAsset } from "../../services/AssetService.js";
import { ProjectService } from "../../services/ProjectService.js";
import { ProjectStorage } from "../../services/ProjectStorage.js";
import { getVideoProvider } from "../../providers/registry.js";
import { AppError } from "../../utils/errors.js";
import { sceneRefFields, requireSceneRef, SCENE_REF_ERROR } from "../sceneRef.js";

const InputSchema = z
  .object({
    ...sceneRefFields,
    prompt: z.string().optional().describe("Overrides the scene's stored videoPrompt for this generation, if provided."),
    force: z
      .boolean()
      .optional()
      .describe("Skip the generation cache and always produce a new version, even if an identical asset already exists. Use for an explicit user 'regenerate' request."),
  })
  .strict()
  .refine(requireSceneRef, SCENE_REF_ERROR);

/**
 * Generates the video clip for one scene (spec #18). Uses the configured
 * VIDEO_PROVIDER (mock by default - spec #41) behind the VideoProvider
 * interface. On success this becomes the scene's active video asset,
 * ready for merge_videos in the assembly phase. Handles queued/processing/
 * completed/failed status and marks the scene FAILED on error so the
 * agent can retry (spec #18).
 */
export const generateVideoTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_video",
  description:
    "Generate the video clip for a scene (identified by sceneId or sceneNumber) using its videoPrompt (or an override prompt) and stored duration. Uses the configured video provider - mock in local development. Sets the scene READY on success. Pass force:true to bypass the cache and always create a new version (for an explicit regenerate request).",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 120_000,
  async execute(input, ctx) {
    const scene = await SceneService.resolve(ctx.projectId, input);
    const prompt = input.prompt ?? scene.videoPrompt;
    if (!prompt) {
      throw new AppError("VALIDATION_ERROR", `Scene #${scene.sceneNumber} has no videoPrompt yet - run create_scene_plan first, or pass a prompt.`, {
        retryable: false,
      });
    }

    const project = await ProjectService.get(ctx.projectId);
    const provider = getVideoProvider();

    const generationHash = computeGenerationHash({
      type: "VIDEO",
      provider: provider.name,
      prompt,
      duration: scene.duration,
      aspectRatio: project.aspectRatio,
      resolution: project.resolution,
    });

    const cached = input.force ? null : await AssetService.findCached(ctx.projectId, scene.id, "VIDEO", generationHash);
    if (cached) {
      await SceneService.update(ctx.projectId, scene.id, { status: "READY", activeAssetId: cached.id });
      return { asset: serializeAsset(cached), cached: true };
    }

    await SceneService.update(ctx.projectId, scene.id, { status: "GENERATING" });

    const version = await AssetService.nextVersion(ctx.projectId, scene.id, "VIDEO");
    const outputPath = ProjectStorage.absolutePath(
      ctx.projectId,
      `assets/videos/scene-${String(scene.sceneNumber).padStart(2, "0")}-v${version}.mp4`
    );

    try {
      const result = await provider.generateVideo(
        { prompt, duration: scene.duration, aspectRatio: project.aspectRatio as any, resolution: project.resolution },
        outputPath
      );

      if (result.status === "failed") {
        throw new AppError("PROVIDER_ERROR", `${provider.name} reported video generation failed for scene #${scene.sceneNumber}.`, {
          retryable: true,
        });
      }

      const asset = await AssetService.record({
        projectId: ctx.projectId,
        sceneId: scene.id,
        type: "VIDEO",
        provider: result.provider,
        isMock: result.isMock,
        prompt,
        filePath: result.filePath,
        duration: result.duration,
        generationHash,
        metadata: { resolution: project.resolution, aspectRatio: project.aspectRatio },
      });

      await SceneService.update(ctx.projectId, scene.id, { status: "READY" });

      return { asset: serializeAsset(asset), cached: false };
    } catch (err) {
      await SceneService.update(ctx.projectId, scene.id, { status: "FAILED" });
      throw err;
    }
  },
};

import { z } from "zod";
import type { Tool } from "../types.js";
import { SceneService } from "../../services/SceneService.js";
import { AssetService, computeGenerationHash, serializeAsset } from "../../services/AssetService.js";
import { ProjectService } from "../../services/ProjectService.js";
import { ProjectStorage } from "../../services/ProjectStorage.js";
import { getImageProvider } from "../../providers/registry.js";
import { AppError } from "../../utils/errors.js";
import { sceneRefFields, requireSceneRef, SCENE_REF_ERROR } from "../sceneRef.js";

const InputSchema = z
  .object({
    ...sceneRefFields,
    prompt: z.string().optional().describe("Overrides the scene's stored imagePrompt for this generation, if provided."),
    force: z.boolean().optional().describe("Skip the generation cache and always create a new version, even if an identical asset already exists."),
  })
  .strict()
  .refine(requireSceneRef, SCENE_REF_ERROR);

/**
 * Generates the still image for one scene (spec #19). Uses the configured
 * IMAGE_PROVIDER (mock by default - spec #41) behind the ImageProvider
 * interface, so swapping in a real vendor later never touches this tool.
 * Caches on identical generation parameters (spec #29) and creates a new
 * asset version on every real generation (spec #28).
 */
export const generateImageTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_image",
  description:
    "Generate the still image for a scene (identified by sceneId or sceneNumber) using its imagePrompt (or an override prompt). Uses the configured image provider - mock in local development.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 60_000,
  async execute(input, ctx) {
    const scene = await SceneService.resolve(ctx.projectId, input);
    const prompt = input.prompt ?? scene.imagePrompt;
    if (!prompt) {
      throw new AppError("VALIDATION_ERROR", `Scene #${scene.sceneNumber} has no imagePrompt yet - run create_scene_plan first, or pass a prompt.`, {
        retryable: false,
      });
    }

    const project = await ProjectService.get(ctx.projectId);
    const provider = getImageProvider();

    const generationHash = computeGenerationHash({
      type: "IMAGE",
      provider: provider.name,
      prompt,
      aspectRatio: project.aspectRatio,
      resolution: project.resolution,
    });

    const cached = input.force ? null : await AssetService.findCached(ctx.projectId, scene.id, "IMAGE", generationHash);
    if (cached) {
      return { asset: serializeAsset(cached), cached: true };
    }

    await SceneService.update(ctx.projectId, scene.id, { status: "GENERATING" });

    const version = await AssetService.nextVersion(ctx.projectId, scene.id, "IMAGE");
    const outputPath = ProjectStorage.absolutePath(
      ctx.projectId,
      `assets/images/scene-${String(scene.sceneNumber).padStart(2, "0")}-v${version}.png`
    );

    try {
      const result = await provider.generateImage({ prompt, aspectRatio: project.aspectRatio as any, resolution: project.resolution }, outputPath);

      const asset = await AssetService.record({
        projectId: ctx.projectId,
        sceneId: scene.id,
        type: "IMAGE",
        provider: result.provider,
        isMock: result.isMock,
        prompt,
        filePath: result.filePath,
        generationHash,
        metadata: { resolution: project.resolution, aspectRatio: project.aspectRatio },
      });

      return { asset: serializeAsset(asset), cached: false };
    } catch (err) {
      await SceneService.update(ctx.projectId, scene.id, { status: "FAILED" });
      throw err;
    }
  },
};

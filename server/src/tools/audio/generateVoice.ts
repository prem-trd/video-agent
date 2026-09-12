import { z } from "zod";
import type { Tool } from "../types.js";
import { SceneService } from "../../services/SceneService.js";
import { AssetService, computeGenerationHash, serializeAsset } from "../../services/AssetService.js";
import { ProjectService } from "../../services/ProjectService.js";
import { ProjectStorage } from "../../services/ProjectStorage.js";
import { getTTSProvider } from "../../providers/registry.js";
import { AppError } from "../../utils/errors.js";
import { sceneRefFields } from "../sceneRef.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    ...sceneRefFields,
    text: z.string().optional().describe("Overrides the scene's narration, or is required if no scene is referenced."),
    voice: z.string().optional().describe("Voice name/id. Defaults to a standard voice."),
    speed: looseOptional(z.number().positive().max(3)).describe("Playback speed multiplier, default 1."),
    pitch: looseOptional(z.number().positive().max(3)).describe("Pitch multiplier, default 1."),
    force: z.boolean().optional().describe("Skip the generation cache and always create a new version, even if an identical asset already exists."),
  })
  .strict()
  .refine((v) => v.text || v.sceneId || v.sceneNumber !== undefined, "Provide text, or reference a scene (sceneId/sceneNumber) to narrate.");

/**
 * Generates narration audio (spec #20). Uses the configured TTS_PROVIDER
 * (mock by default - spec #41). When tied to a scene, the resulting asset
 * is scoped to that scene for assembly; standalone calls (no scene) are
 * useful for intros/outros and are stored at the project level.
 */
export const generateVoiceTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_voice",
  description:
    "Generate narration audio from text. Pass sceneId/sceneNumber to narrate that scene's stored narration (or override with text), or just text for a standalone clip (e.g. intro). Uses the configured TTS provider - mock in local development.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 60_000,
  async execute(input, ctx) {
    const scene = input.sceneId || input.sceneNumber !== undefined ? await SceneService.resolve(ctx.projectId, input) : null;
    const text = input.text ?? scene?.narration;
    if (!text) {
      throw new AppError("VALIDATION_ERROR", "No text to narrate - the referenced scene has no narration and no text override was given.", {
        retryable: false,
      });
    }

    const project = await ProjectService.get(ctx.projectId);
    const provider = getTTSProvider();
    const voice = input.voice ?? "default";

    const generationHash = computeGenerationHash({
      type: "VOICE",
      provider: provider.name,
      text,
      voice,
      speed: input.speed ?? 1,
      pitch: input.pitch ?? 1,
      language: project.language,
    });

    const cached = input.force ? null : await AssetService.findCached(ctx.projectId, scene?.id, "VOICE", generationHash);
    if (cached) {
      return { asset: serializeAsset(cached), cached: true };
    }

    const version = await AssetService.nextVersion(ctx.projectId, scene?.id, "VOICE");
    const baseName = scene ? `scene-${String(scene.sceneNumber).padStart(2, "0")}` : "standalone";
    const outputPath = ProjectStorage.absolutePath(ctx.projectId, `assets/audio/${baseName}-voice-v${version}.m4a`);

    const result = await provider.generateVoice(
      { text, language: project.language, voice, speed: input.speed, pitch: input.pitch },
      outputPath
    );

    const asset = await AssetService.record({
      projectId: ctx.projectId,
      sceneId: scene?.id,
      type: "VOICE",
      provider: result.provider,
      isMock: result.isMock,
      prompt: text,
      filePath: result.filePath,
      duration: result.durationSec,
      generationHash,
      metadata: { voice: result.voice, language: result.language, speed: input.speed ?? 1, pitch: input.pitch ?? 1 },
    });

    return { asset: serializeAsset(asset), cached: false };
  },
};

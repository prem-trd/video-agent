import { z } from "zod";
import type { Tool } from "../types.js";
import { AssetService, computeGenerationHash, serializeAsset } from "../../services/AssetService.js";
import { ProjectService } from "../../services/ProjectService.js";
import { ProjectStorage } from "../../services/ProjectStorage.js";
import { getMusicProvider } from "../../providers/registry.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    mood: z.string().optional().describe('e.g. "cheerful", "calm", "playful" - influences the generated track.'),
    prompt: z.string().optional().describe("Freeform description of the desired music."),
    durationSec: looseOptional(z.number().positive()).describe("Defaults to the project's total duration."),
  })
  .strict();

/**
 * Generates a background music bed for the project (spec #21). Uses the
 * configured MUSIC_PROVIDER (mock by default - spec #41). The track is
 * project-level (no sceneId) - FFmpegService.mixAudio handles looping it
 * under narration with volume/fade control at assembly time.
 */
export const generateMusicTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_music",
  description:
    "Generate a background music track for the whole video (mood/prompt optional, duration defaults to the project's total duration). Uses the configured music provider - mock in local development.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 60_000,
  async execute(input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const provider = getMusicProvider();
    const durationSec = input.durationSec ?? project.duration;

    const generationHash = computeGenerationHash({
      type: "MUSIC",
      provider: provider.name,
      mood: input.mood ?? "",
      prompt: input.prompt ?? "",
      durationSec,
    });

    const cached = await AssetService.findCached(ctx.projectId, undefined, "MUSIC", generationHash);
    if (cached) {
      return { asset: serializeAsset(cached), cached: true };
    }

    const version = await AssetService.nextVersion(ctx.projectId, undefined, "MUSIC");
    const outputPath = ProjectStorage.absolutePath(ctx.projectId, `assets/music/track-v${version}.m4a`);

    const result = await provider.generateMusic({ mood: input.mood, prompt: input.prompt, durationSec }, outputPath);

    const asset = await AssetService.record({
      projectId: ctx.projectId,
      type: "MUSIC",
      provider: result.provider,
      isMock: result.isMock,
      prompt: input.prompt ?? input.mood ?? "",
      filePath: result.filePath,
      duration: result.durationSec,
      generationHash,
      metadata: { mood: input.mood ?? "" },
    });

    return { asset: serializeAsset(asset), cached: false };
  },
};

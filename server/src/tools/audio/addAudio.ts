import { z } from "zod";
import fs from "node:fs/promises";
import type { Tool } from "../types.js";
import { SceneService } from "../../services/SceneService.js";
import { AssetService } from "../../services/AssetService.js";
import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { AppError } from "../../utils/errors.js";

const InputSchema = z.object({}).strict();

/**
 * Concatenates every scene's narration clip, in order, into one track and
 * muxes it onto the merged silent video (spec #23 assembly pipeline, step
 * 2). Requires merge_videos and generate_voice (for every scene) to have
 * run first.
 */
export const addAudioTool: Tool<z.infer<typeof InputSchema>> = {
  name: "add_audio",
  description:
    "Add narration audio to the merged video: concatenates every scene's voice clip in order and muxes it onto the silent video from merge_videos. Requires merge_videos and generate_voice (for every scene) to have run first.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 120_000,
  async execute(_input, ctx) {
    const silentVideoPath = RenderPaths.silentVideo(ctx.projectId);
    try {
      await fs.access(silentVideoPath);
    } catch {
      throw new AppError("VALIDATION_ERROR", "No merged video found - call merge_videos first.", { retryable: false });
    }

    const scenes = await SceneService.list(ctx.projectId);
    const voicePaths: string[] = [];
    const missing: number[] = [];
    for (const scene of scenes) {
      const asset = await AssetService.getLatest(ctx.projectId, scene.id, "VOICE");
      if (!asset) {
        missing.push(scene.sceneNumber);
        continue;
      }
      voicePaths.push(asset.filePath);
    }
    if (missing.length > 0) {
      throw new AppError("VALIDATION_ERROR", `Scenes missing narration: ${missing.map((n) => `#${n}`).join(", ")}. Call generate_voice for each first.`, {
        retryable: false,
      });
    }

    const narrationPath = RenderPaths.narrationTrack(ctx.projectId);
    await ffmpegService.concatenateAudios(voicePaths, narrationPath);

    const outputPath = RenderPaths.withNarration(ctx.projectId);
    await ffmpegService.addAudio(silentVideoPath, narrationPath, outputPath);

    const probe = await ffmpegService.probe(outputPath);
    return { filePath: outputPath, durationSec: probe.durationSec, hasAudio: probe.hasAudio };
  },
};

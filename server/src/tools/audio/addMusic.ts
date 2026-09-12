import { z } from "zod";
import fs from "node:fs/promises";
import type { Tool } from "../types.js";
import { AssetService } from "../../services/AssetService.js";
import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { AppError } from "../../utils/errors.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    musicVolume: looseOptional(z.number().min(0).max(1)).describe("Relative volume of the music under the narration, default 0.25."),
  })
  .strict();

/**
 * Mixes the project's background music (generate_music) under the
 * narration track and re-muxes onto the silent video (spec #23 assembly
 * pipeline, step 3; spec #21 volume/loop/fade support lives in
 * FFmpegService.mixAudio). Requires merge_videos and add_audio to have run
 * first, and a music asset to already exist.
 */
export const addMusicTool: Tool<z.infer<typeof InputSchema>> = {
  name: "add_music",
  description:
    "Mix the generated background music under the narration and add it to the video. Requires merge_videos, add_audio, and generate_music to have run first.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 120_000,
  async execute(input, ctx) {
    const silentVideoPath = RenderPaths.silentVideo(ctx.projectId);
    const narrationPath = RenderPaths.narrationTrack(ctx.projectId);

    for (const [label, p] of [
      ["merged video (call merge_videos)", silentVideoPath],
      ["narration track (call add_audio)", narrationPath],
    ] as const) {
      try {
        await fs.access(p);
      } catch {
        throw new AppError("VALIDATION_ERROR", `Missing ${label} first.`, { retryable: false });
      }
    }

    const musicAsset = await AssetService.getLatest(ctx.projectId, undefined, "MUSIC");
    if (!musicAsset) {
      throw new AppError("VALIDATION_ERROR", "No music asset found - call generate_music first.", { retryable: false });
    }

    const narrationProbe = await ffmpegService.probe(narrationPath);

    const mixedPath = RenderPaths.mixedAudioTrack(ctx.projectId);
    await ffmpegService.mixAudio(narrationPath, musicAsset.filePath, mixedPath, {
      durationSec: narrationProbe.durationSec,
      musicVolume: input.musicVolume ?? 0.25,
    });

    const outputPath = RenderPaths.withMusic(ctx.projectId);
    await ffmpegService.addAudio(silentVideoPath, mixedPath, outputPath);

    const probe = await ffmpegService.probe(outputPath);
    return { filePath: outputPath, durationSec: probe.durationSec, hasAudio: probe.hasAudio };
  },
};

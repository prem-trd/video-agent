import { z } from "zod";
import fs from "node:fs/promises";
import type { Tool } from "../types.js";
import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { AppError } from "../../utils/errors.js";

const InputSchema = z
  .object({
    burnIn: z.boolean().optional().describe("If true, permanently burns subtitles into the video. Defaults to false (soft/toggleable subtitles)."),
  })
  .strict();

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Adds subtitles to the most complete render available and writes the
 * final video (spec #23 assembly pipeline, last step before validation).
 * Requires generate_subtitles to have run first.
 */
export const addSubtitlesTool: Tool<z.infer<typeof InputSchema>> = {
  name: "add_subtitles",
  description:
    "Add subtitles to the assembled video, producing the final render. Requires generate_subtitles to have run first, and picks up whichever of add_music/add_audio/merge_videos has already run. Set burnIn:true to permanently bake in the subtitles, otherwise they're soft (toggleable) subtitles.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 120_000,
  async execute(input, ctx) {
    const srtPath = RenderPaths.subtitlesSrt(ctx.projectId);
    try {
      await fs.access(srtPath);
    } catch {
      throw new AppError("VALIDATION_ERROR", "No subtitles found - call generate_subtitles first.", { retryable: false });
    }

    const sourceVideo = await firstExisting([
      RenderPaths.withMusic(ctx.projectId),
      RenderPaths.withNarration(ctx.projectId),
      RenderPaths.silentVideo(ctx.projectId),
    ]);
    if (!sourceVideo) {
      throw new AppError("VALIDATION_ERROR", "No assembled video found - call merge_videos (and ideally add_audio/add_music) first.", {
        retryable: false,
      });
    }

    const outputPath = RenderPaths.final(ctx.projectId);
    await ffmpegService.addSubtitles(sourceVideo, srtPath, outputPath, { burnIn: input.burnIn ?? false });

    const probe = await ffmpegService.probe(outputPath);
    return { filePath: outputPath, durationSec: probe.durationSec, hasAudio: probe.hasAudio, hasVideo: probe.hasVideo, burnedIn: input.burnIn ?? false };
  },
};

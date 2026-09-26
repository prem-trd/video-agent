import { z } from "zod";
import fs from "node:fs/promises";
import type { Tool } from "../types.js";
import { prisma } from "../../database/prisma.js";
import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { AppError } from "../../utils/errors.js";
import { BrandingService } from "../../services/BrandingService.js";

const InputSchema = z.object({}).strict();

/**
 * Mixes the uploaded narration track over the rendered video's own audio
 * (the uploaded clips' sound is kept, not replaced), starting after the
 * opening screen if the render has one.
 * Optional - if the user hasn't uploaded narration, skip straight to
 * add_music or add_subtitles. No TTS is generated here.
 */
export const addNarrationTool: Tool<z.infer<typeof InputSchema>> = {
  name: "add_narration",
  description: "Add the uploaded narration audio track to the rendered video (from render_timeline). Optional - only call this if the user has uploaded a narration file; otherwise skip to add_music or add_subtitles.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 120_000,
  async execute(_input, ctx) {
    const silentVideoPath = RenderPaths.silentVideo(ctx.projectId);
    try {
      await fs.access(silentVideoPath);
    } catch {
      throw new AppError("VALIDATION_ERROR", "No rendered video found - call render_timeline first.", { retryable: false });
    }

    const track = await prisma.audioTrack.findFirst({ where: { projectId: ctx.projectId, kind: "NARRATION", active: true }, orderBy: { createdAt: "desc" } });
    if (!track) {
      throw new AppError("VALIDATION_ERROR", "No narration track has been uploaded - upload one, or skip this step.", { retryable: false });
    }

    const outputPath = RenderPaths.withNarration(ctx.projectId);
    const { introSec } = await BrandingService.readManifest(ctx.projectId);
    await ffmpegService.mixAudioIntoVideo(silentVideoPath, track.filePath, outputPath, { delaySec: introSec });

    const probe = await ffmpegService.probe(outputPath);
    return { filePath: outputPath, durationSec: probe.durationSec, hasAudio: probe.hasAudio };
  },
};

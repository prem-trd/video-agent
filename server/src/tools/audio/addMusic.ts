import { z } from "zod";
import fs from "node:fs/promises";
import type { Tool } from "../types.js";
import { prisma } from "../../database/prisma.js";
import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { AppError } from "../../utils/errors.js";

const InputSchema = z.object({}).strict();

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
 * Mixes the uploaded background music track into the video (under the
 * narration if one was added, otherwise directly). Optional - only
 * relevant if the user uploaded music. No music is generated here.
 */
export const addMusicTool: Tool<z.infer<typeof InputSchema>> = {
  name: "add_music",
  description: "Mix the uploaded background music track into the video, under narration if add_narration already ran. Optional - only call this if the user has uploaded a music file.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 120_000,
  async execute(_input, ctx) {
    const sourceVideo = await firstExisting([RenderPaths.withNarration(ctx.projectId), RenderPaths.silentVideo(ctx.projectId)]);
    if (!sourceVideo) {
      throw new AppError("VALIDATION_ERROR", "No rendered video found - call render_timeline (and optionally add_narration) first.", { retryable: false });
    }

    const musicTrack = await prisma.audioTrack.findFirst({ where: { projectId: ctx.projectId, kind: "MUSIC", active: true }, orderBy: { createdAt: "desc" } });
    if (!musicTrack) {
      throw new AppError("VALIDATION_ERROR", "No music track has been uploaded - upload one, or skip this step.", { retryable: false });
    }

    const narrationTrack = await prisma.audioTrack.findFirst({ where: { projectId: ctx.projectId, kind: "NARRATION", active: true }, orderBy: { createdAt: "desc" } });
    const videoProbe = await ffmpegService.probe(sourceVideo);
    const outputPath = RenderPaths.withMusic(ctx.projectId);

    if (narrationTrack && videoProbe.hasAudio) {
      const mixedPath = RenderPaths.mixedAudioTrack(ctx.projectId);
      await ffmpegService.mixAudio(narrationTrack.filePath, musicTrack.filePath, mixedPath, {
        durationSec: videoProbe.durationSec,
        musicVolume: musicTrack.volume,
        fadeInSec: musicTrack.fadeInSec,
        fadeOutSec: musicTrack.fadeOutSec,
      });
      await ffmpegService.addAudio(RenderPaths.silentVideo(ctx.projectId), mixedPath, outputPath);
    } else {
      const preparedMusicPath = RenderPaths.mixedAudioTrack(ctx.projectId);
      await ffmpegService.prepareMusicTrack(musicTrack.filePath, preparedMusicPath, {
        durationSec: videoProbe.durationSec,
        volume: musicTrack.volume,
        fadeInSec: musicTrack.fadeInSec,
        fadeOutSec: musicTrack.fadeOutSec,
      });
      await ffmpegService.addAudio(sourceVideo, preparedMusicPath, outputPath);
    }

    const probe = await ffmpegService.probe(outputPath);
    return { filePath: outputPath, durationSec: probe.durationSec, hasAudio: probe.hasAudio };
  },
};

import { z } from "zod";
import fs from "node:fs/promises";
import type { Tool } from "../types.js";
import { SceneService } from "../../services/SceneService.js";
import { ProjectService } from "../../services/ProjectService.js";
import { prisma } from "../../database/prisma.js";
import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import { parseResolution } from "../../utils/resolution.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { AppError } from "../../utils/errors.js";

const InputSchema = z.object({}).strict();

/**
 * Concatenates every scene's active video asset, in scene order, into one
 * silent full-length video (spec #23 assembly pipeline, step 1). Requires
 * every scene to already have a generated video (generate_video).
 */
export const mergeVideosTool: Tool<z.infer<typeof InputSchema>> = {
  name: "merge_videos",
  description:
    "Concatenate every scene's video clip, in order, into one silent full-length video. Requires generate_video to have run for every scene first. This is the first assembly step - add_audio comes next.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 120_000,
  async execute(_input, ctx) {
    const scenes = await SceneService.list(ctx.projectId);
    if (scenes.length === 0) {
      throw new AppError("VALIDATION_ERROR", "No scenes exist yet.", { retryable: false });
    }

    const missing = scenes.filter((s) => !s.activeAssetId);
    if (missing.length > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Scenes missing a generated video: ${missing.map((s) => `#${s.sceneNumber}`).join(", ")}. Call generate_video for each first.`,
        { retryable: false }
      );
    }

    const videoPaths: string[] = [];
    for (const scene of scenes) {
      const asset = await prisma.asset.findUnique({ where: { id: scene.activeAssetId! } });
      if (!asset) {
        throw new AppError("VALIDATION_ERROR", `Scene #${scene.sceneNumber}'s active video asset is missing from the database.`, {
          retryable: false,
        });
      }
      try {
        await fs.access(asset.filePath);
      } catch {
        throw new AppError("FILE_ERROR", `Scene #${scene.sceneNumber}'s video file is missing on disk: ${asset.filePath}`, {
          retryable: true,
        });
      }
      videoPaths.push(asset.filePath);
    }

    const project = await ProjectService.get(ctx.projectId);
    const { width, height } = parseResolution(project.resolution);
    const outputPath = RenderPaths.silentVideo(ctx.projectId);

    await ffmpegService.concatenateVideos(videoPaths, outputPath, { width, height, fps: project.fps });
    const probe = await ffmpegService.probe(outputPath);

    return { filePath: outputPath, sceneCount: scenes.length, durationSec: probe.durationSec };
  },
};

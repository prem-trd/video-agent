import { z } from "zod";
import fs from "node:fs/promises";
import type { Tool } from "../types.js";
import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { ProjectStorage } from "../../services/ProjectStorage.js";
import { ProjectService } from "../../services/ProjectService.js";
import { AssetService, computeGenerationHash } from "../../services/AssetService.js";
import { parseResolution } from "../../utils/resolution.js";
import { AppError } from "../../utils/errors.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    timestampSec: looseOptional(z.number().min(0)).describe("Where in the final video to grab the frame from. Defaults to 1 second in."),
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

/** Extracts a frame from the most complete render available as the project thumbnail (spec #36). */
export const createThumbnailTool: Tool<z.infer<typeof InputSchema>> = {
  name: "create_thumbnail",
  description:
    "Extract a frame from the assembled video as the project's thumbnail image. Picks up whichever render stage has completed (final, with music, with narration, or the silent merge).",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const sourceVideo = await firstExisting([
      RenderPaths.final(ctx.projectId),
      RenderPaths.withMusic(ctx.projectId),
      RenderPaths.withNarration(ctx.projectId),
      RenderPaths.silentVideo(ctx.projectId),
    ]);
    if (!sourceVideo) {
      throw new AppError("VALIDATION_ERROR", "No assembled video found yet - call merge_videos first.", { retryable: false });
    }

    const project = await ProjectService.get(ctx.projectId);
    const { width, height } = parseResolution(project.resolution);
    const timestampSec = input.timestampSec ?? 1;

    // Each generation gets its own file (thumbnail-v1.png, -v2.png, ...) -
    // matching how every other asset type versions (spec #28). Writing to
    // a single fixed path here would silently corrupt older "versions":
    // the DB would still show v1/v2 as distinct rows, but both would point
    // at whatever the file was last overwritten with.
    const version = await AssetService.nextVersion(ctx.projectId, undefined, "THUMBNAIL");
    const outputPath = ProjectStorage.absolutePath(ctx.projectId, `thumbnails/thumbnail-v${version}.png`);

    await ffmpegService.createThumbnail(sourceVideo, outputPath, { timestampSec, width, height });

    const generationHash = computeGenerationHash({ type: "THUMBNAIL", sourceVideo, timestampSec });
    const asset = await AssetService.record({
      projectId: ctx.projectId,
      type: "THUMBNAIL",
      provider: "internal",
      isMock: false,
      filePath: outputPath,
      generationHash,
      metadata: { timestampSec, sourceVideo },
    });

    return { filePath: outputPath, assetId: asset.id, version: asset.version };
  },
};

import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import type { Tool } from "../types.js";
import { TimelineService } from "../../services/TimelineService.js";
import { ProjectService } from "../../services/ProjectService.js";
import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { parseResolution } from "../../utils/resolution.js";
import { AppError } from "../../utils/errors.js";

const InputSchema = z.object({}).strict();

/**
 * Converts every active timeline item into a uniform video segment (images
 * become fixed-duration clips, videos are normalized/trimmed - never
 * stretched, per each item's fitMode) and concatenates them in order into
 * one silent full-length video. This is the "convert images to video,
 * apply aspect-ratio handling, concatenate" stage of the assembly
 * pipeline. Requires every scene (if any exist) to have matched media on
 * the timeline, or at least one unmatched item for a pure slideshow.
 */
export const renderTimelineTool: Tool<z.infer<typeof InputSchema>> = {
  name: "render_timeline",
  description:
    "Build the timeline, normalize every item (image-to-video conversion, aspect-ratio fit/crop/blur, trimming), and concatenate them in order into one silent full-length video. Call this after uploads are matched to scenes (or otherwise placed on the timeline). add_narration/add_music come next.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 300_000,
  async execute(_input, ctx) {
    const items = await TimelineService.rebuild(ctx.projectId);
    if (items.length === 0) {
      throw new AppError("VALIDATION_ERROR", "The timeline is empty - upload media and match/assign it to scenes first.", { retryable: false });
    }

    const project = await ProjectService.get(ctx.projectId);
    const { width, height } = parseResolution(project.resolution);
    const tempDir = await ffmpegService.tempDir("render-timeline-");

    try {
      const segmentPaths: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i] as any;
        const mediaAsset = item.mediaAsset;
        try {
          await fs.access(mediaAsset.filePath);
        } catch {
          throw new AppError("FILE_ERROR", `Uploaded file for timeline item #${i + 1} is missing on disk: ${mediaAsset.filePath}`, { retryable: false });
        }

        const segmentPath = path.join(tempDir, `segment-${String(i + 1).padStart(3, "0")}.mp4`);
        if (item.kind === "IMAGE") {
          const durationSec = item.displayDurationSec ?? project.imageDurationSec;
          await ffmpegService.imageToVideo(mediaAsset.filePath, segmentPath, { width, height, fps: project.fps, durationSec, fitMode: item.fitMode });
        } else {
          await ffmpegService.normalizeVideoClip(mediaAsset.filePath, segmentPath, {
            width,
            height,
            fps: project.fps,
            fitMode: item.fitMode,
            trimStartSec: item.trimStartSec ?? undefined,
            trimEndSec: item.trimEndSec ?? undefined,
          });
        }
        segmentPaths.push(segmentPath);
      }

      const outputPath = RenderPaths.silentVideo(ctx.projectId);
      await ffmpegService.concatenateVideos(segmentPaths, outputPath, { width, height, fps: project.fps });
      const probe = await ffmpegService.probe(outputPath);

      return { filePath: outputPath, itemCount: items.length, durationSec: probe.durationSec };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  },
};

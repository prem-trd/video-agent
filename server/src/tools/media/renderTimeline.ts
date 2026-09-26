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
import { BrandingService, OPENING_TRANSITION_SEC } from "../../services/BrandingService.js";

const InputSchema = z.object({}).strict();

/**
 * Converts every active timeline item into a uniform video segment (images
 * become fixed-duration clips, videos are normalized/trimmed - never
 * stretched, per each item's fitMode) and concatenates them in order into
 * one full-length video (keeping each clip's own audio), wrapped in the
 * channel's opening/end screens when enabled (circle transition out of the
 * opening, logo watermark over the clips). This is the "convert images to video,
 * apply aspect-ratio handling, concatenate" stage of the assembly
 * pipeline. Requires every scene (if any exist) to have matched media on
 * the timeline, or at least one unmatched item for a pure slideshow.
 */
export const renderTimelineTool: Tool<z.infer<typeof InputSchema>> = {
  name: "render_timeline",
  description:
    "Build the timeline, normalize every item (image-to-video conversion, aspect-ratio fit/crop/blur, trimming), and concatenate them in order into one full-length video (clips keep their own audio), adding the channel's opening and end screens when enabled. Call this after uploads are matched to scenes (or otherwise placed on the timeline). add_narration/add_music come next.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 300_000,
  async execute(_input, ctx) {
    const items = await TimelineService.rebuild(ctx.projectId);
    if (items.length === 0) {
      throw new AppError("VALIDATION_ERROR", "The timeline is empty - upload media and match/assign it to scenes first.", { retryable: false });
    }

    // A new timeline render invalidates every later stage from the previous
    // run - otherwise a stale with_music/final file (preferred as "most
    // complete") would shadow this render in playback and validation.
    await Promise.all(
      [RenderPaths.withNarration, RenderPaths.withMusic, RenderPaths.final].map((stage) => fs.rm(stage(ctx.projectId), { force: true }))
    );

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

      const brand = await BrandingService.plan(project);
      const introPath = brand.intro ? path.join(tempDir, "card-intro.mp4") : undefined;
      const outroPath = brand.outro ? path.join(tempDir, "card-outro.mp4") : undefined;
      if (introPath) await BrandingService.renderCard(project, brand.channel, "INTRO", introPath, { width, height, fallbackVideo: segmentPaths[0] });
      if (outroPath) await BrandingService.renderCard(project, brand.channel, "OUTRO", outroPath, { width, height, fallbackVideo: segmentPaths[segmentPaths.length - 1] });

      const outputPath = RenderPaths.silentVideo(ctx.projectId);
      const { contentStartSec } = await ffmpegService.joinWithBranding(segmentPaths, outputPath, {
        width,
        height,
        fps: project.fps,
        introPath,
        outroPath,
        transitionSec: OPENING_TRANSITION_SEC,
        watermark: await BrandingService.watermark(brand.channel),
      });
      await BrandingService.writeManifest(ctx.projectId, { introSec: contentStartSec, outroSec: brand.outroSec });
      const probe = await ffmpegService.probe(outputPath);

      return {
        filePath: outputPath,
        itemCount: items.length,
        durationSec: probe.durationSec,
        openingScreenSec: brand.introSec,
        clipsStartAtSec: contentStartSec,
        endScreenSec: brand.outroSec,
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  },
};

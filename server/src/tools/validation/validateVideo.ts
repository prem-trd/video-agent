import { z } from "zod";
import { prisma } from "../../database/prisma.js";
import type { Tool } from "../types.js";
import { ffmpegService, type MediaProbeResult } from "../../media/ffmpeg/FFmpegService.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { ProjectService } from "../../services/ProjectService.js";
import { TimelineService } from "../../services/TimelineService.js";
import { parseResolution } from "../../utils/resolution.js";
import { BrandingService } from "../../services/BrandingService.js";

const InputSchema = z.object({}).strict();

const DURATION_TOLERANCE_RATIO = 0.1; // normalizing clips to the project fps (and frame-rounding at each cut) drifts a little from the timeline's own math

/**
 * The render is checked against what the TIMELINE says it should be (sum of
 * its items' effective durations), not the project's target duration - a
 * partial assembly (e.g. 4 of 30 scenes uploaded so far) is a valid render
 * of that timeline, just a short one. Returns an issue string, or null.
 */
export function durationIssue(actualSec: number, expectedSec: number): string | null {
  if (expectedSec <= 0) return null;
  const tolerance = Math.max(1.5, expectedSec * DURATION_TOLERANCE_RATIO);
  if (Math.abs(actualSec - expectedSec) <= tolerance) return null;
  return `Duration is ${actualSec.toFixed(1)}s, but the timeline adds up to ${expectedSec.toFixed(1)}s (+/- ${tolerance.toFixed(1)}s).`;
}

async function firstExisting(paths: string[]): Promise<string | null> {
  const fs = await import("node:fs/promises");
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
 * Validates the final rendered video: exists, has a video stream, and
 * resolution/fps match the project's spec and its duration matches the
 * timeline it was rendered from. Rendering fewer scenes than planned is
 * reported as `coverage` (informational), never as a failure. An audio
 * stream is only REQUIRED if the project actually has narration/music
 * uploaded (spec: "if no audio exists, the video should still assemble
 * successfully"). Persists a Render row either way, and sets the project
 * into FIXING (invalid) or READY (valid).
 */
export const validateVideoTool: Tool<z.infer<typeof InputSchema>> = {
  name: "validate_video",
  description: "Validate the final (or best-available) rendered video and record it as a Render. Call this as the last step after add_subtitles (or render_timeline/add_narration/add_music if subtitles were skipped).",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const finalPath = await firstExisting([
      RenderPaths.final(ctx.projectId),
      RenderPaths.withMusic(ctx.projectId),
      RenderPaths.withNarration(ctx.projectId),
      RenderPaths.silentVideo(ctx.projectId),
    ]);
    const probe: MediaProbeResult = finalPath
      ? await ffmpegService.probe(finalPath)
      : { exists: false, durationSec: 0, hasVideo: false, hasAudio: false };

    const activeAudioTracks = await prisma.audioTrack.count({ where: { projectId: ctx.projectId, active: true } });
    const audioExpected = activeAudioTracks > 0;

    const timeline = await TimelineService.list(ctx.projectId);
    const hasSubtitles = finalPath === RenderPaths.final(ctx.projectId);

    const issues: string[] = [];
    if (!finalPath || !probe.exists) {
      issues.push("No rendered video found - run render_timeline (then optionally add_narration/add_music/add_subtitles) first.");
    } else {
      if (!probe.hasVideo) issues.push("No video stream found.");
      if (audioExpected && !probe.hasAudio) issues.push("Narration/music was uploaded but the final render has no audio stream.");

      const { width, height } = parseResolution(project.resolution);
      if (probe.width && probe.height && (probe.width !== width || probe.height !== height)) {
        issues.push(`Resolution mismatch: expected ${width}x${height}, got ${probe.width}x${probe.height}.`);
      }
      if (!probe.fps || probe.fps <= 0) {
        issues.push("No valid fps detected.");
      }

      const timelineDuration = timeline.reduce((max, item) => Math.max(max, item.endTime), 0);
      const { introSec, outroSec } = await BrandingService.readManifest(ctx.projectId);
      const issue = durationIssue(probe.durationSec, timelineDuration > 0 ? timelineDuration + introSec + outroSec : 0);
      if (issue) issues.push(issue);
    }

    const sceneCount = await prisma.scene.count({ where: { projectId: ctx.projectId } });
    const scenesWithMedia = new Set(timeline.map((t) => t.sceneId).filter(Boolean)).size;
    const coverage = {
      scenesWithMedia,
      sceneCount,
      renderedDurationSec: probe.durationSec,
      targetDurationSec: project.duration,
      partial: sceneCount > 0 && scenesWithMedia < sceneCount,
    };

    const valid = issues.length === 0;
    await ProjectService.update(ctx.projectId, {
      status: valid ? "READY" : "FAILED",
      agentState: valid ? "COMPLETED" : "FIXING",
    } as any);

    await prisma.render.create({
      data: {
        projectId: ctx.projectId,
        filePath: finalPath ?? "",
        status: valid ? "SUCCEEDED" : "FAILED",
        durationSec: probe.durationSec,
        resolution: probe.width && probe.height ? `${probe.width}x${probe.height}` : "",
        aspectRatio: project.aspectRatio,
        fps: probe.fps ?? 0,
        mediaItemCount: timeline.length,
        sizeBytes: probe.sizeBytes ?? 0,
        hasAudio: Boolean(probe.hasAudio),
        hasSubtitles,
        validationIssues: JSON.stringify(issues),
      },
    });

    return {
      valid,
      issues,
      filePath: finalPath,
      duration: probe.durationSec,
      resolution: probe.width && probe.height ? `${probe.width}x${probe.height}` : undefined,
      fps: probe.fps,
      hasAudio: probe.hasAudio,
      hasVideo: probe.hasVideo,
      mediaItemCount: timeline.length,
      sizeBytes: probe.sizeBytes,
      coverage,
    };
  },
};

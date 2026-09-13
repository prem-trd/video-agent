import { z } from "zod";
import { prisma } from "../../database/prisma.js";
import type { Tool } from "../types.js";
import { ffmpegService, type MediaProbeResult } from "../../media/ffmpeg/FFmpegService.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { ProjectService } from "../../services/ProjectService.js";
import { TimelineService } from "../../services/TimelineService.js";
import { parseResolution } from "../../utils/resolution.js";

const InputSchema = z.object({}).strict();

const DURATION_TOLERANCE_RATIO = 0.3; // per-item durations (esp. trimmed/uploaded clips) can drift a bit from the planned target

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
 * resolution/duration/fps roughly match the project's spec. An audio
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

      const expectedDuration = project.duration;
      const tolerance = Math.max(2, expectedDuration * DURATION_TOLERANCE_RATIO);
      if (Math.abs(probe.durationSec - expectedDuration) > tolerance) {
        issues.push(`Duration is ${probe.durationSec.toFixed(1)}s, expected roughly ${expectedDuration}s (+/- ${tolerance.toFixed(1)}s).`);
      }
    }

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
    };
  },
};

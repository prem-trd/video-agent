import { z } from "zod";
import type { Tool } from "../types.js";
import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { ProjectService } from "../../services/ProjectService.js";
import { parseResolution } from "../../utils/resolution.js";

const InputSchema = z.object({}).strict();

const DURATION_TOLERANCE_RATIO = 0.3; // mock/estimated audio durations can drift a fair bit from the planned scene durations

/**
 * Validates the final rendered video against the project's spec (spec
 * #24): file exists, has both video and audio streams, resolution and fps
 * are sane, duration is in the right ballpark, codecs are present. Sets
 * the project into FIXING (invalid) or READY (valid) accordingly so the
 * agent knows whether to patch something up or declare the job done.
 */
export const validateVideoTool: Tool<z.infer<typeof InputSchema>> = {
  name: "validate_video",
  description:
    "Validate the final rendered video: confirms it exists, has video and audio streams, and that resolution/duration/fps roughly match the project's spec. Call this as the last step after add_subtitles.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const finalPath = RenderPaths.final(ctx.projectId);
    const probe = await ffmpegService.probe(finalPath);

    const issues: string[] = [];
    if (!probe.exists) {
      issues.push("Final video file does not exist - run the full assembly pipeline (merge_videos -> add_audio -> add_music -> generate_subtitles -> add_subtitles) first.");
    } else {
      if (!probe.hasVideo) issues.push("No video stream found.");
      if (!probe.hasAudio) issues.push("No audio stream found.");
      if (!probe.videoCodec) issues.push("No video codec detected.");
      if (probe.hasAudio && !probe.audioCodec) issues.push("No audio codec detected despite an audio stream existing.");

      const { width, height } = parseResolution(project.resolution);
      if (probe.width && probe.height && (probe.width !== width || probe.height !== height)) {
        issues.push(`Resolution mismatch: expected ${width}x${height}, got ${probe.width}x${probe.height}.`);
      }
      if (!probe.fps || probe.fps <= 0) {
        issues.push("No valid fps detected.");
      }

      const expectedDuration = project.duration;
      const tolerance = expectedDuration * DURATION_TOLERANCE_RATIO;
      if (Math.abs(probe.durationSec - expectedDuration) > tolerance) {
        issues.push(
          `Duration is ${probe.durationSec.toFixed(1)}s, expected roughly ${expectedDuration}s (+/- ${tolerance.toFixed(1)}s).`
        );
      }
    }

    const valid = issues.length === 0;
    await ProjectService.update(ctx.projectId, {
      status: valid ? "READY" : "FAILED",
      agentState: valid ? "COMPLETED" : "FIXING",
    } as any);

    return {
      valid,
      issues,
      filePath: finalPath,
      duration: probe.durationSec,
      resolution: probe.width && probe.height ? `${probe.width}x${probe.height}` : undefined,
      fps: probe.fps,
      hasAudio: probe.hasAudio,
      hasVideo: probe.hasVideo,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
    };
  },
};

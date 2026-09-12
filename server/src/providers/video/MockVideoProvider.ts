import { nanoid } from "nanoid";
import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import { parseResolution } from "../../utils/resolution.js";
import type { VideoGenerationInput, VideoGenerationResult, VideoProvider } from "../types.js";

const PALETTE = ["0x2C3E50", "0xC0392B", "0x2980B9", "0x8E44AD", "0x16A085", "0xD35400"];

function pickColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/**
 * Development video provider (spec #17, #41): renders a real short MP4 via
 * FFmpeg (solid color + prompt text, watermarked "MOCK ASSET") instead of
 * calling a paid external video-generation API. Fully exercises the same
 * downstream pipeline (ffprobe validation, concatenation, assembly) a real
 * provider's output would go through.
 */
export class MockVideoProvider implements VideoProvider {
  readonly name = "mock";
  readonly isMock = true;
  private readonly fps = 24;

  async generateVideo(input: VideoGenerationInput, outputPath: string): Promise<VideoGenerationResult> {
    const { width, height } = parseResolution(input.resolution);

    await ffmpegService.generateTestVideo(outputPath, {
      width,
      height,
      durationSec: input.duration,
      fps: this.fps,
      color: pickColor(input.prompt),
      title: "MOCK VIDEO",
      subtitle: truncate(input.prompt, 60),
    });

    return {
      status: "completed",
      filePath: outputPath,
      duration: input.duration,
      provider: this.name,
      isMock: true,
      jobId: nanoid(),
    };
  }

  async getStatus(): Promise<"completed"> {
    return "completed";
  }

  async cancel(): Promise<void> {
    // nothing to cancel - synchronous mock generation already finished by the time this could be called
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export const mockVideoProvider = new MockVideoProvider();

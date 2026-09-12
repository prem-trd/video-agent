import { nanoid } from "nanoid";
import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import { parseResolution } from "../../utils/resolution.js";
import type { ImageGenerationInput, ImageGenerationResult, ImageProvider } from "../types.js";

// Rotates through a few pleasant flat colors so a scene's placeholder image
// isn't just a single dull tone - purely cosmetic, purely for local dev.
const PALETTE = ["0x4A90D9", "0xE67E22", "0x27AE60", "0x8E44AD", "0xE74C3C", "0x16A085", "0xF39C12"];

function pickColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/**
 * Development image provider (spec #17, #41): renders a real PNG via
 * FFmpeg (solid color + the prompt as text) instead of calling a paid
 * external API. Clearly watermarked as a mock asset so it's never
 * mistaken for real AI-generated art.
 */
export class MockImageProvider implements ImageProvider {
  readonly name = "mock";
  readonly isMock = true;

  async generateImage(input: ImageGenerationInput, outputPath: string): Promise<ImageGenerationResult> {
    const { width, height } = parseResolution(input.resolution);
    const color = pickColor(input.prompt);

    await ffmpegService.generateColorImage(outputPath, {
      width,
      height,
      color,
      title: "MOCK IMAGE",
      subtitle: truncate(input.prompt, 60),
    });

    return { status: "completed", filePath: outputPath, provider: this.name, isMock: true, jobId: nanoid() };
  }

  async getStatus(): Promise<"completed"> {
    return "completed"; // mock generation is synchronous - nothing to poll
  }

  async cancel(): Promise<void> {
    // nothing to cancel - synchronous mock generation already finished by the time this could be called
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export const mockImageProvider = new MockImageProvider();

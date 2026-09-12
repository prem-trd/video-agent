import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import type { MusicGenerationInput, MusicGenerationResult, MusicProvider } from "../types.js";

const MOOD_FREQUENCIES: Record<string, number> = {
  cheerful: 440,
  calm: 220,
  playful: 523,
  gentle: 261,
  upbeat: 392,
  default: 330,
};

/**
 * Development music provider (spec #21, #41): renders a real placeholder
 * audio bed (a soft sustained tone at the target duration) instead of
 * calling a paid music-generation API. FFmpegService.mixAudio already
 * handles looping/volume/fade-in/fade-out at assembly time regardless of
 * which provider produced the underlying track.
 */
export class MockMusicProvider implements MusicProvider {
  readonly name = "mock";
  readonly isMock = true;

  async generateMusic(input: MusicGenerationInput, outputPath: string): Promise<MusicGenerationResult> {
    const frequency = MOOD_FREQUENCIES[input.mood?.toLowerCase() ?? "default"] ?? MOOD_FREQUENCIES.default;

    await ffmpegService.generateToneAudio(outputPath, {
      durationSec: input.durationSec,
      frequency,
      volume: 0.12,
    });

    return { status: "completed", filePath: outputPath, durationSec: input.durationSec, provider: this.name, isMock: true };
  }
}

export const mockMusicProvider = new MockMusicProvider();

import { ffmpegService } from "../../media/ffmpeg/FFmpegService.js";
import type { TTSGenerationInput, TTSGenerationResult, TTSProvider } from "../types.js";

const WORDS_PER_MINUTE = 150; // rough average narration pace, used only to size the placeholder clip

function estimateDurationSec(text: string, speed = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const baseSec = (words / WORDS_PER_MINUTE) * 60;
  const withFloor = Math.max(baseSec, 0.6); // never zero-length, even for very short lines
  return Math.round((withFloor / Math.max(speed, 0.1)) * 100) / 100;
}

/**
 * Development TTS provider (spec #20, #41): renders a real placeholder
 * audio clip (a gentle tone sized to roughly how long the narration would
 * take to speak) instead of calling a paid TTS API. Duration scales with
 * text length and the requested speed, so downstream scene timing/assembly
 * logic gets a realistic-enough value to work with.
 */
export class MockTTSProvider implements TTSProvider {
  readonly name = "mock";
  readonly isMock = true;

  async generateVoice(input: TTSGenerationInput, outputPath: string): Promise<TTSGenerationResult> {
    const durationSec = estimateDurationSec(input.text, input.speed);
    const pitchFrequency = 200 * (input.pitch ?? 1);

    await ffmpegService.generateToneAudio(outputPath, {
      durationSec,
      frequency: pitchFrequency,
      volume: 0.2,
    });

    return {
      status: "completed",
      filePath: outputPath,
      durationSec,
      provider: this.name,
      isMock: true,
      voice: input.voice,
      language: input.language,
    };
  }
}

export const mockTTSProvider = new MockTTSProvider();

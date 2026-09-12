import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { mockImageProvider } from "../src/providers/image/MockImageProvider.js";
import { mockVideoProvider } from "../src/providers/video/MockVideoProvider.js";
import { mockTTSProvider } from "../src/providers/tts/MockTTSProvider.js";
import { mockMusicProvider } from "../src/providers/music/MockMusicProvider.js";
import { ffmpegService } from "../src/media/ffmpeg/FFmpegService.js";

describe("mock providers (real ffmpeg output, not fake claims)", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mock-providers-test-"));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("MockImageProvider writes a real, correctly-sized PNG and flags itself as mock", async () => {
    const out = path.join(dir, "img.png");
    const result = await mockImageProvider.generateImage({ prompt: "a fluffy alpaca", aspectRatio: "16:9", resolution: "640x360" }, out);

    expect(result.isMock).toBe(true);
    expect(result.provider).toBe("mock");
    expect(result.status).toBe("completed");

    const probe = await ffmpegService.probe(out);
    expect(probe.exists).toBe(true);
    expect(probe.width).toBe(640);
    expect(probe.height).toBe(360);
  });

  it("MockVideoProvider writes a real video of the requested duration/resolution", async () => {
    const out = path.join(dir, "vid.mp4");
    const result = await mockVideoProvider.generateVideo(
      { prompt: "alpaca waves hello", duration: 1, aspectRatio: "16:9", resolution: "320x180" },
      out
    );

    expect(result.isMock).toBe(true);
    const probe = await ffmpegService.probe(out);
    expect(probe.hasVideo).toBe(true);
    expect(probe.width).toBe(320);
    expect(probe.height).toBe(180);
    expect(probe.durationSec).toBeGreaterThan(0.5);
  });

  it("MockTTSProvider sizes narration duration to the text length and speed", async () => {
    const shortOut = path.join(dir, "short.m4a");
    const longOut = path.join(dir, "long.m4a");

    const shortResult = await mockTTSProvider.generateVoice({ text: "Hi.", language: "English", voice: "default" }, shortOut);
    const longText = "This is a much longer sentence that should take noticeably more time to narrate out loud than a short one.";
    const longResult = await mockTTSProvider.generateVoice({ text: longText, language: "English", voice: "default" }, longOut);

    expect(longResult.durationSec).toBeGreaterThan(shortResult.durationSec);

    const probe = await ffmpegService.probe(longOut);
    expect(probe.hasAudio).toBe(true);
    expect(Math.abs(probe.durationSec - longResult.durationSec)).toBeLessThan(0.3);
  });

  it("MockTTSProvider speed multiplier shortens the clip", async () => {
    const normalOut = path.join(dir, "normal.m4a");
    const fastOut = path.join(dir, "fast.m4a");
    const text = "The quick brown fox jumps over the lazy dog near the riverbank.";

    const normal = await mockTTSProvider.generateVoice({ text, language: "English", voice: "default", speed: 1 }, normalOut);
    const fast = await mockTTSProvider.generateVoice({ text, language: "English", voice: "default", speed: 2 }, fastOut);

    expect(fast.durationSec).toBeLessThan(normal.durationSec);
  });

  it("MockMusicProvider writes a real audio track of the requested duration", async () => {
    const out = path.join(dir, "music.m4a");
    const result = await mockMusicProvider.generateMusic({ mood: "cheerful", durationSec: 1 }, out);

    expect(result.isMock).toBe(true);
    const probe = await ffmpegService.probe(out);
    expect(probe.hasAudio).toBe(true);
    expect(probe.durationSec).toBeGreaterThan(0.5);
  });
});

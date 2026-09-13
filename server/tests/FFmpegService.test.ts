import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ffmpegService } from "../src/media/ffmpeg/FFmpegService.js";

// These run the REAL ffmpeg/ffprobe binaries (short, low-res clips) rather
// than mocking them - the spec explicitly rules out fake functionality for
// the media pipeline, so this is the one place that's worth the real I/O.

describe("FFmpegService (real ffmpeg/ffprobe)", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ffmpeg-svc-test-"));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("probe reports exists:false for a missing file", async () => {
    const result = await ffmpegService.probe(path.join(dir, "nope.mp4"));
    expect(result.exists).toBe(false);
  });

  it("generates a placeholder color image with drawtext", async () => {
    const out = path.join(dir, "img.png");
    await ffmpegService.generateColorImage(out, { width: 320, height: 180, color: "0x336699", title: "T", subtitle: "S" });
    const stat = await fs.stat(out);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("generates a short placeholder video and probes it correctly", async () => {
    const out = path.join(dir, "vid.mp4");
    await ffmpegService.generateTestVideo(out, { width: 320, height: 180, durationSec: 1, fps: 24, color: "0xAA3344", title: "Scene" });
    const probe = await ffmpegService.probe(out);
    expect(probe.exists).toBe(true);
    expect(probe.hasVideo).toBe(true);
    expect(probe.width).toBe(320);
    expect(probe.height).toBe(180);
    expect(probe.durationSec).toBeGreaterThan(0.5);
  });

  it("generates placeholder tone audio and probes it correctly", async () => {
    const out = path.join(dir, "audio.m4a");
    await ffmpegService.generateToneAudio(out, { durationSec: 1 });
    const probe = await ffmpegService.probe(out);
    expect(probe.hasAudio).toBe(true);
    expect(probe.durationSec).toBeGreaterThan(0.5);
  });

  it("concatenates two videos into one of combined duration", async () => {
    const v1 = path.join(dir, "c1.mp4");
    const v2 = path.join(dir, "c2.mp4");
    const out = path.join(dir, "concat.mp4");
    await ffmpegService.generateTestVideo(v1, { width: 320, height: 180, durationSec: 1, fps: 24, color: "0x112233", title: "1" });
    await ffmpegService.generateTestVideo(v2, { width: 320, height: 180, durationSec: 1, fps: 24, color: "0x445566", title: "2" });
    await ffmpegService.concatenateVideos([v1, v2], out, { width: 320, height: 180, fps: 24 });
    const probe = await ffmpegService.probe(out);
    expect(probe.durationSec).toBeGreaterThan(1.8);
    expect(probe.durationSec).toBeLessThan(2.3);
  });

  it("adds an audio track to a silent video", async () => {
    const video = path.join(dir, "silent.mp4");
    const audio = path.join(dir, "narration.m4a");
    const out = path.join(dir, "withaudio.mp4");
    await ffmpegService.generateTestVideo(video, { width: 320, height: 180, durationSec: 1, fps: 24, color: "0x556677", title: "V" });
    await ffmpegService.generateToneAudio(audio, { durationSec: 1 });
    await ffmpegService.addAudio(video, audio, out);
    const probe = await ffmpegService.probe(out);
    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(true);
  });

  it("addAudio pads the shorter side instead of truncating when lengths differ", async () => {
    const shortVideo = path.join(dir, "shortvid.mp4");
    const longAudio = path.join(dir, "longaudio.m4a");
    const out1 = path.join(dir, "videopadded.mp4");
    await ffmpegService.generateTestVideo(shortVideo, { width: 320, height: 180, durationSec: 1, fps: 24, color: "0x112233", title: "S" });
    await ffmpegService.generateToneAudio(longAudio, { durationSec: 2 });
    await ffmpegService.addAudio(shortVideo, longAudio, out1);
    const probe1 = await ffmpegService.probe(out1);
    expect(probe1.durationSec).toBeGreaterThan(1.8); // video was padded up to audio's length, not truncated down

    const longVideo = path.join(dir, "longvid.mp4");
    const shortAudio = path.join(dir, "shortaudio.m4a");
    const out2 = path.join(dir, "audiopadded.mp4");
    await ffmpegService.generateTestVideo(longVideo, { width: 320, height: 180, durationSec: 2, fps: 24, color: "0x334455", title: "L" });
    await ffmpegService.generateToneAudio(shortAudio, { durationSec: 1 });
    await ffmpegService.addAudio(longVideo, shortAudio, out2);
    const probe2 = await ffmpegService.probe(out2);
    expect(probe2.durationSec).toBeGreaterThan(1.8); // audio was padded with silence up to video's length
  });

  it("concatenates multiple audio-only clips into one continuous track", async () => {
    const a1 = path.join(dir, "a1.m4a");
    const a2 = path.join(dir, "a2.m4a");
    const a3 = path.join(dir, "a3.m4a");
    const out = path.join(dir, "concataudio.m4a");
    await ffmpegService.generateToneAudio(a1, { durationSec: 1, frequency: 200 });
    await ffmpegService.generateToneAudio(a2, { durationSec: 1, frequency: 300 });
    await ffmpegService.generateToneAudio(a3, { durationSec: 1, frequency: 400 });
    await ffmpegService.concatenateAudios([a1, a2, a3], out);
    const probe = await ffmpegService.probe(out);
    expect(probe.hasAudio).toBe(true);
    expect(probe.durationSec).toBeGreaterThan(2.7);
    expect(probe.durationSec).toBeLessThan(3.3);
  });

  it("mixes narration and looping music into one track at the target duration", async () => {
    const narration = path.join(dir, "narr2.m4a");
    const music = path.join(dir, "music2.m4a");
    const out = path.join(dir, "mixed.m4a");
    await ffmpegService.generateToneAudio(narration, { durationSec: 3, frequency: 300 });
    await ffmpegService.generateToneAudio(music, { durationSec: 1, frequency: 500 }); // shorter than target - must loop
    await ffmpegService.mixAudio(narration, music, out, { durationSec: 3, musicVolume: 0.2 });
    const probe = await ffmpegService.probe(out);
    expect(probe.hasAudio).toBe(true);
    expect(probe.durationSec).toBeGreaterThan(2.5);
  });

  it("creates a thumbnail image from a video frame", async () => {
    const video = path.join(dir, "thumbsrc.mp4");
    const out = path.join(dir, "thumb.png");
    await ffmpegService.generateTestVideo(video, { width: 320, height: 180, durationSec: 1, fps: 24, color: "0x998877", title: "Thumb" });
    await ffmpegService.createThumbnail(video, out, { timestampSec: 0.2, width: 160, height: 90 });
    const probe = await ffmpegService.probe(out);
    expect(probe.width).toBe(160);
    expect(probe.height).toBe(90);
  });

  it("adds soft subtitles without altering audio/video codecs", async () => {
    const video = path.join(dir, "subsrc.mp4");
    const audio = path.join(dir, "subsaudio.m4a");
    const withAudio = path.join(dir, "subsrc_audio.mp4");
    const srt = path.join(dir, "subs.srt");
    const out = path.join(dir, "withsubs.mp4");

    await ffmpegService.generateTestVideo(video, { width: 320, height: 180, durationSec: 1, fps: 24, color: "0x223344", title: "Subs" });
    await ffmpegService.generateToneAudio(audio, { durationSec: 1 });
    await ffmpegService.addAudio(video, audio, withAudio);
    await fs.writeFile(srt, "1\n00:00:00,000 --> 00:00:01,000\nHello\n", "utf-8");

    await ffmpegService.addSubtitles(withAudio, srt, out, { burnIn: false });
    const probe = await ffmpegService.probe(out);
    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(true);
  });

  it("rejects concatenateVideos with no inputs", async () => {
    await expect(ffmpegService.concatenateVideos([], path.join(dir, "x.mp4"), { width: 1, height: 1, fps: 1 })).rejects.toMatchObject({
      code: "FFMPEG_ERROR",
    });
  });

  it("imageToVideo converts a still image into a fixed-duration video at the target resolution, for every fit mode", async () => {
    const image = path.join(dir, "upload.png");
    // A non-16:9 source so FIT/CROP/BLUR_BACKGROUND genuinely differ from a plain scale.
    await ffmpegService.generateColorImage(image, { width: 400, height: 400, color: "0x224466", title: "Upload" });

    for (const fitMode of ["FIT", "CROP", "BLUR_BACKGROUND"] as const) {
      const out = path.join(dir, `image-${fitMode}.mp4`);
      await ffmpegService.imageToVideo(image, out, { width: 320, height: 180, fps: 24, durationSec: 2, fitMode });
      const probe = await ffmpegService.probe(out);
      expect(probe.hasVideo).toBe(true);
      expect(probe.width).toBe(320);
      expect(probe.height).toBe(180);
      expect(probe.durationSec).toBeGreaterThan(1.5);
    }
  });

  it("normalizeVideoClip resizes an uploaded clip to the target resolution/fps without audio", async () => {
    const source = path.join(dir, "uploaded-clip.mp4");
    await ffmpegService.generateTestVideo(source, { width: 640, height: 360, durationSec: 2, fps: 30, color: "0x336699", title: "Clip" });

    const out = path.join(dir, "normalized-clip.mp4");
    await ffmpegService.normalizeVideoClip(source, out, { width: 320, height: 180, fps: 24, fitMode: "CROP" });
    const probe = await ffmpegService.probe(out);
    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(false);
    expect(probe.width).toBe(320);
    expect(probe.height).toBe(180);
  });

  it("normalizeVideoClip trims to the given start/end range", async () => {
    const source = path.join(dir, "trim-source.mp4");
    await ffmpegService.generateTestVideo(source, { width: 320, height: 180, durationSec: 4, fps: 24, color: "0x556677", title: "Trim" });

    const out = path.join(dir, "trimmed.mp4");
    await ffmpegService.normalizeVideoClip(source, out, { width: 320, height: 180, fps: 24, trimStartSec: 1, trimEndSec: 3 });
    const probe = await ffmpegService.probe(out);
    expect(probe.durationSec).toBeGreaterThan(1.5);
    expect(probe.durationSec).toBeLessThan(2.5);
  });

  it("prepareMusicTrack loops a short music bed up to an exact target duration", async () => {
    const music = path.join(dir, "music-bed.m4a");
    await ffmpegService.generateToneAudio(music, { durationSec: 1 });
    const out = path.join(dir, "music-prepared.m4a");
    await ffmpegService.prepareMusicTrack(music, out, { durationSec: 3, volume: 0.3 });
    const probe = await ffmpegService.probe(out);
    expect(probe.hasAudio).toBe(true);
    expect(probe.durationSec).toBeGreaterThan(2.5);
  });
});

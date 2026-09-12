import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { env } from "../../utils/env.js";
import { AppError } from "../../utils/errors.js";
import { childLogger } from "../../utils/logger.js";

const log = childLogger({ module: "FFmpegService" });

export interface MediaProbeResult {
  exists: boolean;
  durationSec: number;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  hasVideo: boolean;
  hasAudio: boolean;
  formatName?: string;
  sizeBytes?: number;
}

/** Escapes a path for safe use inside an ffmpeg filtergraph argument (subtitles=, drawtext, etc). */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapeDrawtext(text: string): string {
  const normalized = text
    // The default font drawtext falls back to (no fontfile is configured -
    // this is placeholder/mock text, not final output) doesn't have glyphs
    // for smart quotes/dashes, which render as a tofu box. Fold to plain
    // ASCII equivalents rather than showing broken glyphs on every mock asset.
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...");
  return normalized.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");
}

const MAX_BUFFER = 1024 * 1024 * 64; // 64MB of stdout/stderr - ffmpeg logs can be chatty

/**
 * The single place in the application that talks to ffmpeg/ffprobe (spec
 * #23: "Do NOT scatter FFmpeg commands throughout the application"). Every
 * command is a programmatically-built argument array passed to execFile
 * (never a shell string), so nothing here is vulnerable to shell injection
 * and no raw LLM-provided text is ever interpreted by a shell (spec #26).
 *
 * Note: this deliberately does not use the `fluent-ffmpeg` package for
 * command execution - its `-formats`/`-codecs` output parser predates
 * modern ffmpeg's 3-flag device-capability column and misreports widely
 * used formats (e.g. lavfi) as "not available" even when the underlying
 * binary fully supports them. Direct execFile calls avoid that entirely.
 */
export class FFmpegService {
  private async exec(args: string[], label: string): Promise<void> {
    const start = Date.now();
    log.debug({ label, args }, "ffmpeg command starting");
    await new Promise<void>((resolve, reject) => {
      execFile(env.FFMPEG_PATH, ["-y", "-hide_banner", "-loglevel", "error", ...args], { maxBuffer: MAX_BUFFER }, (err, _stdout, stderr) => {
        if (err) {
          reject(
            new AppError("FFMPEG_ERROR", `ffmpeg failed during ${label}: ${stderr?.trim() || err.message}`, {
              retryable: false,
              details: { label },
            })
          );
          return;
        }
        resolve();
      });
    });
    log.debug({ label, durationMs: Date.now() - start }, "ffmpeg command finished");
  }

  // ---------------------------------------------------------------------
  // Inspection
  // ---------------------------------------------------------------------

  async probe(filePath: string): Promise<MediaProbeResult> {
    try {
      await fs.access(filePath);
    } catch {
      return { exists: false, durationSec: 0, hasVideo: false, hasAudio: false };
    }

    const json = await new Promise<any>((resolve, reject) => {
      execFile(
        env.FFPROBE_PATH,
        ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
        { maxBuffer: MAX_BUFFER },
        (err, stdout, stderr) => {
          if (err) {
            reject(new AppError("FFMPEG_ERROR", `ffprobe failed: ${stderr?.trim() || err.message}`, { retryable: false }));
            return;
          }
          try {
            resolve(JSON.parse(stdout));
          } catch (parseErr) {
            reject(new AppError("FFMPEG_ERROR", `ffprobe returned invalid JSON: ${(parseErr as Error).message}`, { retryable: false }));
          }
        }
      );
    });

    const videoStream = json.streams?.find((s: any) => s.codec_type === "video");
    const audioStream = json.streams?.find((s: any) => s.codec_type === "audio");
    let fps: number | undefined;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
      if (den) fps = Math.round((num / den) * 100) / 100;
    }

    return {
      exists: true,
      durationSec: Number(json.format?.duration ?? videoStream?.duration ?? 0),
      width: videoStream?.width,
      height: videoStream?.height,
      fps,
      videoCodec: videoStream?.codec_name,
      audioCodec: audioStream?.codec_name,
      hasVideo: Boolean(videoStream),
      hasAudio: Boolean(audioStream),
      formatName: json.format?.format_name,
      sizeBytes: json.format?.size ? Number(json.format.size) : undefined,
    };
  }

  // ---------------------------------------------------------------------
  // Generation (used by mock providers - spec #41)
  // ---------------------------------------------------------------------

  /** A static placeholder image: solid color background with a text label, via lavfi + drawtext. */
  async generateColorImage(
    outputPath: string,
    opts: { width: number; height: number; color: string; title: string; subtitle?: string }
  ): Promise<void> {
    const vf = this.buildLabelFilter(opts.width, opts.title, opts.subtitle, false);
    await this.exec(
      [
        "-f",
        "lavfi",
        "-i",
        `color=c=${opts.color}:s=${opts.width}x${opts.height}:d=1`,
        "-frames:v",
        "1",
        "-vf",
        vf,
        outputPath,
      ],
      "generateColorImage"
    );
  }

  /** A short placeholder video clip: solid color + text label, via lavfi. */
  async generateTestVideo(
    outputPath: string,
    opts: { width: number; height: number; durationSec: number; fps: number; color: string; title: string; subtitle?: string }
  ): Promise<void> {
    const vf = this.buildLabelFilter(opts.width, opts.title, opts.subtitle, true);
    await this.exec(
      [
        "-f",
        "lavfi",
        "-i",
        `color=c=${opts.color}:s=${opts.width}x${opts.height}:d=${opts.durationSec}:r=${opts.fps}`,
        "-vf",
        vf,
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-t",
        String(opts.durationSec),
        outputPath,
      ],
      "generateTestVideo"
    );
  }

  private buildLabelFilter(width: number, title: string, subtitle: string | undefined, includeMockWatermark: boolean): string {
    const parts = [
      `drawtext=text='${escapeDrawtext(title)}':fontcolor=white:fontsize=${Math.round(
        width / 20
      )}:x=(w-text_w)/2:y=(h-text_h)/2-70:box=1:boxcolor=black@0.35:boxborderw=12`,
    ];
    if (subtitle) {
      parts.push(
        `drawtext=text='${escapeDrawtext(subtitle)}':fontcolor=white:fontsize=${Math.round(
          width / 38
        )}:x=(w-text_w)/2:y=(h-text_h)/2+60:box=1:boxcolor=black@0.35:boxborderw=8`
      );
    }
    if (includeMockWatermark) {
      parts.push(
        `drawtext=text='MOCK ASSET':fontcolor=yellow@0.8:fontsize=${Math.round(
          width / 45
        )}:x=16:y=16:box=1:boxcolor=black@0.4:boxborderw=6`
      );
    }
    return parts.join(",");
  }

  /** Placeholder audio: a gentle tone whose pitch/rhythm loosely stands in for speech or music. */
  async generateToneAudio(outputPath: string, opts: { durationSec: number; frequency?: number; volume?: number }): Promise<void> {
    const freq = opts.frequency ?? 220;
    const vol = opts.volume ?? 0.15;
    const fadeOutStart = Math.max(0, opts.durationSec - 0.3);
    await this.exec(
      [
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=${freq}:duration=${opts.durationSec}`,
        "-af",
        `volume=${vol},afade=t=in:d=0.15,afade=t=out:st=${fadeOutStart}:d=0.3`,
        "-c:a",
        "aac",
        outputPath,
      ],
      "generateToneAudio"
    );
  }

  // ---------------------------------------------------------------------
  // Assembly (spec #23 pipeline)
  // ---------------------------------------------------------------------

  /** Concatenates video clips (re-encoding each to a common spec first, so mixed sources still work). */
  async concatenateVideos(inputPaths: string[], outputPath: string, opts: { width: number; height: number; fps: number }): Promise<void> {
    if (inputPaths.length === 0) {
      throw new AppError("FFMPEG_ERROR", "concatenateVideos called with no inputs.", { retryable: false });
    }
    if (inputPaths.length === 1) {
      await this.resizeVideo(inputPaths[0], outputPath, opts);
      return;
    }

    const filterParts: string[] = [];
    inputPaths.forEach((_p, i) => {
      filterParts.push(
        `[${i}:v]scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease,pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${opts.fps}[v${i}]`
      );
    });
    const concatInputs = inputPaths.map((_p, i) => `[v${i}]`).join("");
    filterParts.push(`${concatInputs}concat=n=${inputPaths.length}:v=1:a=0[outv]`);

    const args: string[] = [];
    for (const p of inputPaths) args.push("-i", p);
    args.push("-filter_complex", filterParts.join(";"), "-map", "[outv]", "-c:v", "libx264", "-pix_fmt", "yuv420p", outputPath);
    await this.exec(args, "concatenateVideos");
  }

  async trimVideo(inputPath: string, outputPath: string, opts: { startSec: number; durationSec: number }): Promise<void> {
    await this.exec(
      ["-ss", String(opts.startSec), "-i", inputPath, "-t", String(opts.durationSec), "-c:v", "libx264", "-pix_fmt", "yuv420p", outputPath],
      "trimVideo"
    );
  }

  async resizeVideo(inputPath: string, outputPath: string, opts: { width: number; height: number; fps?: number }): Promise<void> {
    const vf = [
      `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease`,
      `pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2`,
      "setsar=1",
      ...(opts.fps ? [`fps=${opts.fps}`] : []),
    ].join(",");
    await this.exec(["-i", inputPath, "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", outputPath], "resizeVideo");
  }

  async convertVideo(inputPath: string, outputPath: string): Promise<void> {
    await this.exec(["-i", inputPath, outputPath], "convertVideo");
  }

  /**
   * Replaces/adds the audio track of a video with an external audio file.
   * The two are rarely exactly the same length (narration timing vs.
   * generated clip length can differ by a fraction of a second) - rather
   * than silently truncating whichever is shorter, the shorter side is
   * padded to match (video freezes its last frame; audio gets silence)
   * so nothing gets cut off.
   */
  async addAudio(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
    const [videoProbe, audioProbe] = await Promise.all([this.probe(videoPath), this.probe(audioPath)]);
    const targetDuration = Math.max(videoProbe.durationSec, audioProbe.durationSec);
    const videoPad = Math.max(0, targetDuration - videoProbe.durationSec);

    const filter = [
      videoPad > 0.05 ? `[0:v]tpad=stop_mode=clone:stop_duration=${videoPad}[v]` : `[0:v]null[v]`,
      `[1:a]apad=whole_dur=${targetDuration}[a]`,
    ].join(";");

    await this.exec(
      ["-i", videoPath, "-i", audioPath, "-filter_complex", filter, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", outputPath],
      "addAudio"
    );
  }

  /** Concatenates audio-only files (narration clips, one per scene) into a single continuous track. */
  async concatenateAudios(inputPaths: string[], outputPath: string): Promise<void> {
    if (inputPaths.length === 0) {
      throw new AppError("FFMPEG_ERROR", "concatenateAudios called with no inputs.", { retryable: false });
    }
    if (inputPaths.length === 1) {
      await this.exec(["-i", inputPaths[0], "-c:a", "aac", outputPath], "concatenateAudios");
      return;
    }
    const filterParts = inputPaths.map((_p, i) => `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
    const concatInputs = inputPaths.map((_p, i) => `[a${i}]`).join("");
    filterParts.push(`${concatInputs}concat=n=${inputPaths.length}:v=0:a=1[aout]`);

    const args: string[] = [];
    for (const p of inputPaths) args.push("-i", p);
    args.push("-filter_complex", filterParts.join(";"), "-map", "[aout]", "-c:a", "aac", outputPath);
    await this.exec(args, "concatenateAudios");
  }

  /** Mixes narration + background music into one audio track, music at a lower relative volume with a fade out. */
  async mixAudio(
    narrationPath: string,
    musicPath: string,
    outputPath: string,
    opts: { musicVolume?: number; durationSec: number; fadeOutSec?: number }
  ): Promise<void> {
    const musicVolume = opts.musicVolume ?? 0.25;
    const fadeOut = opts.fadeOutSec ?? 1.5;
    const fadeStart = Math.max(0, opts.durationSec - fadeOut);
    const filter = [
      `[1:a]aloop=loop=-1:size=2e9,atrim=0:${opts.durationSec},volume=${musicVolume},afade=t=out:st=${fadeStart}:d=${fadeOut}[music]`,
      `[0:a][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
    ].join(";");
    await this.exec(
      ["-i", narrationPath, "-i", musicPath, "-filter_complex", filter, "-map", "[aout]", "-c:a", "aac", outputPath],
      "mixAudio"
    );
  }

  /** Merges a video with a finished audio track (alias of addAudio, kept as a distinct pipeline step name). */
  async addMusic(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
    await this.addAudio(videoPath, audioPath, outputPath);
  }

  /** Adds subtitles - soft (muxed, toggleable in players) by default, or burned in when requested. */
  async addSubtitles(videoPath: string, srtPath: string, outputPath: string, opts: { burnIn: boolean; fontSize?: number }): Promise<void> {
    if (opts.burnIn) {
      const style = `FontSize=${opts.fontSize ?? 24},PrimaryColour=&H00FFFFFF,BorderStyle=3,Outline=1,Shadow=0,MarginV=40`;
      await this.exec(
        ["-i", videoPath, "-vf", `subtitles=${escapeFilterPath(srtPath)}:force_style='${style}'`, "-c:a", "copy", outputPath],
        "addSubtitles(burnIn)"
      );
    } else {
      await this.exec(
        [
          "-i",
          videoPath,
          "-i",
          srtPath,
          "-map",
          "0:v",
          "-map",
          "0:a?",
          "-map",
          "1:s",
          "-c:v",
          "copy",
          "-c:a",
          "copy",
          "-c:s",
          "mov_text",
          outputPath,
        ],
        "addSubtitles(soft)"
      );
    }
  }

  async extractFrame(videoPath: string, outputPath: string, timestampSec: number): Promise<void> {
    await this.exec(["-ss", String(timestampSec), "-i", videoPath, "-frames:v", "1", outputPath], "extractFrame");
  }

  async createThumbnail(videoPath: string, outputPath: string, opts: { timestampSec: number; width: number; height: number }): Promise<void> {
    const vf = `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease,pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2`;
    await this.exec(["-ss", String(opts.timestampSec), "-i", videoPath, "-frames:v", "1", "-vf", vf, outputPath], "createThumbnail");
  }

  /** A short, lower-bitrate preview clip for quick UI playback while the full render is still in progress. */
  async createPreview(videoPath: string, outputPath: string, opts: { maxDurationSec: number }): Promise<void> {
    await this.exec(
      ["-i", videoPath, "-t", String(opts.maxDurationSec), "-vf", "scale=640:-2", "-c:v", "libx264", "-crf", "30", "-preset", "veryfast", outputPath],
      "createPreview"
    );
  }

  async tempDir(prefix: string): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
  }
}

export const ffmpegService = new FFmpegService();

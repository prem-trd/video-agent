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

/** `adelay` prefix (with trailing comma) to start an audio stream later, or "" for no delay. */
function delayFilter(delaySec: number): string {
  return delaySec > 0 ? `adelay=${Math.round(delaySec * 1000)}:all=1,` : "";
}

/** "#RRGGBB" (as stored/entered in the UI) -> ffmpeg's "0xRRGGBB"; anything else falls back to white. */
function toFfmpegColor(color?: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(color ?? "");
  return m ? `0x${m[1]}` : "white";
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
/** Common audio format for every segment, so concat/amix never see mismatched sample rates or layouts. */
const AUDIO_FORMAT = "aformat=sample_rates=48000:channel_layouts=stereo";
/** Endless silent stereo source - always bounded by -t/atrim or the video length. */
const SILENT_AUDIO_SOURCE = "anullsrc=r=48000:cl=stereo";

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
  // Normalization (uploaded media -> a uniform video segment ready to
  // concatenate). Never stretches: FIT letterboxes, CROP fills by cropping,
  // BLUR_BACKGROUND fills the frame with a blurred, cropped copy of the
  // same image behind a letterboxed foreground.
  // ---------------------------------------------------------------------

  private fitFilter(mode: "FIT" | "CROP" | "BLUR_BACKGROUND", width: number, height: number): string {
    switch (mode) {
      case "CROP":
        return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
      case "BLUR_BACKGROUND":
        return (
          `split=2[bg][fg];` +
          `[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=20[bg2];` +
          `[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg2];` +
          `[bg2][fg2]overlay=(W-w)/2:(H-h)/2,setsar=1`
        );
      case "FIT":
      default:
        return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
    }
  }

  /** Converts a still image into a fixed-duration video segment (slideshow building block) with a silent audio track. Never stretches - see fitFilter. */
  async imageToVideo(
    inputPath: string,
    outputPath: string,
    opts: { width: number; height: number; fps: number; durationSec: number; fitMode?: "FIT" | "CROP" | "BLUR_BACKGROUND" }
  ): Promise<void> {
    const vf = `${this.fitFilter(opts.fitMode ?? "FIT", opts.width, opts.height)},fps=${opts.fps}`;
    await this.exec(
      [
        "-loop",
        "1",
        "-i",
        inputPath,
        "-f",
        "lavfi",
        "-i",
        SILENT_AUDIO_SOURCE,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-t",
        String(opts.durationSec),
        "-vf",
        vf,
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        outputPath,
      ],
      "imageToVideo"
    );
  }

  /**
   * Normalizes an uploaded video clip to a common resolution/fps/fit, with
   * optional trim. The clip's own audio (dialogue, SFX, music baked in by
   * the generator) is KEPT, resampled to a common format; a clip without
   * audio gets a silent track, so every segment can be concatenated with
   * audio.
   */
  async normalizeVideoClip(
    inputPath: string,
    outputPath: string,
    opts: {
      width: number;
      height: number;
      fps: number;
      fitMode?: "FIT" | "CROP" | "BLUR_BACKGROUND";
      trimStartSec?: number;
      trimEndSec?: number;
    }
  ): Promise<void> {
    const source = await this.probe(inputPath);
    const trimStart = opts.trimStartSec ?? 0;
    const trimmed = opts.trimEndSec !== undefined ? opts.trimEndSec - trimStart : 0;
    const duration = trimmed > 0 ? trimmed : Math.max(0, source.durationSec - trimStart);

    const filter = [
      `[0:v]${this.fitFilter(opts.fitMode ?? "FIT", opts.width, opts.height)},fps=${opts.fps}[v]`,
      source.hasAudio ? `[0:a:0]${AUDIO_FORMAT},apad[a]` : `${SILENT_AUDIO_SOURCE}[a]`,
    ].join(";");

    const args: string[] = [];
    if (trimStart) args.push("-ss", String(trimStart));
    args.push("-i", inputPath, "-filter_complex", filter, "-map", "[v]", "-map", "[a]");
    // Explicit output duration: apad/anullsrc are endless, so the video length decides.
    if (duration > 0) args.push("-t", String(duration));
    args.push("-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", outputPath);
    await this.exec(args, "normalizeVideoClip");
  }

  // ---------------------------------------------------------------------
  // Branding (opening / end screens)
  // ---------------------------------------------------------------------

  /**
   * Renders the channel's opening or end screen as a normal video segment
   * (with audio, so it joins like any clip), matching the channel's
   * existing videos:
   *
   * OPENING  per-video background; `openingText` ("Welcome to") types in
   *          letter by letter, holds, fades; the logo pops in with an
   *          overshoot and then pulses on the beat; SUBSCRIBE (top-left),
   *          share (top-right) and like (bottom-right) buttons pulse gently;
   *          opening music underneath, faded out at the end.
   * OUTRO    white (or the video's) background; the wide logo is revealed
   *          with a left-to-right wipe; like, share and SUBSCRIBE pop in one
   *          after another (SUBSCRIBE keeps pulsing); the end-screen voice
   *          plays over a soft bed of the opening music.
   *
   * Timings mirror the reference video (logo in at ~1.85s, wipe 0.3-1.3s,
   * share at 2.3s, subscribe at 2.8s) and are scaled down if a card is
   * configured shorter. Text goes through textfile= so nothing in it can
   * break the filtergraph.
   */
  async renderBrandCard(
    outputPath: string,
    opts: {
      kind: "INTRO" | "OUTRO";
      width: number;
      height: number;
      fps: number;
      durationSec: number;
      /** Background image; omitted = plain white. */
      backgroundPath?: string;
      blurBackground?: boolean;
      logoPath?: string;
      openingText?: string;
      title?: string;
      fontPath?: string;
      textColor?: string;
      /** Pre-rendered button images (see BrandingService.buttonAssets). */
      buttons?: { subscribe: string; like: string; share: string };
      musicPath?: string;
      musicVolume?: number;
      voicePath?: string;
    }
  ): Promise<void> {
    const { width: W, height: H, fps, durationSec: D } = opts;
    const isIntro = opts.kind === "INTRO";
    const textDir = await this.tempDir("brand-text-");
    try {
      const inputs: string[] = [];
      let next = 0;
      const addImage = (file: string) => {
        inputs.push("-loop", "1", "-framerate", String(fps), "-t", String(D), "-i", file);
        return next++;
      };
      const bgIndex = opts.backgroundPath
        ? addImage(opts.backgroundPath)
        : (inputs.push("-f", "lavfi", "-i", `color=c=white:s=${W}x${H}:r=${fps}:d=${D}`), next++);
      const logoIndex = opts.logoPath ? addImage(opts.logoPath) : -1;
      const btn = opts.buttons ? { subscribe: addImage(opts.buttons.subscribe), like: addImage(opts.buttons.like), share: addImage(opts.buttons.share) } : null;
      const musicIndex = opts.musicPath ? (inputs.push("-stream_loop", "-1", "-i", opts.musicPath), next++) : -1;
      const voiceIndex = opts.voicePath ? (inputs.push("-i", opts.voicePath), next++) : -1;

      const filters: string[] = [];
      filters.push(
        `[${bgIndex}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},${opts.blurBackground ? "gblur=sigma=24," : ""}setsar=1,fps=${fps},format=yuv420p[bg]`
      );
      let current = "bg";
      const overlay = (input: string, x: string, y: string, enable?: string) => {
        const out = `o${filters.length}`;
        filters.push(`[${current}][${input}]overlay=x='${x}':y='${y}':eval=frame:shortest=1${enable ? `:enable='${enable}'` : ""}[${out}]`);
        current = out;
      };
      // Per-frame scale: `factor` is an ffmpeg expression in t (1 = base size).
      const scaled = (index: number, baseH: number, factor: string) => {
        const out = `s${filters.length}`;
        filters.push(`[${index}:v]format=rgba,scale=w=-2:h='max(2,trunc(${baseH}*(${factor})/2)*2)':eval=frame[${out}]`);
        return out;
      };
      // Pop-in with overshoot at t0, then optional pulse (amplitude a, period p seconds).
      const pop = (t0: number, a = 0, p = 1) =>
        `if(lt(t,${t0}),0.01,if(lt(t,${t0 + 0.25}),1.18*(t-${t0})/0.25,if(lt(t,${t0 + 0.45}),1.18-0.18*(t-${t0 + 0.25})/0.2,1+${a}*sin(2*PI*(t-${t0 + 0.45})/${p}))))`;
      const k = Math.min(1, D / 6); // compress the reference timings for short cards

      const color = toFfmpegColor(opts.textColor);
      const font = opts.fontPath ? `fontfile='${escapeFilterPath(opts.fontPath)}'` : `fontfile='/System/Library/Fonts/Supplemental/Georgia Bold.ttf'`;

      if (isIntro) {
        // "Welcome to": revealed left-to-right like typing (0 -> 0.9s sweep), then wiped
        // away left-to-right (1.4 -> 1.9s), on a transparent strip so it stays exactly
        // centred (drawtext's own text_w centring) whatever the text and font.
        const text = (opts.openingText ?? "").trim();
        if (text) {
          const file = path.join(textDir, "opening.txt");
          await fs.writeFile(file, text, "utf-8");
          const size = Math.round(H * 0.085);
          const stripH = Math.round(size * 2);
          const edge = Math.round(W * 0.06); // soft edge of the sweep, px
          const inEnd = 0.9 * k;
          const outStart = 1.4 * k;
          const outDur = 0.5 * k;
          const sweepIn = `clip((W*T/${inEnd.toFixed(3)}-X)/${edge}+1\,0\,1)`;
          const sweepOut = `(1-clip((W*(T-${outStart.toFixed(3)})/${outDur.toFixed(3)}-X)/${edge}+1\,0\,1))`;
          filters.push(
            `color=c=black@0:s=${W}x${stripH}:r=${fps}:d=${D},format=rgba,` +
              `drawtext=${font}:textfile='${escapeFilterPath(file)}':expansion=none:fontsize=${size}:fontcolor=${color}:shadowcolor=black@0.35:shadowx=3:shadowy=3:x=(w-text_w)/2:y=(h-text_h)/2,` +
              `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${sweepIn}*${sweepOut}'[openingText]`
          );
          overlay("openingText", "0", `${Math.round(H * 0.44 - stripH / 2)}`, `lt(t,${(outStart + outDur + 0.05).toFixed(3)})`);
        }

        const logoAt = text ? 1.85 * k : 0.2;
        if (logoIndex >= 0) {
          const logo = scaled(logoIndex, Math.round(H * 0.62), pop(logoAt, 0.045, 1.0));
          overlay(logo, "(W-w)/2", `H*0.44-h/2`);
        }
        if (opts.title) {
          const file = path.join(textDir, "title.txt");
          await fs.writeFile(file, opts.title, "utf-8");
          const titleSize = Math.round(Math.min(H * 0.05, (W * 0.9) / Math.max(1, opts.title.length * 0.55)));
          filters.push(
            `[${current}]drawtext=${font}:textfile='${escapeFilterPath(file)}':expansion=none:fontsize=${titleSize}:fontcolor=${color}:borderw=2:bordercolor=black@0.45:x=(w-text_w)/2:y=${Math.round(H * 0.8)}:alpha='if(lt(t,${logoAt + 0.5}),0,min(1,(t-${logoAt + 0.5})/0.5))'[titled]`
          );
          current = "titled";
        }
        if (btn) {
          const sub = scaled(btn.subscribe, Math.round(H * 0.075), `1+0.05*sin(2*PI*t/1.0)`);
          overlay(sub, `${Math.round(W * 0.025)}`, `${Math.round(H * 0.035)}`);
          const share = scaled(btn.share, Math.round(H * 0.075), `1+0.05*sin(2*PI*(t+0.5)/1.0)`);
          overlay(share, `W-w-${Math.round(W * 0.025)}`, `${Math.round(H * 0.035)}`);
          const like = scaled(btn.like, Math.round(H * 0.09), `1+0.05*sin(2*PI*(t+0.25)/1.0)`);
          overlay(like, `W-w-${Math.round(W * 0.025)}`, `H-h-${Math.round(H * 0.045)}`);
        }
      } else {
        // Wide logo revealed by a left-to-right wipe (0.3s -> 1.3s): xfade between the
        // background and background+logo, so it works on any background, not just white.
        if (logoIndex >= 0) {
          const wipeAt = 0.3 * k;
          const wipeDur = 1.0 * k;
          filters.push(`[${current}]split=2[plainA][plainB]`);
          filters.push(`[${logoIndex}:v]format=rgba,scale=${Math.round(W * 0.66)}:-2[wlogo]`);
          filters.push(`[plainB][wlogo]overlay=x=(W-w)/2:y=H*0.42-h/2:shortest=1[withlogo]`);
          filters.push(`[plainA]trim=0:${(wipeAt + wipeDur).toFixed(3)},setpts=PTS-STARTPTS[wipeFrom]`);
          filters.push(`[withlogo]trim=0:${(D - wipeAt).toFixed(3)},setpts=PTS-STARTPTS[wipeTo]`);
          filters.push(`[wipeFrom][wipeTo]xfade=transition=wiperight:duration=${wipeDur.toFixed(3)}:offset=${wipeAt.toFixed(3)},format=yuv420p[revealed]`);
          current = "revealed";
        }
        if (btn) {
          const like = scaled(btn.like, Math.round(H * 0.1), pop(0.3 * k));
          overlay(like, `${Math.round(W * 0.035)}`, `H-h-${Math.round(H * 0.05)}`);
          const share = scaled(btn.share, Math.round(H * 0.1), pop(2.3 * k));
          overlay(share, `W-w-${Math.round(W * 0.035)}`, `H-h-${Math.round(H * 0.05)}`);
          const sub = scaled(btn.subscribe, Math.round(H * 0.1), pop(2.8 * k, 0.05, 1.0));
          overlay(sub, "(W-w)/2", `H*0.8-h/2`);
        }
      }
      filters.push(`[${current}]format=yuv420p[v]`);

      // ---- audio ----
      const volume = Math.max(0, Math.min(1, opts.musicVolume ?? 0.5));
      const fadeOut = Math.min(0.8, D / 4);
      const audioParts: string[] = [];
      if (musicIndex >= 0) {
        // Opening: music at `volume`; end screen: a soft bed (~30% of it) under the voice.
        const level = isIntro ? volume : volume * 0.3;
        filters.push(
          `[${musicIndex}:a]${AUDIO_FORMAT},atrim=0:${D},asetpts=PTS-STARTPTS,volume=${level.toFixed(3)},afade=t=in:d=0.05,afade=t=out:st=${(D - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}[music]`
        );
        audioParts.push("[music]");
      }
      if (voiceIndex >= 0 && !isIntro) {
        filters.push(`[${voiceIndex}:a]${AUDIO_FORMAT},${delayFilter(0.6 * k)}anull[voice]`);
        audioParts.push("[voice]");
      }
      if (audioParts.length === 0) {
        filters.push(`${SILENT_AUDIO_SOURCE},atrim=0:${D}[a]`);
      } else if (audioParts.length === 1) {
        filters.push(`${audioParts[0]}apad=whole_dur=${D}[a]`);
      } else {
        filters.push(`${audioParts.join("")}amix=inputs=${audioParts.length}:duration=longest:normalize=0:dropout_transition=0,apad=whole_dur=${D}[a]`);
      }

      await this.exec(
        [...inputs, "-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]", "-t", String(D), "-r", String(fps), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", outputPath],
        `renderBrandCard(${opts.kind})`
      );
    } finally {
      await fs.rm(textDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Decodes an image to raw RGBA pixels (for pixel-level processing in JS, e.g. button background removal). */
  async decodeImageRgba(inputPath: string): Promise<{ width: number; height: number; data: Uint8Array }> {
    const probe = await this.probe(inputPath);
    if (!probe.width || !probe.height) throw new AppError("FFMPEG_ERROR", `Not a readable image: ${inputPath}`, { retryable: false });
    const dir = await this.tempDir("decode-");
    try {
      const raw = path.join(dir, "image.rgba");
      await this.exec(["-i", inputPath, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", raw], "decodeImageRgba");
      return { width: probe.width, height: probe.height, data: new Uint8Array(await fs.readFile(raw)) };
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Pre-renders the SUBSCRIBE button (pill + label) as a PNG, for renderBrandCard's `buttons`. */
  async renderSubscribeButton(pillPath: string, outputPath: string, label = "SUBSCRIBE"): Promise<void> {
    const textDir = await this.tempDir("subscribe-");
    try {
      const file = path.join(textDir, "label.txt");
      await fs.writeFile(file, label, "utf-8");
      await this.exec(
        [
          "-i",
          pillPath,
          "-vf",
          `drawtext=fontfile='/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf':textfile='${escapeFilterPath(file)}':expansion=none:fontsize=h*0.48:fontcolor=white:x=(w-text_w)/2:y=(h*0.86-text_h)/2`,
          "-frames:v",
          "1",
          outputPath,
        ],
        "renderSubscribeButton"
      );
    } finally {
      await fs.rm(textDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Joins opening card + clip segments + end card into one video:
   *  - clips are concatenated (with their audio) and, when `watermark` is
   *    given, get the channel logo overlaid in a corner - the cards don't;
   *  - the opening hands over to the first clip with a hard-edged shrinking
   *    circle (custom xfade + audio crossfade), like the channel's
   *    existing videos, so the clips start `transitionSec` before the card ends;
   *  - the end card follows with a straight cut.
   * Returns where the clips start in the output (for narration/subtitle offsets).
   */
  async joinWithBranding(
    clipPaths: string[],
    outputPath: string,
    opts: {
      width: number;
      height: number;
      fps: number;
      introPath?: string;
      outroPath?: string;
      transitionSec?: number;
      /** Logo over the clips: centre as fractions of the frame, height as % of the frame height. */
      watermark?: { logoPath: string; centerX: number; centerY: number; sizePct: number; opacity: number };
    }
  ): Promise<{ contentStartSec: number }> {
    if (clipPaths.length === 0) throw new AppError("FFMPEG_ERROR", "joinWithBranding called with no clips.", { retryable: false });
    const { width: W, height: H, fps } = opts;
    const probes = await Promise.all(clipPaths.map((p) => this.probe(p)));
    const introProbe = opts.introPath ? await this.probe(opts.introPath) : null;
    const T = opts.introPath ? Math.min(opts.transitionSec ?? 0.5, Math.max(0, (introProbe?.durationSec ?? 0) - 0.1)) : 0;

    const inputs: string[] = [];
    const filters: string[] = [];
    const norm = (i: number) => `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},settb=AVTB,format=yuv420p`;
    let n = 0;
    const clipLabels: string[] = [];
    probes.forEach((probe, idx) => {
      inputs.push("-i", clipPaths[idx]);
      filters.push(`[${n}:v]${norm(n)}[cv${idx}]`);
      filters.push(probe.hasAudio ? `[${n}:a:0]${AUDIO_FORMAT}[ca${idx}]` : `${SILENT_AUDIO_SOURCE},atrim=0:${probe.durationSec}[ca${idx}]`);
      clipLabels.push(`[cv${idx}][ca${idx}]`);
      n++;
    });
    filters.push(`${clipLabels.join("")}concat=n=${clipPaths.length}:v=1:a=1[content_v][content_a]`);

    let video = "content_v";
    if (opts.watermark) {
      inputs.push("-loop", "1", "-framerate", String(fps), "-i", opts.watermark.logoPath);
      const wmH = Math.max(8, Math.round((H * opts.watermark.sizePct) / 100 / 2) * 2);
      // Centre at (centerX, centerY) of the frame, clamped so the logo always stays fully on screen.
      const cx = Math.max(0, Math.min(1, opts.watermark.centerX));
      const cy = Math.max(0, Math.min(1, opts.watermark.centerY));
      const x = `'max(0,min(W-w,${cx.toFixed(4)}*W-w/2))'`;
      const y = `'max(0,min(H-h,${cy.toFixed(4)}*H-h/2))'`;
      const opacity = Math.max(0, Math.min(1, opts.watermark.opacity));
      filters.push(`[${n}:v]format=rgba,scale=-2:${wmH},colorchannelmixer=aa=${opacity.toFixed(2)}[wm]`);
      filters.push(`[content_v][wm]overlay=x=${x}:y=${y}:shortest=1,format=yuv420p[content_wm]`);
      video = "content_wm";
      n++;
    }
    let audio = "content_a";

    if (opts.introPath && introProbe) {
      inputs.push("-i", opts.introPath);
      filters.push(`[${n}:v]${norm(n)}[iv]`);
      filters.push(`[${n}:a:0]${AUDIO_FORMAT}[ia]`);
      // Hard-edged shrinking circle (the built-in circleclose has a very soft radial edge):
      // inside a radius that goes from the frame's half-diagonal (P=1) to 0 show the opening.
      const circle = `if(lt(hypot(X-W/2\\,Y-H/2)\\,P*hypot(W/2\\,H/2))\\,A\\,B)`;
      filters.push(`[iv][${video}]xfade=transition=custom:expr='${circle}':duration=${T.toFixed(3)}:offset=${(introProbe.durationSec - T).toFixed(3)}[intro_v]`);
      filters.push(`[ia][${audio}]acrossfade=d=${T.toFixed(3)}[intro_a]`);
      video = "intro_v";
      audio = "intro_a";
      n++;
    }
    if (opts.outroPath) {
      inputs.push("-i", opts.outroPath);
      filters.push(`[${n}:v]${norm(n)}[ov]`);
      filters.push(`[${n}:a:0]${AUDIO_FORMAT}[oa]`);
      filters.push(`[${video}][${audio}][ov][oa]concat=n=2:v=1:a=1[final_v][final_a]`);
      video = "final_v";
      audio = "final_a";
      n++;
    }

    await this.exec(
      [...inputs, "-filter_complex", filters.join(";"), "-map", `[${video}]`, "-map", `[${audio}]`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", outputPath],
      "joinWithBranding"
    );
    return { contentStartSec: introProbe ? introProbe.durationSec - T : 0 };
  }

  // ---------------------------------------------------------------------
  // Assembly (spec #23 pipeline)
  // ---------------------------------------------------------------------

  /** Concatenates video clips with their audio (re-encoding each to a common spec first, so mixed sources still work; inputs without audio contribute silence). */
  async concatenateVideos(inputPaths: string[], outputPath: string, opts: { width: number; height: number; fps: number }): Promise<void> {
    if (inputPaths.length === 0) {
      throw new AppError("FFMPEG_ERROR", "concatenateVideos called with no inputs.", { retryable: false });
    }
    if (inputPaths.length === 1) {
      await this.resizeVideo(inputPaths[0], outputPath, opts);
      return;
    }

    const probes = await Promise.all(inputPaths.map((p) => this.probe(p)));
    const filterParts: string[] = [];
    probes.forEach((probe, i) => {
      filterParts.push(
        `[${i}:v]scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease,pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${opts.fps}[v${i}]`
      );
      filterParts.push(probe.hasAudio ? `[${i}:a:0]${AUDIO_FORMAT}[a${i}]` : `${SILENT_AUDIO_SOURCE},atrim=0:${probe.durationSec}[a${i}]`);
    });
    const concatInputs = inputPaths.map((_p, i) => `[v${i}][a${i}]`).join("");
    filterParts.push(`${concatInputs}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`);

    const args: string[] = [];
    for (const p of inputPaths) args.push("-i", p);
    args.push(
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[outv]",
      "-map",
      "[outa]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      outputPath
    );
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
  async addAudio(videoPath: string, audioPath: string, outputPath: string, opts: { delaySec?: number } = {}): Promise<void> {
    const [videoProbe, audioProbe] = await Promise.all([this.probe(videoPath), this.probe(audioPath)]);
    const delaySec = opts.delaySec ?? 0;
    const targetDuration = Math.max(videoProbe.durationSec, audioProbe.durationSec + delaySec);
    const videoPad = Math.max(0, targetDuration - videoProbe.durationSec);

    const filter = [
      videoPad > 0.05 ? `[0:v]tpad=stop_mode=clone:stop_duration=${videoPad}[v]` : `[0:v]null[v]`,
      `[1:a]${delayFilter(delaySec)}apad=whole_dur=${targetDuration}[a]`,
    ].join(";");

    await this.exec(
      ["-i", videoPath, "-i", audioPath, "-filter_complex", filter, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", outputPath],
      "addAudio"
    );
  }

  /**
   * Layers an external audio file (narration, a prepared music bed) on top
   * of the video's EXISTING audio instead of replacing it, so the clips' own
   * sound survives. Summed at unity gain (amix normalize=0) - each input
   * keeps its own level; music volume is set when preparing the music bed.
   * Falls back to addAudio when the video has no audio stream. The shorter
   * side is padded, never truncated (same rule as addAudio). `delaySec`
   * starts the added audio later (e.g. narration after the opening screen).
   */
  async mixAudioIntoVideo(videoPath: string, audioPath: string, outputPath: string, opts: { delaySec?: number } = {}): Promise<void> {
    const [videoProbe, audioProbe] = await Promise.all([this.probe(videoPath), this.probe(audioPath)]);
    if (!videoProbe.hasAudio) {
      await this.addAudio(videoPath, audioPath, outputPath, opts);
      return;
    }
    const delaySec = opts.delaySec ?? 0;
    const targetDuration = Math.max(videoProbe.durationSec, audioProbe.durationSec + delaySec);
    const videoPad = Math.max(0, targetDuration - videoProbe.durationSec);

    const filter = [
      videoPad > 0.05 ? `[0:v]tpad=stop_mode=clone:stop_duration=${videoPad}[v]` : `[0:v]null[v]`,
      `[0:a:0]${AUDIO_FORMAT}[va]`,
      `[1:a:0]${AUDIO_FORMAT},${delayFilter(delaySec)}anull[xa]`,
      `[va][xa]amix=inputs=2:duration=longest:normalize=0:dropout_transition=0,apad=whole_dur=${targetDuration}[a]`,
    ].join(";");

    await this.exec(
      ["-i", videoPath, "-i", audioPath, "-filter_complex", filter, "-map", "[v]", "-map", "[a]", "-t", String(targetDuration), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", outputPath],
      "mixAudioIntoVideo"
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

  /** Mixes narration + background music into one audio track, music at a lower relative volume with fades. */
  async mixAudio(
    narrationPath: string,
    musicPath: string,
    outputPath: string,
    opts: { musicVolume?: number; durationSec: number; fadeInSec?: number; fadeOutSec?: number }
  ): Promise<void> {
    const musicVolume = opts.musicVolume ?? 0.25;
    const fadeIn = opts.fadeInSec ?? 0;
    const fadeOut = opts.fadeOutSec ?? 1.5;
    const fadeStart = Math.max(0, opts.durationSec - fadeOut);
    const fadeInFilter = fadeIn > 0 ? `,afade=t=in:d=${fadeIn}` : "";
    const filter = [
      `[1:a]aloop=loop=-1:size=2e9,atrim=0:${opts.durationSec},volume=${musicVolume}${fadeInFilter},afade=t=out:st=${fadeStart}:d=${fadeOut}[music]`,
      `[0:a][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
    ].join(";");
    await this.exec(
      ["-i", narrationPath, "-i", musicPath, "-filter_complex", filter, "-map", "[aout]", "-c:a", "aac", outputPath],
      "mixAudio"
    );
  }

  /** Loops/trims a music bed to an exact duration with volume + fade in/out - used when there's no narration to mix under. */
  async prepareMusicTrack(
    musicPath: string,
    outputPath: string,
    opts: { durationSec: number; volume?: number; fadeInSec?: number; fadeOutSec?: number }
  ): Promise<void> {
    const volume = opts.volume ?? 1;
    const fadeIn = opts.fadeInSec ?? 0;
    const fadeOut = opts.fadeOutSec ?? 1.5;
    const fadeStart = Math.max(0, opts.durationSec - fadeOut);
    const af = [
      `aloop=loop=-1:size=2e9`,
      `atrim=0:${opts.durationSec}`,
      `volume=${volume}`,
      ...(fadeIn > 0 ? [`afade=t=in:d=${fadeIn}`] : []),
      `afade=t=out:st=${fadeStart}:d=${fadeOut}`,
    ].join(",");
    await this.exec(["-i", musicPath, "-af", af, "-c:a", "aac", outputPath], "prepareMusicTrack");
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

  /** One frame as an image; `fit` letterboxes it into that size (like the render) instead of keeping the source size. */
  async extractFrame(videoPath: string, outputPath: string, timestampSec: number, fit?: { width: number; height: number }): Promise<void> {
    const args = ["-ss", String(timestampSec), "-i", videoPath, "-frames:v", "1"];
    if (fit) args.push("-vf", this.fitFilter("FIT", fit.width, fit.height));
    await this.exec([...args, outputPath], "extractFrame");
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

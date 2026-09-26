import fs from "node:fs/promises";
import path from "node:path";
import type { Channel, Project } from "@prisma/client";
import { ffmpegService } from "../media/ffmpeg/FFmpegService.js";
import { encodePng, removeEdgeBackground, renderPillPng, renderRoundIconPng } from "../media/icons.js";
import { ChannelService } from "./ChannelService.js";
import { RenderPaths } from "./RenderPaths.js";
import { safeProjectPath } from "../utils/paths.js";

export interface RenderManifest {
  /** Where the clips start in the render (opening length minus the transition overlap). */
  introSec: number;
  outroSec: number;
}

export interface BrandCardPlan {
  intro: boolean;
  outro: boolean;
  introSec: number;
  outroSec: number;
  channel: Channel;
}

/** Circle-close hand-over from the opening screen to the first clip. */
export const OPENING_TRANSITION_SEC = 0.5;

async function exists(p: string): Promise<boolean> {
  if (!p) return false;
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opening / end screens and the logo watermark: decides what a project's
 * render gets, renders the cards (FFmpegService.renderBrandCard), and
 * records the timing in a per-render manifest that later pipeline steps
 * (narration, subtitles, validation) offset against.
 */
export class BrandingService {
  static async plan(project: Project): Promise<BrandCardPlan> {
    const channel = await ChannelService.get();
    const configured = ChannelService.isConfigured(channel);
    const intro = configured && project.introEnabled;
    const outro = configured && project.outroEnabled;
    return { intro, outro, introSec: intro ? channel.introDurationSec : 0, outroSec: outro ? channel.outroDurationSec : 0, channel };
  }

  /**
   * SUBSCRIBE / like / share button images. The channel's own uploads are
   * used when present - their white/light background is made transparent
   * once and cached (keyed by the stored file name, which changes on every
   * upload); otherwise the app's built-in buttons (generated once).
   */
  static async buttonAssets(channel: Channel): Promise<{ subscribe: string; like: string; share: string }> {
    const dir = safeProjectPath("_channel", "generated");
    await fs.mkdir(dir, { recursive: true });
    const like = path.join(dir, "like-v1.png");
    const share = path.join(dir, "share-v1.png");
    const pill = path.join(dir, "pill-v1.png");
    const subscribe = path.join(dir, "subscribe-v1.png");

    const custom = async (source: string, fallback: string, build: () => Promise<void>) => {
      if (await exists(source)) {
        const out = path.join(dir, `custom-${path.basename(source, path.extname(source))}.png`);
        if (!(await exists(out))) {
          const { width, height, data } = await ffmpegService.decodeImageRgba(source);
          await fs.writeFile(out, encodePng(width, height, removeEdgeBackground(data, width, height)));
        }
        return out;
      }
      if (!(await exists(fallback))) await build();
      return fallback;
    };

    return {
      like: await custom(channel.likeButtonPath, like, () => fs.writeFile(like, renderRoundIconPng("like"))),
      share: await custom(channel.shareButtonPath, share, () => fs.writeFile(share, renderRoundIconPng("share"))),
      subscribe: await custom(channel.subscribeButtonPath, subscribe, async () => {
        if (!(await exists(pill))) await fs.writeFile(pill, renderPillPng());
        await ffmpegService.renderSubscribeButton(pill, subscribe);
      }),
    };
  }

  /**
   * Renders one card. Opening background: the project's uploaded image, else
   * a blurred frame of `fallbackVideo` (first clip) so a render never fails
   * for lack of an image. End background: white, or the same per-video
   * background when the channel is set to VIDEO.
   */
  static async renderCard(
    project: Project,
    channel: Channel,
    kind: "INTRO" | "OUTRO",
    outputPath: string,
    opts: { width: number; height: number; fallbackVideo?: string; durationSec?: number }
  ): Promise<void> {
    const tempDir = await ffmpegService.tempDir("brand-card-");
    try {
      const useVideoBackground = kind === "INTRO" || channel.endBackground === "VIDEO";
      let backgroundPath: string | undefined;
      let blurBackground = false;
      if (useVideoBackground) {
        if (await exists(project.brandBackgroundPath)) {
          backgroundPath = project.brandBackgroundPath;
        } else if (opts.fallbackVideo && (await exists(opts.fallbackVideo))) {
          backgroundPath = path.join(tempDir, "fallback-bg.png");
          blurBackground = true;
          const probe = await ffmpegService.probe(opts.fallbackVideo);
          await ffmpegService.extractFrame(opts.fallbackVideo, backgroundPath, Math.min(1, probe.durationSec / 2));
        }
      }

      const logo = kind === "OUTRO" && (await exists(channel.endLogoPath)) ? channel.endLogoPath : channel.logoPath;
      const hasLogo = await exists(logo);
      await ffmpegService.renderBrandCard(outputPath, {
        kind,
        width: opts.width,
        height: opts.height,
        fps: project.fps,
        durationSec: opts.durationSec ?? (kind === "INTRO" ? channel.introDurationSec : channel.outroDurationSec),
        backgroundPath,
        blurBackground,
        logoPath: hasLogo ? logo : undefined,
        openingText: channel.openingText,
        // Without a logo, the channel name stands in for it under the opening text.
        title: kind === "INTRO" ? (channel.showTitleOnIntro ? project.title.trim() : !hasLogo ? channel.name.trim() : "") || undefined : undefined,
        fontPath: (await exists(channel.fontPath)) ? channel.fontPath : undefined,
        textColor: channel.textColor,
        buttons: await this.buttonAssets(channel),
        musicPath: (await exists(channel.openingMusicPath)) ? channel.openingMusicPath : undefined,
        musicVolume: channel.musicVolume,
        voicePath: kind === "OUTRO" && (await exists(channel.endAudioPath)) ? channel.endAudioPath : undefined,
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Watermark settings for joinWithBranding, or undefined when off / no logo. */
  static async watermark(channel: Channel) {
    if (!channel.watermarkEnabled || !(await exists(channel.logoPath))) return undefined;
    return {
      logoPath: channel.logoPath,
      centerX: channel.watermarkX,
      centerY: channel.watermarkY,
      sizePct: channel.watermarkSizePct,
      opacity: channel.watermarkOpacity,
    };
  }

  static async writeManifest(projectId: string, manifest: RenderManifest): Promise<void> {
    await fs.writeFile(RenderPaths.manifest(projectId), JSON.stringify(manifest, null, 2), "utf-8");
  }

  /** Opening/end timing of the CURRENT render (zeros if it has none, or predates branding). */
  static async readManifest(projectId: string): Promise<RenderManifest> {
    try {
      const raw = JSON.parse(await fs.readFile(RenderPaths.manifest(projectId), "utf-8"));
      return { introSec: Number(raw.introSec) || 0, outroSec: Number(raw.outroSec) || 0 };
    } catch {
      return { introSec: 0, outroSec: 0 };
    }
  }
}

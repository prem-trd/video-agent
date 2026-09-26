import type { Channel } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../database/prisma.js";
import { safeProjectPath } from "../utils/paths.js";
import { AppError } from "../utils/errors.js";

/** Channel files (logos, music, font) live beside the project directories, in a reserved "_channel" folder under the same storage root. */
const CHANNEL_DIR = "_channel";

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp"];
const AUDIO_EXT = [".mp3", ".wav", ".m4a", ".aac", ".ogg"];

/** Every uploadable channel file: which column it's stored in and what file types it accepts. */
export const CHANNEL_FILES = {
  logo: { column: "logoPath", allowed: IMAGE_EXT, label: "Opening logo" },
  endLogo: { column: "endLogoPath", allowed: IMAGE_EXT, label: "End-screen logo" },
  openingMusic: { column: "openingMusicPath", allowed: AUDIO_EXT, label: "Opening music" },
  endAudio: { column: "endAudioPath", allowed: AUDIO_EXT, label: "End-screen audio" },
  font: { column: "fontPath", allowed: [".ttf", ".otf"], label: "Font" },
  likeButton: { column: "likeButtonPath", allowed: IMAGE_EXT, label: "Like button" },
  shareButton: { column: "shareButtonPath", allowed: IMAGE_EXT, label: "Share button" },
  subscribeButton: { column: "subscribeButtonPath", allowed: IMAGE_EXT, label: "Subscribe button" },
} as const;
export type ChannelFileKind = keyof typeof CHANNEL_FILES;

/** Display name of a stored file: "<kind>-<timestamp>-<name>.ext" -> "<name>.ext". */
function displayName(filePath: string): string {
  return filePath ? path.basename(filePath).replace(/^[a-zA-Z]+-\d+-/, "") : "";
}

export function serializeChannel(c: Channel) {
  return {
    id: c.id,
    name: c.name,
    hasLogo: Boolean(c.logoPath),
    logoName: displayName(c.logoPath) ? path.basename(c.logoPath) : "", // stored name changes on every upload -> cache key
    hasEndLogo: Boolean(c.endLogoPath),
    openingMusicName: displayName(c.openingMusicPath),
    endAudioName: displayName(c.endAudioPath),
    fontName: displayName(c.fontPath),
    hasLikeButton: Boolean(c.likeButtonPath),
    hasShareButton: Boolean(c.shareButtonPath),
    hasSubscribeButton: Boolean(c.subscribeButtonPath),
    textColor: c.textColor,
    openingText: c.openingText,
    introDurationSec: c.introDurationSec,
    outroDurationSec: c.outroDurationSec,
    showTitleOnIntro: c.showTitleOnIntro,
    musicVolume: c.musicVolume,
    endBackground: c.endBackground,
    watermarkEnabled: c.watermarkEnabled,
    watermarkX: c.watermarkX,
    watermarkY: c.watermarkY,
    watermarkSizePct: c.watermarkSizePct,
    watermarkOpacity: c.watermarkOpacity,
    updatedAt: c.updatedAt,
  };
}

export type ChannelPatch = Partial<
  Pick<
    Channel,
    | "name"
    | "textColor"
    | "openingText"
    | "introDurationSec"
    | "outroDurationSec"
    | "showTitleOnIntro"
    | "musicVolume"
    | "endBackground"
    | "watermarkEnabled"
    | "watermarkX"
    | "watermarkY"
    | "watermarkSizePct"
    | "watermarkOpacity"
  >
>;

/**
 * The YouTube channel's branding (single channel for now). get() creates
 * the row on first use, so callers never have to handle "no channel yet".
 */
export class ChannelService {
  static async get(): Promise<Channel> {
    const existing = await prisma.channel.findFirst({ orderBy: { createdAt: "asc" } });
    return existing ?? prisma.channel.create({ data: {} });
  }

  static async update(patch: ChannelPatch): Promise<Channel> {
    const channel = await this.get();
    return prisma.channel.update({ where: { id: channel.id }, data: patch });
  }

  /** True when there's something to brand with - otherwise opening/end screens are skipped. */
  static isConfigured(channel: Channel): boolean {
    return Boolean(channel.name.trim() || channel.logoPath);
  }

  /**
   * Copies a file into channel storage as `kind`, replacing the previous one.
   * `moveSource` deletes the source afterwards (multer temp uploads); an
   * import from the user's own folder leaves it in place. The replaced file
   * is deleted only when it's inside channel storage (and `keepPrevious` isn't set).
   */
  static async storeFile(
    kind: ChannelFileKind,
    sourcePath: string,
    originalName: string,
    opts: { moveSource?: boolean; keepPrevious?: boolean } = { moveSource: true }
  ): Promise<Channel> {
    const spec = CHANNEL_FILES[kind];
    const ext = path.extname(originalName).toLowerCase();
    if (!(spec.allowed as readonly string[]).includes(ext)) {
      if (opts.moveSource) await fs.unlink(sourcePath).catch(() => {});
      throw new AppError("VALIDATION_ERROR", `${spec.label} must be one of: ${spec.allowed.join(", ")}`, { retryable: false });
    }
    const safeBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 60) || kind;
    const dest = safeProjectPath(CHANNEL_DIR, `${kind}-${Date.now()}-${safeBase}${ext}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(sourcePath, dest);
    if (opts.moveSource) await fs.unlink(sourcePath).catch(() => {});

    const channel = await this.get();
    const previous = channel[spec.column];
    const updated = await prisma.channel.update({ where: { id: channel.id }, data: { [spec.column]: dest } });
    if (previous && !opts.keepPrevious && previous.startsWith(path.dirname(dest) + path.sep)) await fs.rm(previous, { force: true }).catch(() => {});
    return updated;
  }

  static async removeFile(kind: ChannelFileKind): Promise<Channel> {
    const spec = CHANNEL_FILES[kind];
    const channel = await this.get();
    const previous = channel[spec.column];
    const updated = await prisma.channel.update({ where: { id: channel.id }, data: { [spec.column]: "" } });
    if (previous) await fs.rm(previous, { force: true }).catch(() => {});
    return updated;
  }

  /** Absolute path of a stored channel file (for serving it back to the UI), or null. */
  static async filePath(kind: ChannelFileKind): Promise<string | null> {
    const channel = await this.get();
    return channel[CHANNEL_FILES[kind].column] || null;
  }
}

import path from "node:path";
import fs from "node:fs/promises";
import { nanoid } from "nanoid";
import { prisma } from "../database/prisma.js";
import { ProjectStorage } from "./ProjectStorage.js";
import { TimelineService } from "./TimelineService.js";
import { ffmpegService } from "../media/ffmpeg/FFmpegService.js";
import { AppError } from "../utils/errors.js";
import type { MediaAssetType } from "../types/project.js";

export interface UploadedFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  path: string; // temp path multer already wrote the bytes to
}

export interface MatchResult {
  sceneNumber: number;
  confidence: "high" | "low";
}

const SUBDIR_BY_TYPE: Record<MediaAssetType, string> = {
  IMAGE: "assets/uploads/images",
  VIDEO: "assets/uploads/videos",
  AUDIO: "assets/uploads/audio",
};

/**
 * Filename -> scene number matcher (spec: "scene-01.mp4", "scene_01.mp4",
 * "01.mp4", "01-scene.mp4" should auto-match, but never blindly trust an
 * ambiguous name). Pure function, no I/O, so it's directly unit-testable.
 */
export function matchFilenameToSceneNumber(filename: string): MatchResult | null {
  const base = path.basename(filename, path.extname(filename)).trim();

  // High confidence: the word "scene" appears right next to the number.
  const nearScene = base.match(/scene[\s_-]*0*(\d+)/i) ?? base.match(/0*(\d+)[\s_-]*scene/i);
  if (nearScene) {
    const n = parseInt(nearScene[1], 10);
    if (Number.isFinite(n) && n > 0) return { sceneNumber: n, confidence: "high" };
  }

  // High confidence: the filename (minus extension) is purely a number, e.g. "01.mp4".
  if (/^0*\d+$/.test(base)) {
    const n = parseInt(base, 10);
    if (Number.isFinite(n) && n > 0) return { sceneNumber: n, confidence: "high" };
  }

  // Low confidence: some other standalone number appears in the name
  // (e.g. "cow_02_final.mp4") - worth suggesting, not worth auto-assigning.
  const anyNumber = base.match(/(?:^|[^0-9])0*(\d{1,3})(?:[^0-9]|$)/);
  if (anyNumber) {
    const n = parseInt(anyNumber[1], 10);
    if (Number.isFinite(n) && n > 0) return { sceneNumber: n, confidence: "low" };
  }

  return null;
}

function classify(mimetype: string): MediaAssetType | null {
  if (mimetype.startsWith("image/")) return "IMAGE";
  if (mimetype.startsWith("video/")) return "VIDEO";
  if (mimetype.startsWith("audio/")) return "AUDIO";
  return null;
}

export class MediaUploadService {
  /**
   * Saves each uploaded file into project storage, probes it, records a
   * MediaAsset row, and attempts an automatic scene match. High-confidence
   * matches are auto-assigned onto the timeline; everything else is left
   * for the user/agent to resolve via match_media_to_scene /
   * assign_media_to_scene.
   */
  static async ingest(projectId: string, files: UploadedFileInput[]) {
    const results: { mediaAsset: unknown; match: MatchResult | null; autoAssigned: boolean }[] = [];

    for (const file of files) {
      const type = classify(file.mimetype);
      if (!type) {
        await fs.unlink(file.path).catch(() => {});
        throw new AppError("VALIDATION_ERROR", `Unsupported file type: ${file.mimetype} (${file.originalname})`, { retryable: false });
      }

      const ext = path.extname(file.originalname) || (type === "IMAGE" ? ".png" : type === "VIDEO" ? ".mp4" : ".m4a");
      const storedName = `${Date.now()}-${nanoid(8)}${ext}`;
      const destRelative = `${SUBDIR_BY_TYPE[type]}/${storedName}`;
      const destAbsolute = ProjectStorage.absolutePath(projectId, destRelative);

      await fs.mkdir(path.dirname(destAbsolute), { recursive: true });
      await fs.copyFile(file.path, destAbsolute);
      await fs.unlink(file.path).catch(() => {});

      const probe = await ffmpegService.probe(destAbsolute);
      const aspectRatio = probe.width && probe.height ? simplifyAspectRatio(probe.width, probe.height) : "";

      const match = type === "AUDIO" ? null : matchFilenameToSceneNumber(file.originalname);

      const mediaAsset = await prisma.mediaAsset.create({
        data: {
          projectId,
          type,
          originalFilename: file.originalname,
          filePath: destAbsolute,
          width: probe.width,
          height: probe.height,
          durationSec: probe.durationSec || undefined,
          aspectRatio,
          sizeBytes: file.size,
          status: probe.exists ? "PROBED" : "INVALID",
          probeMetadata: JSON.stringify(probe),
          matchedSceneNumber: match?.sceneNumber,
        },
      });

      let autoAssigned = false;
      if (match?.confidence === "high" && (type === "IMAGE" || type === "VIDEO")) {
        try {
          await TimelineService.assignToScene(projectId, mediaAsset.id, match.sceneNumber);
          autoAssigned = true;
        } catch {
          // Scene doesn't exist (yet) - leave unmatched for manual assignment.
        }
      }

      results.push({ mediaAsset, match, autoAssigned });
    }

    return results;
  }
}

function simplifyAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height) || 1;
  return `${width / d}:${height / d}`;
}

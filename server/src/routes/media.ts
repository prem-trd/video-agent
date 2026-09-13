import { Router } from "express";
import fs from "node:fs";
import { RenderPaths } from "../services/RenderPaths.js";
import { AssetService } from "../services/AssetService.js";
import { prisma } from "../database/prisma.js";
import { safeProjectPath } from "../utils/paths.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";

const log = childLogger({ module: "media-route" });
export const mediaRouter = Router({ mergeParams: true });

/** The uploaded-media library (spec: media library UI panel). */
mediaRouter.get("/media", async (req, res) => {
  const { id: projectId } = req.params as { id: string };
  const media = await prisma.mediaAsset.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  res.json(media);
});

function sendIfExists(res: import("express").Response, filePath: string, notFoundMessage: string) {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: notFoundMessage, retryable: false } });
    return;
  }
  // res.sendFile supports HTTP Range requests out of the box, which the
  // <video>/<audio> elements need for seeking/scrubbing.
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      const appErr = AppError.from(err, "FILE_ERROR");
      log.error({ err: appErr.toJSON() }, "Failed to send media file");
      res.status(500).json({ error: appErr.toJSON() });
    }
  });
}

/** The best-available render (spec #33 GET /video) - final if present, else the most complete intermediate stage. */
mediaRouter.get("/video", (req, res) => {
  const { id: projectId } = req.params as { id: string };
  const candidates = [RenderPaths.final(projectId), RenderPaths.withMusic(projectId), RenderPaths.withNarration(projectId), RenderPaths.silentVideo(projectId)];
  const existing = candidates.find((p) => fs.existsSync(p));
  if (!existing) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "No rendered video yet - run the assembly pipeline first.", retryable: false } });
    return;
  }
  sendIfExists(res, existing, "Video not found.");
});

/** The most recently generated thumbnail. */
mediaRouter.get("/thumbnail", async (req, res) => {
  const { id: projectId } = req.params as { id: string };
  try {
    const latest = await AssetService.getLatest(projectId, "THUMBNAIL");
    if (!latest) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "No thumbnail generated yet - call create_thumbnail first.", retryable: false } });
      return;
    }
    sendIfExists(res, latest.filePath, "Thumbnail file missing on disk.");
  } catch (err) {
    const appErr = AppError.from(err);
    res.status(500).json({ error: appErr.toJSON() });
  }
});

/**
 * Generic, safety-scoped file server for anything inside a project's
 * storage directory (scene images/videos, narration clips, subtitle
 * files, ...) - the same path-safety guard every tool uses
 * (utils/paths.ts) applies here too, so a request can never escape the
 * project's own directory.
 */
mediaRouter.get("/files/*", (req, res) => {
  const { id: projectId } = req.params as { id: string };
  const relativePath = (req.params as any)[0] as string;

  let absolutePath: string;
  try {
    absolutePath = safeProjectPath(projectId, relativePath);
  } catch (err) {
    const appErr = AppError.from(err, "PATH_SECURITY_ERROR");
    res.status(400).json({ error: appErr.toJSON() });
    return;
  }

  sendIfExists(res, absolutePath, "File not found.");
});

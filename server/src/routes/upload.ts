import { Router } from "express";
import multer from "multer";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { MediaUploadService } from "../services/MediaUploadService.js";
import { ProjectStorage } from "../services/ProjectStorage.js";
import { ffmpegService } from "../media/ffmpeg/FFmpegService.js";
import { prisma } from "../database/prisma.js";
import { RenderPaths } from "../services/RenderPaths.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";

const log = childLogger({ module: "upload-route" });
export const uploadRouter = Router({ mergeParams: true });

// Files land in the OS temp dir first; MediaUploadService copies them into
// the project's own storage directory (via safeProjectPath) and deletes
// the temp copy - the upload itself never writes directly into project
// storage with a client-controlled path.
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

function handleError(err: unknown, res: import("express").Response) {
  const appErr = AppError.from(err);
  log.error({ err: appErr.toJSON() }, "Upload route error");
  const status = appErr.code === "NOT_FOUND" ? 404 : appErr.code === "VALIDATION_ERROR" ? 400 : 500;
  res.status(status).json({ error: appErr.toJSON() });
}

/** Currently active narration/music tracks for this project. */
uploadRouter.get("/audio-tracks", async (req, res) => {
  const { id: projectId } = req.params as { id: string };
  const tracks = await prisma.audioTrack.findMany({ where: { projectId, active: true }, orderBy: { createdAt: "desc" } });
  res.json(tracks);
});

/** Uploads one or more image/video files (spec: single, multiple, mixed). Auto-matches to scenes by filename where confident. */
uploadRouter.post("/upload", upload.array("files", 200), async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new AppError("VALIDATION_ERROR", "No files uploaded - send them as multipart form field 'files'.", { retryable: false });
    }
    const results = await MediaUploadService.ingest(
      projectId,
      files.map((f) => ({ originalname: f.originalname, mimetype: f.mimetype, size: f.size, path: f.path }))
    );
    res.status(201).json({ uploaded: results.length, results });
  } catch (err) {
    handleError(err, res);
  }
});

const AudioKindSchema = z.enum(["NARRATION", "MUSIC"]);

/** Uploads a narration or background music file (no TTS/music generation - the file itself is user-provided). */
uploadRouter.post("/upload-audio", upload.single("file"), async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const kind = AudioKindSchema.parse((req.body as any)?.kind ?? "NARRATION");
    const file = req.file;
    if (!file) throw new AppError("VALIDATION_ERROR", "No file uploaded - send it as multipart form field 'file'.", { retryable: false });

    const ext = path.extname(file.originalname) || ".m4a";
    const destRelative = `assets/audio/${kind.toLowerCase()}-${Date.now()}${ext}`;
    const destAbsolute = ProjectStorage.absolutePath(projectId, destRelative);
    await fs.mkdir(path.dirname(destAbsolute), { recursive: true });
    await fs.copyFile(file.path, destAbsolute);
    await fs.unlink(file.path).catch(() => {});

    const probe = await ffmpegService.probe(destAbsolute);

    await prisma.audioTrack.updateMany({ where: { projectId, kind, active: true }, data: { active: false } });
    const track = await prisma.audioTrack.create({
      data: {
        projectId,
        kind,
        filePath: destAbsolute,
        originalFilename: file.originalname,
        durationSec: probe.durationSec || undefined,
      },
    });

    res.status(201).json(track);
  } catch (err) {
    handleError(err, res);
  }
});

/** Uploads a ready-made .srt subtitle file directly, skipping generate_subtitles. */
uploadRouter.post("/upload-subtitles", upload.single("file"), async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const file = req.file;
    if (!file) throw new AppError("VALIDATION_ERROR", "No file uploaded - send it as multipart form field 'file'.", { retryable: false });

    const destAbsolute = RenderPaths.subtitlesSrt(projectId);
    await fs.mkdir(path.dirname(destAbsolute), { recursive: true });
    await fs.copyFile(file.path, destAbsolute);
    await fs.unlink(file.path).catch(() => {});

    res.status(201).json({ filePath: destAbsolute });
  } catch (err) {
    handleError(err, res);
  }
});

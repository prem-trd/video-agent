import { Router } from "express";
import multer from "multer";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ProjectService, serializeProject } from "../services/ProjectService.js";
import { ProjectStorage } from "../services/ProjectStorage.js";
import { BrandingService } from "../services/BrandingService.js";
import { ChannelService } from "../services/ChannelService.js";
import { TimelineService } from "../services/TimelineService.js";
import { ffmpegService } from "../media/ffmpeg/FFmpegService.js";
import { parseResolution } from "../utils/resolution.js";
import { toolRegistry } from "../tools/index.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";

const log = childLogger({ module: "branding-route" });
/** Per-project opening/end screen: background image, its prompt, and still previews. Mounted at /api/projects/:id/branding. */
export const brandingRouter = Router({ mergeParams: true });
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });

function handleError(err: unknown, res: import("express").Response) {
  const appErr = AppError.from(err);
  log.error({ err: appErr.toJSON() }, "Branding route error");
  const status = appErr.code === "NOT_FOUND" ? 404 : appErr.code === "VALIDATION_ERROR" ? 400 : 500;
  res.status(status).json({ error: appErr.toJSON() });
}

brandingRouter.post("/background", upload.single("file"), async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const file = req.file;
    if (!file) throw new AppError("VALIDATION_ERROR", "No file uploaded - send it as multipart form field 'file'.", { retryable: false });
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      await fs.unlink(file.path).catch(() => {});
      throw new AppError("VALIDATION_ERROR", "Background must be a .png, .jpg or .webp image.", { retryable: false });
    }
    const project = await ProjectService.get(projectId);
    const dest = ProjectStorage.absolutePath(projectId, `assets/branding/background-${Date.now()}${ext}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(file.path, dest);
    await fs.unlink(file.path).catch(() => {});

    const updated = await ProjectService.update(projectId, { brandBackgroundPath: dest } as any);
    if (project.brandBackgroundPath) await fs.rm(project.brandBackgroundPath, { force: true }).catch(() => {});
    res.status(201).json(serializeProject(updated));
  } catch (err) {
    handleError(err, res);
  }
});

brandingRouter.delete("/background", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const project = await ProjectService.get(projectId);
    const updated = await ProjectService.update(projectId, { brandBackgroundPath: "" } as any);
    if (project.brandBackgroundPath) await fs.rm(project.brandBackgroundPath, { force: true }).catch(() => {});
    res.json(serializeProject(updated));
  } catch (err) {
    handleError(err, res);
  }
});

brandingRouter.get("/background", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const project = await ProjectService.get(projectId);
    if (!project.brandBackgroundPath) throw new AppError("NOT_FOUND", "No background uploaded.", { retryable: false });
    res.sendFile(project.brandBackgroundPath, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  } catch (err) {
    handleError(err, res);
  }
});

/** Generates (or regenerates, optionally steered) the background image prompt - same tool the agent uses. */
brandingRouter.post("/background-prompt", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const { guidance } = z.object({ guidance: z.string().optional() }).parse(req.body ?? {});
    const result = await toolRegistry.get("generate_background_prompt").execute({ guidance }, { projectId });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * A plain frame from the first timeline clip (no watermark) - the canvas the
 * UI's drag-and-zoom watermark editor draws the logo over. Falls back to the
 * project's opening background image.
 */
brandingRouter.get("/frame", async (req, res) => {
  const tempDir = await ffmpegService.tempDir("brand-frame-");
  try {
    const { id: projectId } = req.params as { id: string };
    const project = await ProjectService.get(projectId);
    const items = await TimelineService.list(projectId);
    const first = items[0]?.mediaAsset;
    const source = first?.filePath || project.brandBackgroundPath;
    if (!source) throw new AppError("NOT_FOUND", "No clip or background yet.", { retryable: false });

    const { width, height } = parseResolution(project.resolution);
    const pngPath = path.join(tempDir, "frame.png");
    const at = first?.type === "VIDEO" ? Math.min(1, (first.durationSec ?? 2) / 2) : 0;
    // Same fit as the render (letterboxed to the project frame), at a UI-friendly size.
    const w = 960;
    const h = Math.round((960 * height) / width / 2) * 2;
    await ffmpegService.extractFrame(source, pngPath, at, { width: w, height: h });
    res.setHeader("Cache-Control", "no-store");
    res.type("png").send(await fs.readFile(pngPath));
  } catch (err) {
    handleError(err, res);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

/**
 * Still PNG preview of the opening screen, end screen, or the watermark over
 * the first clip, with the current channel settings and background. Falls back to the first/last timeline clip for
 * the background exactly like the real render.
 */
brandingRouter.get("/preview/:kind", async (req, res) => {
  const tempDir = await ffmpegService.tempDir("brand-preview-");
  try {
    const { id: projectId, kind: rawKind } = req.params as { id: string; kind: string };
    const which = z.enum(["intro", "outro", "watermark"]).parse(rawKind);
    const project = await ProjectService.get(projectId);
    const channel = await ChannelService.get();
    if (!ChannelService.isConfigured(channel)) {
      throw new AppError("VALIDATION_ERROR", "Set a channel name or logo in Channel settings first.", { retryable: false });
    }
    const { width, height } = parseResolution(project.resolution);
    const items = await TimelineService.list(projectId);
    const firstVideo = items.find((i) => i.kind === "VIDEO")?.mediaAsset.filePath;
    const pngPath = path.join(tempDir, "preview.png");

    if (which === "watermark") {
      // A frame from the first clip with the watermark exactly as the render will place it.
      const watermark = await BrandingService.watermark(channel);
      if (!watermark) throw new AppError("VALIDATION_ERROR", "The watermark is off, or there's no opening logo.", { retryable: false });
      if (!firstVideo) throw new AppError("VALIDATION_ERROR", "Add a clip to the timeline to preview the watermark.", { retryable: false });
      const clipPath = path.join(tempDir, "clip.mp4");
      const joined = path.join(tempDir, "joined.mp4");
      await ffmpegService.trimVideo(firstVideo, clipPath, { startSec: 0, durationSec: 1.5 });
      await ffmpegService.joinWithBranding([clipPath], joined, { width, height, fps: project.fps, watermark });
      await ffmpegService.extractFrame(joined, pngPath, 1);
    } else {
      // Full-length card, grabbed where the animation has settled (logo in / subscribe popped).
      const kind = which === "intro" ? "INTRO" : "OUTRO";
      const cardPath = path.join(tempDir, "card.mp4");
      await BrandingService.renderCard(project, channel, kind, cardPath, { width, height, fallbackVideo: firstVideo });
      const settled = kind === "INTRO" ? channel.introDurationSec * 0.6 : channel.outroDurationSec * 0.75;
      await ffmpegService.extractFrame(cardPath, pngPath, settled);
    }
    res.setHeader("Cache-Control", "no-store");
    res.type("png").send(await fs.readFile(pngPath));
  } catch (err) {
    handleError(err, res);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});


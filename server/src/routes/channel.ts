import { Router } from "express";
import multer from "multer";
import os from "node:os";
import { z } from "zod";
import { CHANNEL_FILES, ChannelService, serializeChannel, type ChannelFileKind } from "../services/ChannelService.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";

const log = childLogger({ module: "channel-route" });
export const channelRouter = Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 20 * 1024 * 1024 } });

function handleError(err: unknown, res: import("express").Response) {
  const appErr =
    err instanceof z.ZodError
      ? new AppError("VALIDATION_ERROR", err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "), { retryable: false })
      : AppError.from(err);
  log.error({ err: appErr.toJSON() }, "Channel route error");
  res.status(appErr.code === "VALIDATION_ERROR" ? 400 : 500).json({ error: appErr.toJSON() });
}

const PatchChannelSchema = z
  .object({
    name: z.string().max(80).optional(),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #FFFFFF").optional(),
    openingText: z.string().max(40).optional(),
    introDurationSec: z.number().min(2).max(15).optional(),
    // YouTube end-screen elements need the last 5-20 seconds.
    outroDurationSec: z.number().min(5).max(20).optional(),
    showTitleOnIntro: z.boolean().optional(),
    musicVolume: z.number().min(0).max(1).optional(),
    endBackground: z.enum(["WHITE", "VIDEO"]).optional(),
    watermarkEnabled: z.boolean().optional(),
    watermarkX: z.number().min(0).max(1).optional(),
    watermarkY: z.number().min(0).max(1).optional(),
    watermarkSizePct: z.number().min(4).max(30).optional(),
    watermarkOpacity: z.number().min(0.1).max(1).optional(),
  })
  .strict();

channelRouter.get("/", async (_req, res) => {
  try {
    res.json(serializeChannel(await ChannelService.get()));
  } catch (err) {
    handleError(err, res);
  }
});

channelRouter.patch("/", async (req, res) => {
  try {
    res.json(serializeChannel(await ChannelService.update(PatchChannelSchema.parse(req.body))));
  } catch (err) {
    handleError(err, res);
  }
});

for (const kind of Object.keys(CHANNEL_FILES) as ChannelFileKind[]) {
  channelRouter.post(`/files/${kind}`, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) throw new AppError("VALIDATION_ERROR", "No file uploaded - send it as multipart form field 'file'.", { retryable: false });
      res.status(201).json(serializeChannel(await ChannelService.storeFile(kind, req.file.path, req.file.originalname)));
    } catch (err) {
      handleError(err, res);
    }
  });

  channelRouter.delete(`/files/${kind}`, async (_req, res) => {
    try {
      res.json(serializeChannel(await ChannelService.removeFile(kind)));
    } catch (err) {
      handleError(err, res);
    }
  });

  /** Serves the stored file back (logo thumbnails, audio previews in the settings dialog). */
  channelRouter.get(`/files/${kind}`, async (_req, res) => {
    const filePath = await ChannelService.filePath(kind);
    if (!filePath) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: `No ${CHANNEL_FILES[kind].label.toLowerCase()} uploaded.`, retryable: false } });
      return;
    }
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });
}

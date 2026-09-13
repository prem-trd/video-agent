import { Router } from "express";
import { z } from "zod";
import { TimelineService, serializeTimelineItem } from "../services/TimelineService.js";
import { AppError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";
import { looseOptional } from "../utils/zodHelpers.js";

const log = childLogger({ module: "timeline-route" });
export const timelineRouter = Router({ mergeParams: true });

function handleError(err: unknown, res: import("express").Response) {
  const appErr = AppError.from(err);
  log.error({ err: appErr.toJSON() }, "Timeline route error");
  const status = appErr.code === "NOT_FOUND" ? 404 : appErr.code === "VALIDATION_ERROR" ? 400 : 500;
  res.status(status).json({ error: appErr.toJSON() });
}

timelineRouter.get("/", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const items = await TimelineService.list(projectId);
    res.json(items.map((i) => serializeTimelineItem(i as any)));
  } catch (err) {
    handleError(err, res);
  }
});

const AssignSchema = z.object({ mediaId: z.string().min(1), sceneNumber: looseOptional(z.number().int().positive()) }).strict();
timelineRouter.post("/assign", async (req, res) => {
  try {
    const { id: projectId } = req.params as { id: string };
    const body = AssignSchema.parse(req.body);
    const item = body.sceneNumber
      ? await TimelineService.assignToScene(projectId, body.mediaId, body.sceneNumber)
      : await TimelineService.appendUnmatched(projectId, body.mediaId);
    res.status(201).json(serializeTimelineItem(item as any));
  } catch (err) {
    handleError(err, res);
  }
});

const ReplaceSchema = z.object({ newMediaId: z.string().min(1) }).strict();
timelineRouter.post("/:itemId/replace", async (req, res) => {
  try {
    const { id: projectId, itemId } = req.params as { id: string; itemId: string };
    const body = ReplaceSchema.parse(req.body);
    const item = await TimelineService.replace(projectId, itemId, body.newMediaId);
    res.json(serializeTimelineItem(item as any));
  } catch (err) {
    handleError(err, res);
  }
});

const ReorderSchema = z.object({ beforeItemId: looseOptional(z.string()), afterItemId: looseOptional(z.string()) }).strict();
timelineRouter.post("/:itemId/reorder", async (req, res) => {
  try {
    const { id: projectId, itemId } = req.params as { id: string; itemId: string };
    const body = ReorderSchema.parse(req.body);
    await TimelineService.reorder(projectId, itemId, body);
    res.json(await TimelineService.list(projectId).then((items) => items.map((i) => serializeTimelineItem(i as any))));
  } catch (err) {
    handleError(err, res);
  }
});

const PatchItemSchema = z
  .object({
    displayDurationSec: looseOptional(z.number().positive()),
    fitMode: looseOptional(z.enum(["FIT", "CROP", "BLUR_BACKGROUND"])),
    trimStartSec: looseOptional(z.number().min(0)),
    trimEndSec: looseOptional(z.number().min(0)),
  })
  .strict();
timelineRouter.patch("/:itemId", async (req, res) => {
  try {
    const { id: projectId, itemId } = req.params as { id: string; itemId: string };
    const body = PatchItemSchema.parse(req.body);
    if (body.displayDurationSec !== undefined) {
      await TimelineService.setImageDuration(projectId, { itemId }, body.displayDurationSec);
    }
    if (body.fitMode) await TimelineService.setFitMode(projectId, itemId, body.fitMode);
    if (body.trimStartSec !== undefined || body.trimEndSec !== undefined) {
      await TimelineService.setTrim(projectId, itemId, { trimStartSec: body.trimStartSec, trimEndSec: body.trimEndSec });
    }
    const items = await TimelineService.list(projectId);
    res.json(items.find((i) => i.id === itemId) ? serializeTimelineItem(items.find((i) => i.id === itemId) as any) : null);
  } catch (err) {
    handleError(err, res);
  }
});

timelineRouter.delete("/:itemId", async (req, res) => {
  try {
    const { id: projectId, itemId } = req.params as { id: string; itemId: string };
    await TimelineService.remove(projectId, itemId);
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});

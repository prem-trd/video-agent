import { z } from "zod";
import type { Tool } from "../types.js";
import { prisma } from "../../database/prisma.js";
import { TimelineService } from "../../services/TimelineService.js";
import { AppError } from "../../utils/errors.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    timelineItemId: looseOptional(z.string().min(1)),
    sceneNumber: looseOptional(z.number().int().positive()).describe("Remove whatever media is currently assigned to this scene."),
    lastN: looseOptional(z.number().int().positive()).describe("Remove the last N items from the end of the timeline."),
  })
  .strict()
  .refine((v) => v.timelineItemId || v.sceneNumber !== undefined || v.lastN !== undefined, "One of timelineItemId, sceneNumber, or lastN is required.");

/** Removes media from the timeline ("remove scene 12's clip", "remove the last 3 clips"). Soft-delete - kept in history. */
export const removeMediaTool: Tool<z.infer<typeof InputSchema>> = {
  name: "remove_media",
  description: "Remove one or more items from the assembly timeline: by timelineItemId, by sceneNumber (removes whatever's assigned there), or lastN (removes the last N items). The underlying uploaded file stays in the media library.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    if (input.lastN !== undefined) {
      const items = await prisma.timelineItem.findMany({ where: { projectId: ctx.projectId, active: true }, orderBy: { order: "desc" }, take: input.lastN });
      for (const item of items) await TimelineService.remove(ctx.projectId, item.id);
      return { removed: items.length };
    }
    if (input.sceneNumber !== undefined) {
      const scene = await prisma.scene.findUnique({ where: { projectId_sceneNumber: { projectId: ctx.projectId, sceneNumber: input.sceneNumber } } });
      if (!scene) throw new AppError("NOT_FOUND", `Scene #${input.sceneNumber} not found`, { retryable: false });
      const item = await prisma.timelineItem.findFirst({ where: { projectId: ctx.projectId, sceneId: scene.id, active: true } });
      if (!item) return { removed: 0, note: `Scene #${input.sceneNumber} had no assigned media.` };
      await TimelineService.remove(ctx.projectId, item.id);
      return { removed: 1 };
    }
    await TimelineService.remove(ctx.projectId, input.timelineItemId!);
    return { removed: 1 };
  },
};

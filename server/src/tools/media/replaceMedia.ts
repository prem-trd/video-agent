import { z } from "zod";
import type { Tool } from "../types.js";
import { prisma } from "../../database/prisma.js";
import { TimelineService, serializeTimelineItem } from "../../services/TimelineService.js";
import { AppError } from "../../utils/errors.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    newMediaId: z.string().min(1).describe("The newly-uploaded media file to use instead."),
    timelineItemId: looseOptional(z.string().min(1)),
    sceneNumber: looseOptional(z.number().int().positive()).describe("Replace whatever media is currently assigned to this scene."),
  })
  .strict()
  .refine((v) => v.timelineItemId || v.sceneNumber !== undefined, "Either timelineItemId or sceneNumber is required.");

/** Swaps which uploaded file backs a timeline slot ("replace scene 8"). Old file kept in history, deactivated. */
export const replaceMediaTool: Tool<z.infer<typeof InputSchema>> = {
  name: "replace_media",
  description: "Replace the media currently on a timeline slot (by timelineItemId or sceneNumber) with a different uploaded file (newMediaId). Keeps the same position/scene/fit settings.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    let itemId = input.timelineItemId;
    if (!itemId && input.sceneNumber !== undefined) {
      const scene = await prisma.scene.findUnique({ where: { projectId_sceneNumber: { projectId: ctx.projectId, sceneNumber: input.sceneNumber } } });
      if (!scene) throw new AppError("NOT_FOUND", `Scene #${input.sceneNumber} not found`, { retryable: false });
      const item = await prisma.timelineItem.findFirst({ where: { projectId: ctx.projectId, sceneId: scene.id, active: true } });
      if (!item) {
        const created = await TimelineService.assignToScene(ctx.projectId, input.newMediaId, input.sceneNumber);
        return { timelineItem: serializeTimelineItem(created as any) };
      }
      itemId = item.id;
    }
    const updated = await TimelineService.replace(ctx.projectId, itemId!, input.newMediaId);
    return { timelineItem: serializeTimelineItem(updated as any) };
  },
};

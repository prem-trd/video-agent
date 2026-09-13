import { z } from "zod";
import type { Tool } from "../types.js";
import { TimelineService } from "../../services/TimelineService.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    timelineItemId: z.string().min(1),
    beforeItemId: looseOptional(z.string().min(1)),
    afterItemId: looseOptional(z.string().min(1)),
  })
  .strict()
  .refine((v) => v.beforeItemId || v.afterItemId, "Either beforeItemId or afterItemId is required.");

/** Reorders an unmatched/manual timeline item (scene-matched items should be reordered via move_scene instead). */
export const reorderMediaTool: Tool<z.infer<typeof InputSchema>> = {
  name: "reorder_media",
  description: "Move a timeline item immediately before or after another timeline item. For scene-matched clips, prefer move_scene so the scene's prompt stays paired with its position.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    await TimelineService.reorder(ctx.projectId, input.timelineItemId, { beforeItemId: input.beforeItemId, afterItemId: input.afterItemId });
    return { moved: true };
  },
};

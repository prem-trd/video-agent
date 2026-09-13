import { z } from "zod";
import type { Tool } from "../types.js";
import { TimelineService, serializeTimelineItem } from "../../services/TimelineService.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    mediaId: z.string().min(1),
    sceneNumber: looseOptional(z.number().int().positive()).describe("Omit to append the media unassigned to the end of the timeline (pure slideshow use)."),
  })
  .strict();

/** Manually assigns one uploaded media file to a scene ("this clip is scene 8"). Replaces whatever was there before. */
export const assignMediaToSceneTool: Tool<z.infer<typeof InputSchema>> = {
  name: "assign_media_to_scene",
  description: "Assign an uploaded media file (by mediaId) to a specific scene number, or omit sceneNumber to append it unassigned to the end of the timeline. Replaces any media already on that scene (kept as history, not deleted).",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const item = input.sceneNumber
      ? await TimelineService.assignToScene(ctx.projectId, input.mediaId, input.sceneNumber)
      : await TimelineService.appendUnmatched(ctx.projectId, input.mediaId);
    return { timelineItem: serializeTimelineItem(item as any) };
  },
};

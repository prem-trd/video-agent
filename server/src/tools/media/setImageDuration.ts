import { z } from "zod";
import type { Tool } from "../types.js";
import { TimelineService } from "../../services/TimelineService.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    seconds: z.number().positive(),
    timelineItemId: looseOptional(z.string().min(1)),
    all: looseOptional(z.boolean()).describe("Apply to every image on the timeline instead of one ('make every image 4 seconds')."),
  })
  .strict()
  .refine((v) => v.timelineItemId || v.all, "Either timelineItemId or all is required.");

/** Sets how long an image (or every image) stays on screen ("keep this image for 5 seconds", "make every image 4 seconds"). */
export const setImageDurationTool: Tool<z.infer<typeof InputSchema>> = {
  name: "set_image_duration",
  description: "Set the display duration (seconds) for one image timeline item, or every image on the timeline (all:true).",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    if (input.all) {
      await TimelineService.setImageDuration(ctx.projectId, { all: true }, input.seconds);
    } else {
      await TimelineService.setImageDuration(ctx.projectId, { itemId: input.timelineItemId! }, input.seconds);
    }
    return { updated: true };
  },
};

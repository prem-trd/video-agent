import { z } from "zod";
import type { Tool } from "../types.js";
import { TimelineService, serializeTimelineItem } from "../../services/TimelineService.js";

const InputSchema = z.object({}).strict();

/**
 * Recomputes the ordered assembly timeline (compacts ordering, recomputes
 * startTime/endTime from each item's effective duration). Call this after
 * a batch of add/remove/reorder/duration changes to get a clean, current
 * view back before assembling.
 */
export const buildTimelineTool: Tool<z.infer<typeof InputSchema>> = {
  name: "build_timeline",
  description: "Recompute and return the current ordered assembly timeline (positions and start/end times). Call this after making several timeline changes, or before render_timeline to double-check what will be assembled.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const items = await TimelineService.rebuild(ctx.projectId);
    return {
      items: items.map((i) => serializeTimelineItem(i as any)),
      itemCount: items.length,
      totalDurationSec: items[items.length - 1]?.endTime ?? 0,
    };
  },
};

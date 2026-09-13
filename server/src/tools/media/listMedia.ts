import { z } from "zod";
import type { Tool } from "../types.js";
import { prisma } from "../../database/prisma.js";
import { looseOptional, caseInsensitiveEnum } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    type: looseOptional(caseInsensitiveEnum(["IMAGE", "VIDEO", "AUDIO"])),
    unmatchedOnly: looseOptional(z.boolean()).describe("Only list media not yet assigned to a scene/timeline slot."),
  })
  .strict();

/** Lets the agent check what's been uploaded so far, and what still needs matching to a scene. */
export const listMediaTool: Tool<z.infer<typeof InputSchema>> = {
  name: "list_media",
  description: "List uploaded media in this project's library, optionally filtered by type (IMAGE/VIDEO/AUDIO) or unmatchedOnly.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const media = await prisma.mediaAsset.findMany({
      where: { projectId: ctx.projectId, ...(input.type ? { type: input.type } : {}) },
      orderBy: { createdAt: "asc" },
    });
    const timelineItems = await prisma.timelineItem.findMany({ where: { projectId: ctx.projectId, active: true } });
    const matchedIds = new Set(timelineItems.map((t) => t.mediaAssetId));

    const list = media
      .filter((m) => !input.unmatchedOnly || !matchedIds.has(m.id))
      .map((m) => ({
        id: m.id,
        type: m.type,
        originalFilename: m.originalFilename,
        width: m.width,
        height: m.height,
        durationSec: m.durationSec,
        aspectRatio: m.aspectRatio,
        status: m.status,
        matchedSceneNumber: m.matchedSceneNumber,
        assignedToTimeline: matchedIds.has(m.id),
      }));

    return { media: list, count: list.length };
  },
};

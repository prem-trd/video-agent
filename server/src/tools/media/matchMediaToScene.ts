import { z } from "zod";
import type { Tool } from "../types.js";
import { prisma } from "../../database/prisma.js";
import { TimelineService } from "../../services/TimelineService.js";
import { matchFilenameToSceneNumber } from "../../services/MediaUploadService.js";

const InputSchema = z.object({}).strict();

/**
 * Re-attempts filename-based scene matching for every uploaded, unassigned
 * media file (e.g. scenes didn't exist yet at upload time). High-confidence
 * matches are auto-assigned; everything else is returned as a suggestion
 * for the agent to confirm with the user rather than blindly trusting it.
 */
export const matchMediaToSceneTool: Tool<z.infer<typeof InputSchema>> = {
  name: "match_media_to_scene",
  description:
    "Re-run automatic filename-based scene matching for every uploaded media file not yet on the timeline. High-confidence matches (e.g. 'scene-01.mp4') are assigned automatically; ambiguous ones are returned so you can ask the user which scene they belong to.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const media = await prisma.mediaAsset.findMany({ where: { projectId: ctx.projectId, type: { in: ["IMAGE", "VIDEO"] } } });
    const timelineItems = await prisma.timelineItem.findMany({ where: { projectId: ctx.projectId, active: true } });
    const matchedIds = new Set(timelineItems.map((t) => t.mediaAssetId));
    const unmatched = media.filter((m) => !matchedIds.has(m.id));

    const autoAssigned: { mediaId: string; sceneNumber: number }[] = [];
    const ambiguous: { mediaId: string; originalFilename: string; suggestedSceneNumber: number | null }[] = [];

    for (const m of unmatched) {
      const match = matchFilenameToSceneNumber(m.originalFilename);
      if (match?.confidence === "high") {
        try {
          await TimelineService.assignToScene(ctx.projectId, m.id, match.sceneNumber);
          autoAssigned.push({ mediaId: m.id, sceneNumber: match.sceneNumber });
          continue;
        } catch {
          // scene doesn't exist - fall through to ambiguous
        }
      }
      ambiguous.push({ mediaId: m.id, originalFilename: m.originalFilename, suggestedSceneNumber: match?.sceneNumber ?? null });
    }

    return { autoAssigned, ambiguous, ambiguousCount: ambiguous.length };
  },
};

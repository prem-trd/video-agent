import { z } from "zod";
import type { Tool } from "../types.js";
import { prisma } from "../../database/prisma.js";
import { serializeProject, ProjectService } from "../../services/ProjectService.js";
import { serializeScene } from "../../services/SceneService.js";
import { serializeTimelineItem } from "../../services/TimelineService.js";

const InputSchema = z.object({}).strict().describe("No input needed - reads the current project from context.");

/**
 * Lets the agent inspect the full current state of the project it's
 * working on: configuration, scenes/prompts, character + environment
 * bibles, uploaded media library, the assembly timeline, and the latest
 * render - before deciding what to do next.
 */
export const readProjectTool: Tool<z.infer<typeof InputSchema>> = {
  name: "read_project",
  description:
    "Read the full current state of this project: configuration, scenes/prompts, character/environment bibles, uploaded media library, assembly timeline, and latest render. Call this whenever you need up-to-date facts instead of assuming.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const scenes = await prisma.scene.findMany({ where: { projectId: ctx.projectId }, orderBy: { sceneNumber: "asc" } });
    const characters = await prisma.character.findMany({ where: { projectId: ctx.projectId } });
    const environments = await prisma.environment.findMany({ where: { projectId: ctx.projectId } });
    const mediaAssets = await prisma.mediaAsset.findMany({ where: { projectId: ctx.projectId }, orderBy: { createdAt: "asc" } });
    const timelineItems = await prisma.timelineItem.findMany({
      where: { projectId: ctx.projectId, active: true },
      orderBy: { order: "asc" },
      include: { mediaAsset: true, scene: true },
    });
    const audioTracks = await prisma.audioTrack.findMany({ where: { projectId: ctx.projectId, active: true } });
    const latestRender = await prisma.render.findFirst({ where: { projectId: ctx.projectId }, orderBy: { createdAt: "desc" } });

    const unmatchedMedia = mediaAssets.filter(
      (m) => m.type !== "AUDIO" && !timelineItems.some((t) => t.mediaAssetId === m.id)
    );

    return {
      project: serializeProject(project),
      scenes: scenes.map(serializeScene),
      characters,
      environments,
      mediaLibrary: {
        total: mediaAssets.length,
        unmatched: unmatchedMedia.map((m) => ({ id: m.id, type: m.type, originalFilename: m.originalFilename, matchedSceneNumber: m.matchedSceneNumber })),
      },
      timeline: timelineItems.map((t) => serializeTimelineItem(t)),
      audioTracks,
      latestRender,
    };
  },
};

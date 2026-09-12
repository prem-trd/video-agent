import { z } from "zod";
import type { Tool } from "../types.js";
import { prisma } from "../../database/prisma.js";
import { serializeProject, ProjectService } from "../../services/ProjectService.js";

const InputSchema = z.object({}).strict().describe("No input needed - reads the current project from context.");

/**
 * Lets the agent inspect the full current state of the project it's
 * working on (config, scenes, characters) before deciding what to do next.
 */
export const readProjectTool: Tool<z.infer<typeof InputSchema>> = {
  name: "read_project",
  description:
    "Read the full current state of this project: configuration, scenes, and character bible. Call this whenever you need up-to-date facts instead of assuming.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const scenes = await prisma.scene.findMany({
      where: { projectId: ctx.projectId },
      orderBy: { sceneNumber: "asc" },
    });
    const characters = await prisma.character.findMany({ where: { projectId: ctx.projectId } });

    return {
      project: serializeProject(project),
      scenes,
      characters,
    };
  },
};

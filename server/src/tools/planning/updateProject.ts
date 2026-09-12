import { z } from "zod";
import type { Tool } from "../types.js";
import { ProjectService, serializeProject } from "../../services/ProjectService.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    topic: z.string().optional(),
    duration: looseOptional(z.number().int().positive().max(3600)),
    aspectRatio: looseOptional(z.enum(["16:9", "9:16", "1:1"])),
    fps: looseOptional(z.number().int().positive()),
    language: z.string().optional(),
    audience: z.string().optional(),
    style: z.string().optional(),
    videoType: z.string().optional(),
  })
  .strict();

/**
 * Lets the agent update the project's configuration fields in response to
 * user instructions like "make it 45 seconds" or "use a realistic style".
 * Only whitelisted fields can be changed - never arbitrary DB writes.
 */
export const updateProjectTool: Tool<z.infer<typeof InputSchema>> = {
  name: "update_project",
  description:
    "Update this project's configuration (title, description, topic, duration, aspectRatio, fps, language, audience, style, videoType). Only pass the fields that should change.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const project = await ProjectService.update(ctx.projectId, input as any);
    return { project: serializeProject(project) };
  },
};

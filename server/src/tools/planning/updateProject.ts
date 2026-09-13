import { z } from "zod";
import type { Tool } from "../types.js";
import { ProjectService, serializeProject } from "../../services/ProjectService.js";
import { looseOptional, caseInsensitiveEnum } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    topic: z.string().optional(),
    duration: looseOptional(z.number().int().positive()).describe("Target total duration in seconds - no upper limit."),
    mediaType: looseOptional(caseInsensitiveEnum(["VIDEO", "IMAGE"])),
    clipDurationSec: looseOptional(z.number().positive()).describe("Per-clip duration in seconds, when mediaType is VIDEO."),
    imageDurationSec: looseOptional(z.number().positive()).describe("Per-image display duration in seconds, when mediaType is IMAGE."),
    aspectRatio: looseOptional(z.enum(["16:9", "9:16", "1:1", "4:3"])),
    fps: looseOptional(z.number().int().positive()),
    language: z.string().optional(),
    audience: z.string().optional(),
    style: z.string().optional(),
    videoType: z.string().optional(),
    narrationRequired: looseOptional(z.boolean()),
    musicRequired: looseOptional(z.boolean()),
  })
  .strict();

/**
 * Lets the agent update the project's configuration fields in response to
 * user instructions like "make it 5 minutes", "switch to image mode", or
 * "change aspect ratio to 9:16". Only whitelisted fields can be changed -
 * never arbitrary DB writes.
 */
export const updateProjectTool: Tool<z.infer<typeof InputSchema>> = {
  name: "update_project",
  description:
    "Update this project's configuration (title, description, topic, duration, mediaType, clipDurationSec, imageDurationSec, aspectRatio, fps, language, audience, style, videoType, narrationRequired, musicRequired). Only pass the fields that should change.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const project = await ProjectService.update(ctx.projectId, input as any);
    return { project: serializeProject(project) };
  },
};

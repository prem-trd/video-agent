import { z } from "zod";
import type { Tool } from "../types.js";
import { ProjectService } from "../../services/ProjectService.js";
import { ProjectStorage } from "../../services/ProjectStorage.js";

const InputSchema = z
  .object({
    style: z.string().optional(),
    lighting: z.string().optional(),
    camera: z.string().optional(),
    environment: z.string().optional(),
    characterStyle: z.string().optional(),
    colorDirection: z.string().optional(),
    renderingStyle: z.string().optional(),
    textStyle: z.string().optional(),
  })
  .strict();

/**
 * Lets the agent edit the Style Bible (spec #15) in response to
 * instructions like "make it more colorful" or "change the style to
 * realistic" - all future scene/prompt tools pick this up automatically.
 */
export const updateStyleBibleTool: Tool<z.infer<typeof InputSchema>> = {
  name: "update_style_bible",
  description:
    "Update the project's Style Bible (style, lighting, camera, environment, characterStyle, colorDirection, renderingStyle, textStyle). Only pass fields that should change. Does not automatically regenerate existing scene prompts.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    await ProjectService.mergeStyleBible(ctx.projectId, input as any);
    const styleBible = await ProjectService.getStyleBible(ctx.projectId);
    await ProjectStorage.writeJson(ctx.projectId, "style-bible.json", styleBible);
    return { styleBible };
  },
};

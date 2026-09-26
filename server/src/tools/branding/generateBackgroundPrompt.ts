import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { ProjectService } from "../../services/ProjectService.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";

const InputSchema = z
  .object({
    guidance: z.string().optional().describe('Optional user instruction to steer the background, e.g. "sunset over the farm" or "less busy".'),
  })
  .strict();

const OutputSchema = z.object({ prompt: z.string().min(1) });

/**
 * Writes the image prompt for this video's opening/end screen background.
 * The user generates the image externally and uploads it (Generate Full
 * Video -> Opening & End Screen); the channel logo, name and title are
 * overlaid on top at render time, so the image itself must contain NO text
 * and keep its centre calm enough for that overlay to stay legible.
 */
export const generateBackgroundPromptTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_background_prompt",
  description:
    "Generate the image prompt for this video's opening/end screen background (the channel logo, name and video title are overlaid on it at render time). Call once after generate_scene_prompts, or when the user asks to regenerate it. Stores it on the project.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const context = await buildCreativeContext(ctx.projectId);

    const result = await ollamaClient.chatJSON(
      [
        {
          role: "system",
          content:
            "You are a visual director writing ONE text-to-image prompt for a YouTube video's opening and end screen BACKGROUND. " +
            "The channel logo, channel name and video title will be overlaid in the centre and upper part of the frame at render time, so the image must: " +
            "match the video's Style Bible and world exactly; capture the video's subject at a glance; keep the centre and upper-middle area calm, uncluttered and evenly lit (subjects toward the edges/lower third); " +
            "contain absolutely NO text, letters, numbers, logos, watermarks or UI; be a wide establishing composition in the project's aspect ratio. " +
            'Respond with ONLY a JSON object: {"prompt": "..."}.',
        },
        {
          role: "user",
          content: `${context}\n\nVideo title: "${project.title}"\nTopic: "${project.topic}"\nAspect ratio: ${project.aspectRatio} (${project.resolution})${input.guidance ? `\n\nUser guidance: ${input.guidance}` : ""}`,
        },
      ],
      OutputSchema
    );

    await ProjectService.update(ctx.projectId, { brandBackgroundPrompt: result.prompt } as any);
    return { prompt: result.prompt };
  },
};

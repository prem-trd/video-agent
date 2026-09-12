import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { SceneService } from "../../services/SceneService.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";
import { sceneRefFields, requireSceneRef, SCENE_REF_ERROR } from "../sceneRef.js";

const InputSchema = z
  .object({
    ...sceneRefFields,
    guidance: z
      .string()
      .optional()
      .describe('Optional user instruction to steer the regeneration, e.g. "make the alpaca more playful".'),
  })
  .strict()
  .refine(requireSceneRef, SCENE_REF_ERROR);

const OutputSchema = z.object({ visualDescription: z.string(), imagePrompt: z.string() });

/**
 * Regenerates just the visual description + image prompt for ONE scene
 * (spec #16 "regenerate scene", #28 versioning candidate). Used for
 * targeted revisions via chat instead of re-running the whole scene plan.
 */
export const generateVisualPromptTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_visual_prompt",
  description:
    "Regenerate the visual description and image prompt for a single scene (identify it by sceneId or sceneNumber), optionally steered by guidance (e.g. 'make it more colorful'). Leaves every other scene untouched.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const scene = await SceneService.resolve(ctx.projectId, input);
    const context = await buildCreativeContext(ctx.projectId);

    const result = await ollamaClient.chatJSON(
      [
        {
          role: "system",
          content:
            "You are a visual director. Produce a visualDescription (what's on screen) and a detailed, self-contained imagePrompt for an AI image generator, " +
            "incorporating the Style Bible and Character Bible verbatim where relevant. Respond with ONLY a JSON object matching the schema.",
        },
        {
          role: "user",
          content: `${context}\n\nScene #${scene.sceneNumber} narration: "${scene.narration}"\nCurrent imagePrompt: "${scene.imagePrompt || "(none yet)"}"${input.guidance ? `\n\nUser guidance: ${input.guidance}` : ""}`,
        },
      ],
      OutputSchema
    );

    await SceneService.update(ctx.projectId, scene.id, {
      visualDescription: result.visualDescription,
      imagePrompt: result.imagePrompt,
      status: "PLANNED",
    });

    return { sceneNumber: scene.sceneNumber, ...result };
  },
};

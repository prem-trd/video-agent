import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { SceneService } from "../../services/SceneService.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";
import { sceneRefFields, requireSceneRef, SCENE_REF_ERROR } from "../sceneRef.js";

const InputSchema = z
  .object({
    ...sceneRefFields,
    guidance: z.string().optional(),
  })
  .strict()
  .refine(requireSceneRef, SCENE_REF_ERROR);

const OutputSchema = z.object({ videoPrompt: z.string(), animationDirection: z.string(), cameraDirection: z.string() });

/** Regenerates just the video/animation/camera prompt for ONE scene. */
export const generateVideoPromptTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_video_prompt",
  description:
    "Regenerate the video generation prompt, animation direction and camera direction for a single scene (identify it by sceneId or sceneNumber), optionally steered by guidance. Leaves every other scene untouched.",
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
            "You are a motion director. Produce a short videoPrompt describing motion/animation for an AI video generator building on a still frame, " +
            "plus animationDirection and cameraDirection, consistent with the Style Bible. Respond with ONLY a JSON object matching the schema.",
        },
        {
          role: "user",
          content: `${context}\n\nScene #${scene.sceneNumber} narration: "${scene.narration}"\nvisualDescription: "${scene.visualDescription}"\nimagePrompt: "${scene.imagePrompt}"${input.guidance ? `\n\nUser guidance: ${input.guidance}` : ""}`,
        },
      ],
      OutputSchema
    );

    await SceneService.update(ctx.projectId, scene.id, {
      videoPrompt: result.videoPrompt,
      animationDirection: result.animationDirection,
      cameraDirection: result.cameraDirection,
    });

    return { sceneNumber: scene.sceneNumber, ...result };
  },
};

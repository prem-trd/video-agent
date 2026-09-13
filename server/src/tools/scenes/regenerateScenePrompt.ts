import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { ScenePromptSchema } from "../../types/schemas.js";
import { SceneService, serializeScene } from "../../services/SceneService.js";
import { ProjectService } from "../../services/ProjectService.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";
import { sceneRefFields, requireSceneRef, SCENE_REF_ERROR } from "../sceneRef.js";

const InputSchema = z
  .object({
    ...sceneRefFields,
    guidance: z
      .string()
      .optional()
      .describe('Optional user instruction to steer the regeneration, e.g. "make the alpaca more playful" or "regenerate scene 8".'),
  })
  .strict()
  .refine(requireSceneRef, SCENE_REF_ERROR);

const OutputSchema = ScenePromptSchema.omit({ sceneNumber: true });

/**
 * Regenerates the prompt for ONE scene ("regenerate scene 8 prompt"),
 * branching on the project's mediaType. Writes a new PromptVersion (via
 * SceneService.update's snapshot-before-write) rather than losing the
 * prior prompt. Leaves every other scene untouched.
 */
export const regenerateScenePromptTool: Tool<z.infer<typeof InputSchema>> = {
  name: "regenerate_scene_prompt",
  description:
    "Regenerate the image/video prompt (and continuity fields) for a single scene, identified by sceneId or sceneNumber, optionally steered by guidance. Creates a new prompt version instead of discarding the old one. Leaves every other scene untouched.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const scene = await SceneService.resolve(ctx.projectId, input);
    const project = await ProjectService.get(ctx.projectId);
    const context = await buildCreativeContext(ctx.projectId);
    const isImage = project.mediaType === "IMAGE";

    const result = await ollamaClient.chatJSON(
      [
        {
          role: "system",
          content:
            (isImage
              ? "You are a visual director regenerating an IMAGE prompt for one scene."
              : "You are a visual director regenerating a VIDEO CLIP prompt for one scene.") +
            " Produce visualDescription, imagePrompt, videoPrompt (empty if mediaType is IMAGE), animationDirection, cameraDirection, composition, negativeInstructions, continuityNotes, characters, environmentKey, transition, soundEffects - incorporating the Style/Character/Environment Bibles verbatim where relevant. Respond with ONLY a JSON object matching the schema.",
        },
        {
          role: "user",
          content: `${context}\n\nScene #${scene.sceneNumber} (${scene.duration}s) beat: "${scene.visualDescription}"\nCurrent imagePrompt: "${scene.imagePrompt || "(none yet)"}"\nCurrent videoPrompt: "${scene.videoPrompt || "(none yet)"}"${input.guidance ? `\n\nUser guidance: ${input.guidance}` : ""}`,
        },
      ],
      OutputSchema
    );

    const updated = await SceneService.update(ctx.projectId, scene.id, {
      visualDescription: result.visualDescription,
      imagePrompt: result.imagePrompt,
      videoPrompt: result.videoPrompt ?? "",
      animationDirection: result.animationDirection ?? "",
      cameraDirection: result.cameraDirection ?? "",
      composition: result.composition ?? "",
      negativeInstructions: result.negativeInstructions ?? "",
      continuityNotes: result.continuityNotes ?? "",
      characters: result.characters ?? [],
      environmentKey: result.environmentKey ?? "",
      transition: result.transition ?? scene.transition,
      soundEffects: result.soundEffects ?? "",
    } as any);

    return { scene: serializeScene(updated) };
  },
};

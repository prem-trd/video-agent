import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { ScenePromptBatchSchema, type ScenePromptBatch } from "../../types/schemas.js";
import { SceneService } from "../../services/SceneService.js";
import { ProjectService } from "../../services/ProjectService.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";
import { AppError } from "../../utils/errors.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    sceneNumbers: looseOptional(z.array(z.number().int().positive())).describe(
      "Only (re)generate these specific scene numbers. Omit to generate every scene that doesn't have a prompt yet (the normal case after create_story_structure, or after add_scenes)."
    ),
  })
  .strict();

const BATCH_SIZE = 10;

/**
 * Turns each scene's story beat into a full, externally-generator-ready
 * prompt - branches on the project's mediaType: VIDEO scenes get a
 * videoPrompt + animation/camera direction; IMAGE scenes get an
 * imagePrompt + composition/framing. Processes scenes in chunks so a
 * 100+ scene project is still one tool call. Snapshots a PromptVersion (v1)
 * for every scene it writes.
 */
export const generateScenePromptsTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_scene_prompts",
  description:
    "Generate the final image/video prompt (plus visual description, continuity, and mediaType-specific direction) for every scene that doesn't have one yet, or for sceneNumbers if given. Call this after create_story_structure. Branches automatically on the project's mediaType (VIDEO vs IMAGE).",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const allScenes = await SceneService.list(ctx.projectId);
    if (allScenes.length === 0) {
      throw new AppError("VALIDATION_ERROR", "No scenes exist yet - call create_story_structure first.", { retryable: false });
    }

    const targetScenes = input.sceneNumbers
      ? allScenes.filter((s) => input.sceneNumbers!.includes(s.sceneNumber))
      : allScenes.filter((s) => !s.imagePrompt);
    if (targetScenes.length === 0) {
      return { scenesPlanned: 0, note: "Every requested scene already has a prompt." };
    }

    const isImage = project.mediaType === "IMAGE";
    let planned = 0;

    for (let i = 0; i < targetScenes.length; i += BATCH_SIZE) {
      const batch = targetScenes.slice(i, i + BATCH_SIZE);
      const context = await buildCreativeContext(ctx.projectId);
      const sceneList = batch
        .map((s) => `#${s.sceneNumber} (${s.duration}s, ${s.startTime}s-${s.endTime}s): title/beat="${s.onScreenText || s.visualDescription}" narration="${s.narration}"`)
        .join("\n");

      const plan = await ollamaClient.chatJSON<ScenePromptBatch>(
        [
          {
            role: "system",
            content: isImage
              ? "You are a visual director writing IMAGE prompts for scenes that will be generated externally by an AI image tool and uploaded back into this app. " +
                "For EVERY scene listed, produce: visualDescription, imagePrompt (a detailed, self-contained prompt including the Style Bible and relevant Character/Environment Bible descriptions verbatim), " +
                "composition (framing: close-up/wide/rule-of-thirds/etc), negativeInstructions (what to avoid, if useful), continuityNotes (what must match neighboring scenes), " +
                "characters (characterKeys appearing), environmentKey (if any), transition, soundEffects. Leave videoPrompt/animationDirection/cameraDirection empty. " +
                "Keep character/environment appearance IDENTICAL across scenes by reusing Bible descriptions verbatim. Respond with ONLY a JSON object matching the schema."
              : "You are a visual director writing VIDEO CLIP prompts for scenes that will be generated externally by an AI video tool and uploaded back into this app. " +
                "For EVERY scene listed, produce: visualDescription, imagePrompt (a reference-frame prompt including Style Bible + Character/Environment Bible descriptions verbatim), " +
                "videoPrompt (a self-contained motion/animation prompt for an AI video generator, sized for this scene's exact clip duration), animationDirection, cameraDirection, " +
                "composition, negativeInstructions, continuityNotes (what must visually match the previous/next scene - camera continuation, character position, lighting - so consecutive externally-generated clips cut together smoothly), " +
                "characters (characterKeys appearing), environmentKey (if any), transition, soundEffects. " +
                "Keep character/environment appearance IDENTICAL across scenes by reusing Bible descriptions verbatim. Respond with ONLY a JSON object matching the schema.",
          },
          { role: "user", content: `${context}\n\nScenes:\n${sceneList}` },
        ],
        ScenePromptBatchSchema
      );

      await SceneService.applyScenePrompts(ctx.projectId, plan.scenes);
      planned += plan.scenes.length;
    }

    return { scenesPlanned: planned };
  },
};

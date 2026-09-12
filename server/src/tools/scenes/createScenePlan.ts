import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { ScenePlanBatchSchema, type ScenePlanBatch } from "../../types/schemas.js";
import { SceneService } from "../../services/SceneService.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";
import { AppError } from "../../utils/errors.js";

const InputSchema = z.object({}).strict();

/**
 * Scene Planner (spec #16): takes the narration script already stored for
 * this project and enriches every scene with production-level detail -
 * visual description, image/video generation prompts, animation & camera
 * direction, transition, sound effects - consistent with the Style Bible
 * and Character Bible. Scenes remain independently manageable afterwards
 * (individual regeneration is generate_visual_prompt/generate_video_prompt
 * or regenerate_scene, added in a later phase).
 */
export const createScenePlanTool: Tool<z.infer<typeof InputSchema>> = {
  name: "create_scene_plan",
  description:
    "Enrich every scene of this project's script with a visual description, image prompt, video prompt, animation/camera direction, transition and sound effects, consistent with the Style Bible and Character Bible. Call this after generate_script.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const scenes = await SceneService.list(ctx.projectId);
    if (scenes.length === 0) {
      throw new AppError("VALIDATION_ERROR", "No scenes exist yet - call generate_script first.", { retryable: false });
    }

    const context = await buildCreativeContext(ctx.projectId);
    const sceneList = scenes
      .map((s) => `#${s.sceneNumber} (${s.duration}s): narration="${s.narration}" onScreenText="${s.onScreenText}"`)
      .join("\n");

    const plan = await ollamaClient.chatJSON<ScenePlanBatch>(
      [
        {
          role: "system",
          content:
            "You are a visual director turning a narration script into production-ready scenes for an AI image/video generator. " +
            "For EVERY scene listed, produce: visualDescription (what's on screen), imagePrompt (a detailed, self-contained prompt for an AI image generator, including the Style Bible and any relevant Character Bible descriptions verbatim), " +
            "videoPrompt (a short motion/animation prompt for an AI video generator building on the image), animationDirection, cameraDirection, transition (e.g. fade, cut, slide), and soundEffects. " +
            "Keep character appearance IDENTICAL across scenes by reusing the Character Bible descriptions verbatim in imagePrompt. Return one entry per scene, sceneNumber matching exactly. Respond with ONLY a JSON object matching the schema.",
        },
        { role: "user", content: `${context}\n\nScenes:\n${sceneList}` },
      ],
      ScenePlanBatchSchema
    );

    await SceneService.applyScenePlan(ctx.projectId, plan.scenes);

    return { scenesPlanned: plan.scenes.length };
  },
};

import { z } from "zod";
import type { Tool } from "../types.js";
import { SceneService, serializeScene } from "../../services/SceneService.js";
import { sceneRefFields, requireSceneRef, SCENE_REF_ERROR } from "../sceneRef.js";
import { looseOptional, caseInsensitiveEnum } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    ...sceneRefFields,
    narration: z.string().optional(),
    onScreenText: z.string().optional(),
    duration: looseOptional(z.number().positive()),
    visualDescription: z.string().optional(),
    imagePrompt: z.string().optional(),
    videoPrompt: z.string().optional(),
    animationDirection: z.string().optional(),
    cameraDirection: z.string().optional(),
    transition: z.string().optional(),
    soundEffects: z.string().optional(),
    status: looseOptional(caseInsensitiveEnum(["PLANNED", "GENERATING", "READY", "FAILED", "REGENERATING", "APPROVED"])),
  })
  // .strict() rejects any field not listed above with a clear validation
  // error, instead of zod's default of silently stripping it - so if the
  // model tries to sneak an unsupported field through, it gets visible,
  // actionable feedback instead of quietly losing that data.
  .strict()
  .refine(requireSceneRef, SCENE_REF_ERROR);

/**
 * Direct field editor for one scene (spec #16, #25 update_scene) - for
 * small, targeted edits to a single scene. For enriching ALL scenes of a
 * fresh script at once, use create_scene_plan instead (one batched call
 * instead of one per scene).
 */
export const updateSceneTool: Tool<z.infer<typeof InputSchema>> = {
  name: "update_scene",
  description:
    "Directly edit fields of a single scene, identified by sceneId or sceneNumber (narration, onScreenText, duration, visualDescription, imagePrompt, videoPrompt, animationDirection, cameraDirection, transition, soundEffects, status). Only pass fields that should change. For enriching every scene of a brand-new script at once, call create_scene_plan instead - it's one call instead of one per scene.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const { sceneId, sceneNumber, ...patch } = input;
    const existing = await SceneService.resolve(ctx.projectId, { sceneId, sceneNumber });
    const scene = await SceneService.update(ctx.projectId, existing.id, patch as any);
    return { scene: serializeScene(scene) };
  },
};

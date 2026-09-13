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
    composition: z.string().optional(),
    negativeInstructions: z.string().optional(),
    continuityNotes: z.string().optional(),
    characters: z.array(z.string()).optional(),
    environmentKey: z.string().optional(),
    transition: z.string().optional(),
    soundEffects: z.string().optional(),
    status: looseOptional(caseInsensitiveEnum(["PLANNED", "GENERATING", "READY", "FAILED", "REGENERATING", "APPROVED"])),
  })
  // .strict() rejects any field not listed above with a clear validation
  // error, instead of zod's default of silently stripping it.
  .strict()
  .refine(requireSceneRef, SCENE_REF_ERROR);

/**
 * Direct field editor for one scene - for small, targeted edits (e.g.
 * "make scene 4 seven seconds", "change the transition on scene 2"). For
 * generating prompts for every scene at once, use generate_scene_prompts
 * instead. Any prompt-field edit snapshots a PromptVersion first
 * (SceneService.update), so direct edits are recoverable too.
 */
export const updateSceneTool: Tool<z.infer<typeof InputSchema>> = {
  name: "update_scene",
  description:
    "Directly edit fields of a single scene, identified by sceneId or sceneNumber (narration, onScreenText, duration, visualDescription, imagePrompt, videoPrompt, animationDirection, cameraDirection, composition, negativeInstructions, continuityNotes, characters, environmentKey, transition, soundEffects, status). Only pass fields that should change. For generating prompts for every scene of a fresh story structure at once, call generate_scene_prompts instead.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const { sceneId, sceneNumber, ...patch } = input;
    const existing = await SceneService.resolve(ctx.projectId, { sceneId, sceneNumber });
    const scene = await SceneService.update(ctx.projectId, existing.id, patch as any);
    return { scene: serializeScene(scene) };
  },
};

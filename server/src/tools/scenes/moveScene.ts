import { z } from "zod";
import type { Tool } from "../types.js";
import { SceneService, serializeScene } from "../../services/SceneService.js";
import { sceneRefFields, requireSceneRef, SCENE_REF_ERROR } from "../sceneRef.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    ...sceneRefFields,
    beforeSceneNumber: looseOptional(z.number().int().positive()),
    afterSceneNumber: looseOptional(z.number().int().positive()),
  })
  .strict()
  .refine(requireSceneRef, SCENE_REF_ERROR)
  .refine((v) => v.beforeSceneNumber !== undefined || v.afterSceneNumber !== undefined, "Either beforeSceneNumber or afterSceneNumber is required.");

/** Reorders a scene ("move scene 15 before scene 12"). Renumbers/retimes every scene afterwards. */
export const moveSceneTool: Tool<z.infer<typeof InputSchema>> = {
  name: "move_scene",
  description: "Move a scene to immediately before or after another scene, identified by sceneId/sceneNumber plus beforeSceneNumber or afterSceneNumber. Renumbers/retimes every scene afterwards.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const scene = await SceneService.resolve(ctx.projectId, input);
    await SceneService.move(ctx.projectId, scene.id, { beforeSceneNumber: input.beforeSceneNumber, afterSceneNumber: input.afterSceneNumber });
    const updated = await SceneService.get(ctx.projectId, scene.id);
    return { scene: serializeScene(updated) };
  },
};

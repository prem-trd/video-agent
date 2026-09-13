import { z } from "zod";
import type { Tool } from "../types.js";
import { SceneService } from "../../services/SceneService.js";
import { prisma } from "../../database/prisma.js";
import { sceneRefFields, requireSceneRef, SCENE_REF_ERROR } from "../sceneRef.js";

const InputSchema = z.object({ ...sceneRefFields }).strict().refine(requireSceneRef, SCENE_REF_ERROR);

/**
 * Removes a scene ("remove scene 12"). Any timeline item matched to it is
 * unassigned (kept in the media library, not deleted) rather than lost.
 * Remaining scenes are renumbered and retimed automatically.
 */
export const removeSceneTool: Tool<z.infer<typeof InputSchema>> = {
  name: "remove_scene",
  description: "Remove a scene, identified by sceneId or sceneNumber. Remaining scenes are renumbered/retimed. Any uploaded media matched to it is unassigned, not deleted.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const scene = await SceneService.resolve(ctx.projectId, input);
    const removedSceneNumber = scene.sceneNumber;

    await prisma.timelineItem.updateMany({ where: { projectId: ctx.projectId, sceneId: scene.id, active: true }, data: { active: false } });
    await SceneService.remove(ctx.projectId, scene.id);

    return { removedSceneNumber };
  },
};

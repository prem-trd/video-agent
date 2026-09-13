import type { Scene, PromptVersion } from "@prisma/client";
import { prisma } from "../database/prisma.js";
import { AppError } from "../utils/errors.js";
import { PROMPT_FIELDS } from "../types/promptFields.js";

export function serializePromptVersion(v: PromptVersion) {
  return {
    id: v.id,
    projectId: v.projectId,
    sceneId: v.sceneId,
    version: v.version,
    visualDescription: v.visualDescription,
    imagePrompt: v.imagePrompt,
    videoPrompt: v.videoPrompt,
    animationDirection: v.animationDirection,
    cameraDirection: v.cameraDirection,
    composition: v.composition,
    negativeInstructions: v.negativeInstructions,
    continuityNotes: v.continuityNotes,
    isActive: v.isActive,
    createdAt: v.createdAt,
  };
}

/**
 * History for a scene's prompt fields (spec: "Scene 05 v1/v2/v3"). Mirrors
 * how AssetService versions generated media, but for prompt text: every
 * write to a scene's prompt fields snapshots the PRE-write state as a new
 * version first, so nothing is ever silently lost, and a version can be
 * restored later.
 */
export class PromptVersionService {
  static async snapshot(projectId: string, scene: Scene): Promise<PromptVersion> {
    const count = await prisma.promptVersion.count({ where: { sceneId: scene.id } });
    await prisma.promptVersion.updateMany({ where: { sceneId: scene.id }, data: { isActive: false } });
    return prisma.promptVersion.create({
      data: {
        projectId,
        sceneId: scene.id,
        version: count + 1,
        visualDescription: scene.visualDescription,
        imagePrompt: scene.imagePrompt,
        videoPrompt: scene.videoPrompt,
        animationDirection: scene.animationDirection,
        cameraDirection: scene.cameraDirection,
        composition: scene.composition,
        negativeInstructions: scene.negativeInstructions,
        continuityNotes: scene.continuityNotes,
        isActive: false, // this snapshot represents what the scene looked like BEFORE the change that triggered it
      },
    });
  }

  static async listForScene(projectId: string, sceneId: string) {
    return prisma.promptVersion.findMany({ where: { projectId, sceneId }, orderBy: { version: "asc" } });
  }

  /** Restores a scene's prompt fields from a chosen historical version, snapshotting the current state first. */
  static async activate(projectId: string, sceneId: string, versionId: string) {
    const version = await prisma.promptVersion.findFirst({ where: { id: versionId, projectId, sceneId } });
    if (!version) {
      throw new AppError("NOT_FOUND", `Prompt version ${versionId} not found for scene ${sceneId}`, { retryable: false });
    }
    const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
    if (!scene) throw new AppError("NOT_FOUND", `Scene ${sceneId} not found`, { retryable: false });

    await this.snapshot(projectId, scene);
    await prisma.promptVersion.updateMany({ where: { sceneId }, data: { isActive: false } });
    await prisma.promptVersion.update({ where: { id: version.id }, data: { isActive: true } });

    const updated = await prisma.scene.update({
      where: { id: sceneId },
      data: Object.fromEntries(PROMPT_FIELDS.map((f) => [f, (version as any)[f] ?? ""])),
    });
    return updated;
  }
}

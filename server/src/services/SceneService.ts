import type { Scene } from "@prisma/client";
import { prisma } from "../database/prisma.js";
import { ProjectStorage } from "./ProjectStorage.js";
import { AppError } from "../utils/errors.js";
import type { SceneNarration, ScenePlan } from "../types/schemas.js";

export function serializeScene(s: Scene) {
  return {
    id: s.id,
    projectId: s.projectId,
    sceneNumber: s.sceneNumber,
    duration: s.duration,
    narration: s.narration,
    onScreenText: s.onScreenText,
    visualDescription: s.visualDescription,
    imagePrompt: s.imagePrompt,
    videoPrompt: s.videoPrompt,
    animationDirection: s.animationDirection,
    cameraDirection: s.cameraDirection,
    transition: s.transition,
    soundEffects: s.soundEffects,
    status: s.status,
    activeAssetId: s.activeAssetId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

async function persistScenesJson(projectId: string): Promise<void> {
  const scenes = await prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } });
  await ProjectStorage.writeJson(projectId, "scenes/scenes.json", scenes.map(serializeScene));
}

export class SceneService {
  static async list(projectId: string) {
    return prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } });
  }

  static async get(projectId: string, sceneId: string) {
    const scene = await prisma.scene.findFirst({ where: { id: sceneId, projectId } });
    if (!scene) throw new AppError("NOT_FOUND", `Scene ${sceneId} not found in project ${projectId}`, { retryable: false });
    return scene;
  }

  static async getByNumber(projectId: string, sceneNumber: number) {
    const scene = await prisma.scene.findUnique({ where: { projectId_sceneNumber: { projectId, sceneNumber } } });
    if (!scene) throw new AppError("NOT_FOUND", `Scene #${sceneNumber} not found in project ${projectId}`, { retryable: false });
    return scene;
  }

  /** Resolves a scene by either its id or its sceneNumber - whichever the caller has on hand. */
  static async resolve(projectId: string, ref: { sceneId?: string; sceneNumber?: number }) {
    if (ref.sceneId) return this.get(projectId, ref.sceneId);
    if (ref.sceneNumber !== undefined) return this.getByNumber(projectId, ref.sceneNumber);
    throw new AppError("VALIDATION_ERROR", "Either sceneId or sceneNumber is required.", { retryable: false });
  }

  /** Replaces the narration-level script: upserts one row per scene, keyed by sceneNumber. */
  static async applyScript(projectId: string, scenes: SceneNarration[]): Promise<void> {
    for (const s of scenes) {
      await prisma.scene.upsert({
        where: { projectId_sceneNumber: { projectId, sceneNumber: s.sceneNumber } },
        create: {
          projectId,
          sceneNumber: s.sceneNumber,
          duration: s.duration,
          narration: s.narration,
          onScreenText: s.onScreenText ?? "",
          status: "PLANNED",
        },
        update: {
          duration: s.duration,
          narration: s.narration,
          onScreenText: s.onScreenText ?? "",
        },
      });
    }
    await ProjectStorage.writeJson(
      projectId,
      "script/script.json",
      scenes.map((s) => ({ ...s }))
    );
    await persistScenesJson(projectId);
  }

  /** Enriches existing scenes with production-level fields (prompts, direction, transitions). */
  static async applyScenePlan(projectId: string, scenes: ScenePlan[]): Promise<void> {
    for (const s of scenes) {
      await prisma.scene.update({
        where: { projectId_sceneNumber: { projectId, sceneNumber: s.sceneNumber } },
        data: {
          visualDescription: s.visualDescription,
          imagePrompt: s.imagePrompt,
          videoPrompt: s.videoPrompt,
          animationDirection: s.animationDirection ?? "",
          cameraDirection: s.cameraDirection ?? "",
          transition: s.transition ?? "fade",
          soundEffects: s.soundEffects ?? "",
        },
      });
    }
    await persistScenesJson(projectId);
  }

  static async update(projectId: string, sceneId: string, patch: Partial<Scene>): Promise<Scene> {
    await this.get(projectId, sceneId); // 404s if missing/wrong project
    const { id: _id, projectId: _pid, sceneNumber: _sn, ...safePatch } = patch as any;
    const scene = await prisma.scene.update({ where: { id: sceneId }, data: safePatch });
    await persistScenesJson(projectId);
    return scene;
  }
}

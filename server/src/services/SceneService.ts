import type { Scene } from "@prisma/client";
import { prisma } from "../database/prisma.js";
import { ProjectStorage } from "./ProjectStorage.js";
import { PromptVersionService } from "./PromptVersionService.js";
import { AppError } from "../utils/errors.js";
import type { SceneBeat, ScenePrompt } from "../types/schemas.js";
import { PROMPT_FIELDS } from "../types/promptFields.js";

export function serializeScene(s: Scene) {
  return {
    id: s.id,
    projectId: s.projectId,
    sceneNumber: s.sceneNumber,
    duration: s.duration,
    startTime: s.startTime,
    endTime: s.endTime,
    narration: s.narration,
    onScreenText: s.onScreenText,
    visualDescription: s.visualDescription,
    imagePrompt: s.imagePrompt,
    videoPrompt: s.videoPrompt,
    animationDirection: s.animationDirection,
    cameraDirection: s.cameraDirection,
    composition: s.composition,
    negativeInstructions: s.negativeInstructions,
    continuityNotes: s.continuityNotes,
    characters: safeParseArray(s.characters),
    environmentKey: s.environmentKey,
    transition: s.transition,
    soundEffects: s.soundEffects,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function safeParseArray(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function persistScenesJson(projectId: string): Promise<void> {
  const scenes = await prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } });
  await ProjectStorage.writeJson(projectId, "scenes/scenes.json", scenes.map(serializeScene));
}

/** Renumbers every scene sequentially from 1 and recomputes startTime/endTime from each scene's own duration. */
async function renumberAndRetime(projectId: string): Promise<void> {
  const scenes = await prisma.scene.findMany({ where: { projectId }, orderBy: [{ sceneNumber: "asc" }, { createdAt: "asc" }] });
  let cursor = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const sceneNumber = i + 1;
    const startTime = cursor;
    const endTime = cursor + s.duration;
    cursor = endTime;
    if (s.sceneNumber !== sceneNumber || s.startTime !== startTime || s.endTime !== endTime) {
      await prisma.scene.update({ where: { id: s.id }, data: { sceneNumber, startTime, endTime } });
    }
  }
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

  /**
   * Replaces the story structure: upserts one row per scene, keyed by
   * sceneNumber, with deterministic timing (computed by the caller - see
   * tools/planning/createStoryStructure.ts - never invented by the LLM).
   */
  static async applyStoryStructure(
    projectId: string,
    beats: (SceneBeat & { duration: number; startTime: number; endTime: number })[]
  ): Promise<void> {
    for (const s of beats) {
      await prisma.scene.upsert({
        where: { projectId_sceneNumber: { projectId, sceneNumber: s.sceneNumber } },
        create: {
          projectId,
          sceneNumber: s.sceneNumber,
          duration: s.duration,
          startTime: s.startTime,
          endTime: s.endTime,
          narration: s.narration ?? "",
          onScreenText: s.onScreenText ?? s.title ?? "",
          visualDescription: s.summary ?? "",
          status: "PLANNED",
        },
        update: {
          duration: s.duration,
          startTime: s.startTime,
          endTime: s.endTime,
          narration: s.narration ?? "",
          onScreenText: s.onScreenText ?? s.title ?? "",
          visualDescription: s.summary ?? "",
        },
      });
    }
    await ProjectStorage.writeJson(projectId, "script/story-structure.json", beats);
    await persistScenesJson(projectId);
  }

  /** Enriches existing scenes with production-level prompt fields, snapshotting a PromptVersion first. */
  static async applyScenePrompts(projectId: string, scenes: ScenePrompt[]): Promise<void> {
    for (const s of scenes) {
      const existing = await prisma.scene.findUnique({ where: { projectId_sceneNumber: { projectId, sceneNumber: s.sceneNumber } } });
      if (!existing) continue;
      await PromptVersionService.snapshot(projectId, existing);
      await prisma.scene.update({
        where: { id: existing.id },
        data: {
          visualDescription: s.visualDescription,
          imagePrompt: s.imagePrompt,
          videoPrompt: s.videoPrompt ?? "",
          animationDirection: s.animationDirection ?? "",
          cameraDirection: s.cameraDirection ?? "",
          composition: s.composition ?? "",
          negativeInstructions: s.negativeInstructions ?? "",
          continuityNotes: s.continuityNotes ?? "",
          characters: JSON.stringify(s.characters ?? []),
          environmentKey: s.environmentKey ?? "",
          transition: s.transition ?? "fade",
          soundEffects: s.soundEffects ?? "",
          status: "PLANNED",
        },
      });
    }
    await persistScenesJson(projectId);
  }

  static async update(projectId: string, sceneId: string, patch: Partial<Scene> & { characters?: string[] }): Promise<Scene> {
    const existing = await this.get(projectId, sceneId); // 404s if missing/wrong project
    const { id: _id, projectId: _pid, sceneNumber: _sn, characters, ...rest } = patch as any;

    const touchesPromptField = PROMPT_FIELDS.some((f) => f in rest);
    if (touchesPromptField) {
      await PromptVersionService.snapshot(projectId, existing);
    }

    const data: Record<string, unknown> = { ...rest };
    if (characters) data.characters = JSON.stringify(characters);

    const scene = await prisma.scene.update({ where: { id: sceneId }, data });
    await persistScenesJson(projectId);
    return scene;
  }

  /** Appends new scenes after the current last one, extending total duration. Timing/numbering is recomputed after. */
  static async appendScenes(
    projectId: string,
    beats: (SceneBeat & { duration: number })[]
  ): Promise<void> {
    const existing = await prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "desc" }, take: 1 });
    let nextNumber = (existing[0]?.sceneNumber ?? 0) + 1;
    for (const b of beats) {
      await prisma.scene.create({
        data: {
          projectId,
          sceneNumber: nextNumber++,
          duration: b.duration,
          narration: b.narration ?? "",
          onScreenText: b.onScreenText ?? b.title ?? "",
          visualDescription: b.summary ?? "",
          status: "PLANNED",
        },
      });
    }
    await renumberAndRetime(projectId);
    await persistScenesJson(projectId);
  }

  /** Removes a scene and renumbers/retimes the rest. Any timeline items matched to it are unassigned, not deleted, by the caller. */
  static async remove(projectId: string, sceneId: string): Promise<void> {
    await this.get(projectId, sceneId);
    await prisma.scene.delete({ where: { id: sceneId } });
    await renumberAndRetime(projectId);
    await persistScenesJson(projectId);
  }

  /** Moves a scene to immediately before/after another scene, renumbering and retiming everything. */
  static async move(projectId: string, sceneId: string, ref: { beforeSceneNumber?: number; afterSceneNumber?: number }): Promise<void> {
    const scene = await this.get(projectId, sceneId);
    const all = await prisma.scene.findMany({ where: { projectId }, orderBy: { sceneNumber: "asc" } });
    const others = all.filter((s) => s.id !== scene.id);

    let insertAt = others.length;
    if (ref.beforeSceneNumber !== undefined) {
      const idx = others.findIndex((s) => s.sceneNumber === ref.beforeSceneNumber);
      if (idx === -1) throw new AppError("NOT_FOUND", `Scene #${ref.beforeSceneNumber} not found.`, { retryable: false });
      insertAt = idx;
    } else if (ref.afterSceneNumber !== undefined) {
      const idx = others.findIndex((s) => s.sceneNumber === ref.afterSceneNumber);
      if (idx === -1) throw new AppError("NOT_FOUND", `Scene #${ref.afterSceneNumber} not found.`, { retryable: false });
      insertAt = idx + 1;
    } else {
      throw new AppError("VALIDATION_ERROR", "Either beforeSceneNumber or afterSceneNumber is required.", { retryable: false });
    }

    const reordered = [...others.slice(0, insertAt), scene, ...others.slice(insertAt)];
    // Temporarily push every sceneNumber into an unused high range first so
    // the (projectId, sceneNumber) unique constraint never collides mid-loop.
    const offset = 1_000_000;
    for (let i = 0; i < reordered.length; i++) {
      await prisma.scene.update({ where: { id: reordered[i].id }, data: { sceneNumber: offset + i } });
    }
    for (let i = 0; i < reordered.length; i++) {
      await prisma.scene.update({ where: { id: reordered[i].id }, data: { sceneNumber: i + 1 } });
    }
    await renumberAndRetime(projectId);
    await persistScenesJson(projectId);
  }
}

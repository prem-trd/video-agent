import type { TimelineItem, MediaAsset, Scene } from "@prisma/client";
import { prisma } from "../database/prisma.js";
import { ProjectService } from "./ProjectService.js";
import { AppError } from "../utils/errors.js";
import type { FitMode } from "../types/project.js";

export function serializeTimelineItem(item: TimelineItem & { mediaAsset?: MediaAsset; scene?: Scene | null }) {
  return {
    id: item.id,
    projectId: item.projectId,
    mediaAssetId: item.mediaAssetId,
    sceneId: item.sceneId,
    sceneNumber: item.scene?.sceneNumber ?? null,
    kind: item.kind,
    order: item.order,
    displayDurationSec: item.displayDurationSec,
    trimStartSec: item.trimStartSec,
    trimEndSec: item.trimEndSec,
    fitMode: item.fitMode,
    transition: item.transition,
    startTime: item.startTime,
    endTime: item.endTime,
    active: item.active,
    mediaAsset: item.mediaAsset
      ? {
          id: item.mediaAsset.id,
          type: item.mediaAsset.type,
          originalFilename: item.mediaAsset.originalFilename,
          filePath: item.mediaAsset.filePath,
          width: item.mediaAsset.width,
          height: item.mediaAsset.height,
          durationSec: item.mediaAsset.durationSec,
          aspectRatio: item.mediaAsset.aspectRatio,
        }
      : undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

const INCLUDE = { mediaAsset: true, scene: true } as const;

/** Effective on-screen duration of a timeline item, used to compute startTime/endTime. */
function effectiveDuration(item: TimelineItem & { mediaAsset: MediaAsset }, fallbackClipDurationSec: number): number {
  if (item.kind === "IMAGE") return item.displayDurationSec ?? fallbackClipDurationSec;
  const trimStart = item.trimStartSec ?? 0;
  const trimEnd = item.trimEndSec ?? item.mediaAsset.durationSec ?? fallbackClipDurationSec;
  const trimmed = trimEnd - trimStart;
  return trimmed > 0 ? trimmed : item.mediaAsset.durationSec ?? fallbackClipDurationSec;
}

export class TimelineService {
  static async list(projectId: string) {
    const items = await prisma.timelineItem.findMany({
      where: { projectId, active: true },
      orderBy: { order: "asc" },
      include: INCLUDE,
    });
    return items;
  }

  /** Recomputes order (compacted, 1..N) and startTime/endTime for every active item, in their current relative order. */
  static async rebuild(projectId: string) {
    const project = await ProjectService.get(projectId);
    const items = await prisma.timelineItem.findMany({
      where: { projectId, active: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: INCLUDE,
    });

    let cursor = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const duration = effectiveDuration(item as any, project.clipDurationSec);
      const startTime = cursor;
      const endTime = cursor + duration;
      cursor = endTime;
      await prisma.timelineItem.update({ where: { id: item.id }, data: { order: i + 1, startTime, endTime } });
    }

    return this.list(projectId);
  }

  /** Assigns an uploaded MediaAsset to a specific scene number, replacing whatever was there before (kept as inactive history). */
  static async assignToScene(projectId: string, mediaAssetId: string, sceneNumber: number) {
    const [mediaAsset, scene] = await Promise.all([
      prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, projectId } }),
      prisma.scene.findUnique({ where: { projectId_sceneNumber: { projectId, sceneNumber } } }),
    ]);
    if (!mediaAsset) throw new AppError("NOT_FOUND", `Media asset ${mediaAssetId} not found`, { retryable: false });
    if (!scene) throw new AppError("NOT_FOUND", `Scene #${sceneNumber} not found - generate scene prompts first.`, { retryable: false });
    if (mediaAsset.type === "AUDIO") {
      throw new AppError("VALIDATION_ERROR", "Audio files go on a project's narration/music track, not the visual timeline.", { retryable: false });
    }

    const project = await ProjectService.get(projectId);
    const existing = await prisma.timelineItem.findFirst({ where: { projectId, sceneId: scene.id, active: true } });
    if (existing) {
      await prisma.timelineItem.update({ where: { id: existing.id }, data: { active: false } });
    }

    const item = await prisma.timelineItem.create({
      data: {
        projectId,
        mediaAssetId,
        sceneId: scene.id,
        kind: mediaAsset.type as "IMAGE" | "VIDEO",
        order: existing?.order ?? scene.sceneNumber,
        displayDurationSec: mediaAsset.type === "IMAGE" ? project.imageDurationSec : null,
        fitMode: existing?.fitMode ?? "FIT",
      },
    });
    await this.rebuild(projectId);
    return prisma.timelineItem.findUniqueOrThrow({ where: { id: item.id }, include: INCLUDE });
  }

  /** Adds an uploaded MediaAsset to the end of the timeline without tying it to any scene (pure slideshow/manual assembly use). */
  static async appendUnmatched(projectId: string, mediaAssetId: string) {
    const mediaAsset = await prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, projectId } });
    if (!mediaAsset) throw new AppError("NOT_FOUND", `Media asset ${mediaAssetId} not found`, { retryable: false });
    if (mediaAsset.type === "AUDIO") {
      throw new AppError("VALIDATION_ERROR", "Audio files go on a project's narration/music track, not the visual timeline.", { retryable: false });
    }
    const project = await ProjectService.get(projectId);
    const maxOrder = await prisma.timelineItem.aggregate({ where: { projectId, active: true }, _max: { order: true } });

    const item = await prisma.timelineItem.create({
      data: {
        projectId,
        mediaAssetId,
        kind: mediaAsset.type as "IMAGE" | "VIDEO",
        order: (maxOrder._max.order ?? 0) + 1,
        displayDurationSec: mediaAsset.type === "IMAGE" ? project.imageDurationSec : null,
      },
    });
    await this.rebuild(projectId);
    return prisma.timelineItem.findUniqueOrThrow({ where: { id: item.id }, include: INCLUDE });
  }

  static async remove(projectId: string, itemId: string) {
    const item = await prisma.timelineItem.findFirst({ where: { id: itemId, projectId } });
    if (!item) throw new AppError("NOT_FOUND", `Timeline item ${itemId} not found`, { retryable: false });
    await prisma.timelineItem.update({ where: { id: itemId }, data: { active: false } });
    await this.rebuild(projectId);
  }

  /** Replaces which MediaAsset backs a timeline slot, keeping its position/scene/fit settings. Old item kept, deactivated. */
  static async replace(projectId: string, itemId: string, newMediaAssetId: string) {
    const item = await prisma.timelineItem.findFirst({ where: { id: itemId, projectId } });
    if (!item) throw new AppError("NOT_FOUND", `Timeline item ${itemId} not found`, { retryable: false });
    const newMedia = await prisma.mediaAsset.findFirst({ where: { id: newMediaAssetId, projectId } });
    if (!newMedia) throw new AppError("NOT_FOUND", `Media asset ${newMediaAssetId} not found`, { retryable: false });

    await prisma.timelineItem.update({ where: { id: itemId }, data: { active: false } });
    const project = await ProjectService.get(projectId);
    const created = await prisma.timelineItem.create({
      data: {
        projectId,
        mediaAssetId: newMediaAssetId,
        sceneId: item.sceneId,
        kind: newMedia.type as "IMAGE" | "VIDEO",
        order: item.order,
        displayDurationSec: newMedia.type === "IMAGE" ? item.displayDurationSec ?? project.imageDurationSec : null,
        fitMode: item.fitMode,
      },
    });
    await this.rebuild(projectId);
    return prisma.timelineItem.findUniqueOrThrow({ where: { id: created.id }, include: INCLUDE });
  }

  /** Moves an item immediately before/after another active item. */
  static async reorder(projectId: string, itemId: string, ref: { beforeItemId?: string; afterItemId?: string }) {
    const items = await prisma.timelineItem.findMany({ where: { projectId, active: true }, orderBy: { order: "asc" } });
    const moving = items.find((i) => i.id === itemId);
    if (!moving) throw new AppError("NOT_FOUND", `Timeline item ${itemId} not found`, { retryable: false });
    const others = items.filter((i) => i.id !== itemId);

    let insertAt = others.length;
    if (ref.beforeItemId) {
      const idx = others.findIndex((i) => i.id === ref.beforeItemId);
      if (idx === -1) throw new AppError("NOT_FOUND", `Timeline item ${ref.beforeItemId} not found`, { retryable: false });
      insertAt = idx;
    } else if (ref.afterItemId) {
      const idx = others.findIndex((i) => i.id === ref.afterItemId);
      if (idx === -1) throw new AppError("NOT_FOUND", `Timeline item ${ref.afterItemId} not found`, { retryable: false });
      insertAt = idx + 1;
    }

    const reordered = [...others.slice(0, insertAt), moving, ...others.slice(insertAt)];
    for (let i = 0; i < reordered.length; i++) {
      await prisma.timelineItem.update({ where: { id: reordered[i].id }, data: { order: i + 1 } });
    }
    await this.rebuild(projectId);
  }

  /** Sets image display duration for one item, or every active image item ("make every image 4 seconds"). */
  static async setImageDuration(projectId: string, target: { itemId: string } | { all: true }, seconds: number) {
    if ("all" in target) {
      await prisma.timelineItem.updateMany({ where: { projectId, active: true, kind: "IMAGE" }, data: { displayDurationSec: seconds } });
    } else {
      const item = await prisma.timelineItem.findFirst({ where: { id: target.itemId, projectId } });
      if (!item) throw new AppError("NOT_FOUND", `Timeline item ${target.itemId} not found`, { retryable: false });
      if (item.kind !== "IMAGE") throw new AppError("VALIDATION_ERROR", "Only image items have a display duration.", { retryable: false });
      await prisma.timelineItem.update({ where: { id: item.id }, data: { displayDurationSec: seconds } });
    }
    await this.rebuild(projectId);
  }

  static async setFitMode(projectId: string, itemId: string, fitMode: FitMode) {
    const item = await prisma.timelineItem.findFirst({ where: { id: itemId, projectId } });
    if (!item) throw new AppError("NOT_FOUND", `Timeline item ${itemId} not found`, { retryable: false });
    await prisma.timelineItem.update({ where: { id: itemId }, data: { fitMode } });
  }

  static async setTrim(projectId: string, itemId: string, trim: { trimStartSec?: number; trimEndSec?: number }) {
    const item = await prisma.timelineItem.findFirst({ where: { id: itemId, projectId } });
    if (!item) throw new AppError("NOT_FOUND", `Timeline item ${itemId} not found`, { retryable: false });
    if (item.kind !== "VIDEO") throw new AppError("VALIDATION_ERROR", "Only video items can be trimmed.", { retryable: false });
    await prisma.timelineItem.update({ where: { id: itemId }, data: trim });
    await this.rebuild(projectId);
  }
}

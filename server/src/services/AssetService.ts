import crypto from "node:crypto";
import type { Asset } from "@prisma/client";
import { prisma } from "../database/prisma.js";

export type AssetType = "IMAGE" | "VIDEO" | "VOICE" | "MUSIC" | "SUBTITLE" | "THUMBNAIL";

/** Stable hash of everything that determines whether a generation request is "the same" as a prior one (spec #29). */
export function computeGenerationHash(parts: Record<string, unknown>): string {
  const normalized = JSON.stringify(parts, Object.keys(parts).sort());
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export interface RecordAssetInput {
  projectId: string;
  sceneId?: string;
  type: AssetType;
  provider: string;
  isMock: boolean;
  prompt?: string;
  filePath: string;
  duration?: number;
  generationHash: string;
  metadata?: Record<string, unknown>;
}

export function serializeAsset(a: Asset) {
  return {
    id: a.id,
    projectId: a.projectId,
    sceneId: a.sceneId,
    type: a.type,
    version: a.version,
    status: a.status,
    provider: a.provider,
    isMock: a.isMock,
    prompt: a.prompt,
    filePath: a.filePath,
    duration: a.duration,
    metadata: safeParse(a.metadata),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function safeParse(json: string) {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export class AssetService {
  /** The version number the NEXT asset of this (projectId, sceneId, type) will get - used to build a filename before generating. */
  static async nextVersion(projectId: string, sceneId: string | undefined, type: AssetType): Promise<number> {
    const existingCount = await prisma.asset.count({ where: { projectId, sceneId: sceneId ?? null, type } });
    return existingCount + 1;
  }

  /** Returns a still-valid prior asset with the exact same generation parameters, if one exists (avoids redundant generation). */
  static async findCached(projectId: string, sceneId: string | undefined, type: AssetType, generationHash: string): Promise<Asset | null> {
    return prisma.asset.findFirst({
      where: { projectId, sceneId: sceneId ?? null, type, generationHash, status: "COMPLETED" },
      orderBy: { version: "desc" },
    });
  }

  /** Creates a new version of an asset. For VIDEO assets tied to a scene, also marks it as that scene's active asset. */
  static async record(input: RecordAssetInput): Promise<Asset> {
    const existingCount = await prisma.asset.count({
      where: { projectId: input.projectId, sceneId: input.sceneId ?? null, type: input.type },
    });

    const asset = await prisma.asset.create({
      data: {
        projectId: input.projectId,
        sceneId: input.sceneId ?? null,
        type: input.type,
        version: existingCount + 1,
        status: "COMPLETED",
        provider: input.provider,
        isMock: input.isMock,
        prompt: input.prompt ?? "",
        filePath: input.filePath,
        duration: input.duration,
        generationHash: input.generationHash,
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    });

    if (input.sceneId && input.type === "VIDEO") {
      await prisma.scene.update({ where: { id: input.sceneId }, data: { activeAssetId: asset.id } });
    }

    return asset;
  }

  static async listForProject(projectId: string) {
    return prisma.asset.findMany({ where: { projectId }, orderBy: [{ sceneId: "asc" }, { type: "asc" }, { version: "asc" }] });
  }

  /** The highest-version asset of this type for a scene (used for types like VOICE that don't have a dedicated "active" pointer on Scene). */
  static async getLatest(projectId: string, sceneId: string | undefined, type: AssetType) {
    return prisma.asset.findFirst({
      where: { projectId, sceneId: sceneId ?? null, type, status: "COMPLETED" },
      orderBy: { version: "desc" },
    });
  }

  static async listForScene(projectId: string, sceneId: string, type?: AssetType) {
    return prisma.asset.findMany({
      where: { projectId, sceneId, ...(type ? { type } : {}) },
      orderBy: { version: "asc" },
    });
  }

  /**
   * Switches which version of a scene's asset is "active" (spec #28: "Use
   * version 2"). Only VIDEO assets can be activated this way - Scene has a
   * single activeAssetId pointer, and that's what merge_videos reads, so
   * pointing it at a non-video asset would silently break assembly.
   */
  static async setActiveVersion(projectId: string, sceneId: string, assetId: string): Promise<Asset> {
    const { AppError } = await import("../utils/errors.js");
    const asset = await prisma.asset.findFirst({ where: { id: assetId, projectId, sceneId } });
    if (!asset) {
      throw new AppError("NOT_FOUND", `Asset ${assetId} not found for scene ${sceneId}`, { retryable: false });
    }
    if (asset.type !== "VIDEO") {
      throw new AppError("VALIDATION_ERROR", `Only VIDEO assets can be set active (got ${asset.type}).`, { retryable: false });
    }
    await prisma.scene.update({ where: { id: sceneId }, data: { activeAssetId: assetId } });
    return asset;
  }
}

import crypto from "node:crypto";
import type { Asset } from "@prisma/client";
import { prisma } from "../database/prisma.js";

// Asset now only covers artifacts this app produces itself directly with
// FFmpeg (never AI-generated media) - subtitles and thumbnails extracted
// from the assembled render.
export type AssetType = "SUBTITLE" | "THUMBNAIL";

/** Stable hash of everything that determines whether a generation request is "the same" as a prior one. */
export function computeGenerationHash(parts: Record<string, unknown>): string {
  const normalized = JSON.stringify(parts, Object.keys(parts).sort());
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export interface RecordAssetInput {
  projectId: string;
  type: AssetType;
  provider?: string;
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
    type: a.type,
    version: a.version,
    status: a.status,
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
  /** The version number the NEXT asset of this (projectId, type) will get - used to build a filename before generating. */
  static async nextVersion(projectId: string, type: AssetType): Promise<number> {
    const existingCount = await prisma.asset.count({ where: { projectId, type } });
    return existingCount + 1;
  }

  /** Returns a still-valid prior asset with the exact same generation parameters, if one exists (avoids redundant regeneration). */
  static async findCached(projectId: string, type: AssetType, generationHash: string): Promise<Asset | null> {
    return prisma.asset.findFirst({
      where: { projectId, type, generationHash, status: "COMPLETED" },
      orderBy: { version: "desc" },
    });
  }

  static async record(input: RecordAssetInput): Promise<Asset> {
    const existingCount = await prisma.asset.count({ where: { projectId: input.projectId, type: input.type } });
    return prisma.asset.create({
      data: {
        projectId: input.projectId,
        type: input.type,
        version: existingCount + 1,
        status: "COMPLETED",
        provider: input.provider ?? "internal",
        isMock: false,
        prompt: input.prompt ?? "",
        filePath: input.filePath,
        duration: input.duration,
        generationHash: input.generationHash,
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    });
  }

  static async listForProject(projectId: string, type?: AssetType) {
    return prisma.asset.findMany({ where: { projectId, ...(type ? { type } : {}) }, orderBy: [{ type: "asc" }, { version: "asc" }] });
  }

  /** The highest-version asset of this type (e.g. "the current thumbnail"). */
  static async getLatest(projectId: string, type: AssetType) {
    return prisma.asset.findFirst({ where: { projectId, type, status: "COMPLETED" }, orderBy: { version: "desc" } });
  }
}

import type { Project } from "@prisma/client";
import { prisma } from "../database/prisma.js";
import { ProjectStorage } from "./ProjectStorage.js";
import { AppError } from "../utils/errors.js";
import { env } from "../utils/env.js";
import type { AspectRatio, MediaType, StyleBible } from "../types/project.js";

export interface CreateProjectInput {
  title: string;
  description?: string;
  topic?: string;
  duration?: number;
  mediaType?: MediaType;
  clipDurationSec?: number;
  imageDurationSec?: number;
  aspectRatio?: AspectRatio;
  resolution?: string;
  fps?: number;
  language?: string;
  audience?: string;
  style?: string;
  videoType?: string;
  narrationRequired?: boolean;
  musicRequired?: boolean;
}

const RESOLUTION_BY_ASPECT: Record<AspectRatio, string> = {
  "16:9": "1920x1080",
  "9:16": "1080x1920",
  "1:1": "1080x1080",
  "4:3": "1440x1080",
};

/** Serialized project shape returned by the API (JSON string columns parsed). */
export function serializeProject(p: Project) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    topic: p.topic,
    duration: p.duration,
    mediaType: p.mediaType,
    clipDurationSec: p.clipDurationSec,
    imageDurationSec: p.imageDurationSec,
    narrationRequired: p.narrationRequired,
    musicRequired: p.musicRequired,
    aspectRatio: p.aspectRatio,
    resolution: p.resolution,
    fps: p.fps,
    language: p.language,
    audience: p.audience,
    style: p.style,
    videoType: p.videoType,
    status: p.status,
    agentState: p.agentState,
    script: safeParse(p.scriptJson),
    styleBible: safeParse(p.styleBible) as StyleBible | null,
    storyContext: p.storyContext,
    introEnabled: p.introEnabled,
    outroEnabled: p.outroEnabled,
    hasBrandBackground: Boolean(p.brandBackgroundPath),
    brandBackgroundPrompt: p.brandBackgroundPrompt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function safeParse(json: string) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export class ProjectService {
  static async create(input: CreateProjectInput) {
    const aspectRatio = input.aspectRatio ?? "16:9";
    const project = await prisma.project.create({
      data: {
        title: input.title,
        description: input.description ?? "",
        topic: input.topic ?? input.title,
        duration: input.duration ?? 60,
        mediaType: input.mediaType ?? "VIDEO",
        clipDurationSec: input.clipDurationSec ?? 10,
        imageDurationSec: input.imageDurationSec ?? 5,
        narrationRequired: input.narrationRequired ?? false,
        musicRequired: input.musicRequired ?? false,
        aspectRatio,
        resolution: input.resolution ?? RESOLUTION_BY_ASPECT[aspectRatio],
        fps: input.fps ?? 30,
        language: input.language ?? "English",
        audience: input.audience ?? "General",
        style: input.style ?? "3D Cartoon",
        videoType: input.videoType ?? "Educational",
        status: "DRAFT",
        agentState: "IDLE",
        storagePath: env.PROJECT_STORAGE_PATH, // recorded for reference; real path resolved via ProjectStorage
      },
    });

    await ProjectStorage.bootstrap(project.id);
    await ProjectStorage.writeJson(project.id, "project.json", serializeProject(project));

    return project;
  }

  static async get(id: string) {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new AppError("NOT_FOUND", `Project ${id} not found`, { retryable: false });
    }
    return project;
  }

  static async list() {
    return prisma.project.findMany({ orderBy: { updatedAt: "desc" } });
  }

  static async update(id: string, data: Partial<Project>) {
    // never allow storagePath/id to be overwritten from arbitrary input
    const { id: _id, storagePath: _sp, ...rest } = data as any;
    // Changing aspect ratio without an explicit resolution should re-derive
    // the resolution, so "change aspect ratio to 9:16" behaves sensibly
    // from chat without the caller having to also compute resolution.
    if (rest.aspectRatio && !rest.resolution) {
      rest.resolution = RESOLUTION_BY_ASPECT[rest.aspectRatio as AspectRatio] ?? rest.resolution;
    }
    const project = await prisma.project.update({ where: { id }, data: rest });
    await ProjectStorage.writeJson(id, "project.json", serializeProject(project));
    return project;
  }

  static async setAgentState(id: string, agentState: string) {
    return this.update(id, { agentState } as Partial<Project>);
  }

  static async getStyleBible(id: string): Promise<StyleBible | null> {
    const project = await this.get(id);
    try {
      return JSON.parse(project.styleBible);
    } catch {
      return null;
    }
  }

  static async setStyleBible(id: string, styleBible: Partial<StyleBible>) {
    return this.update(id, { styleBible: JSON.stringify(styleBible) } as Partial<Project>);
  }

  static async mergeStyleBible(id: string, patch: Partial<StyleBible>) {
    const current = (await this.getStyleBible(id)) ?? ({} as StyleBible);
    return this.setStyleBible(id, { ...current, ...patch });
  }

  static resolutionForAspectRatio(aspectRatio: AspectRatio): string {
    return RESOLUTION_BY_ASPECT[aspectRatio];
  }

  static async remove(id: string) {
    await prisma.project.delete({ where: { id } });
    await ProjectStorage.remove(id);
  }
}

import { prisma } from "../database/prisma.js";
import { ProjectStorage } from "./ProjectStorage.js";
import type { EnvironmentBibleEntry } from "../types/schemas.js";

async function persistBibleJson(projectId: string): Promise<void> {
  const environments = await prisma.environment.findMany({ where: { projectId } });
  await ProjectStorage.writeJson(projectId, "characters/environment-bible.json", environments);
}

/** The Environment Bible - mirrors CharacterService exactly. */
export class EnvironmentService {
  static async list(projectId: string) {
    return prisma.environment.findMany({ where: { projectId } });
  }

  static async upsertMany(projectId: string, environments: EnvironmentBibleEntry[]): Promise<void> {
    for (const e of environments) {
      await this.upsertOne(projectId, e, false);
    }
    await persistBibleJson(projectId);
  }

  static async upsertOne(projectId: string, e: Partial<EnvironmentBibleEntry> & { environmentKey: string }, persist = true) {
    const result = await prisma.environment.upsert({
      where: { projectId_environmentKey: { projectId, environmentKey: e.environmentKey } },
      create: {
        projectId,
        environmentKey: e.environmentKey,
        name: e.name ?? e.environmentKey,
        description: e.description ?? "",
        lighting: e.lighting ?? "",
        colors: e.colors ?? "",
        props: e.props ?? "",
        timeOfDay: e.timeOfDay ?? "",
      },
      update: {
        ...(e.name !== undefined && { name: e.name }),
        ...(e.description !== undefined && { description: e.description }),
        ...(e.lighting !== undefined && { lighting: e.lighting }),
        ...(e.colors !== undefined && { colors: e.colors }),
        ...(e.props !== undefined && { props: e.props }),
        ...(e.timeOfDay !== undefined && { timeOfDay: e.timeOfDay }),
      },
    });
    if (persist) await persistBibleJson(projectId);
    return result;
  }
}

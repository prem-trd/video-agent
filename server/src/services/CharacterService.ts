import { prisma } from "../database/prisma.js";
import { ProjectStorage } from "./ProjectStorage.js";
import type { CharacterBibleEntry } from "../types/schemas.js";

async function persistBibleJson(projectId: string): Promise<void> {
  const characters = await prisma.character.findMany({ where: { projectId } });
  await ProjectStorage.writeJson(projectId, "characters/character-bible.json", characters);
}

export class CharacterService {
  static async list(projectId: string) {
    return prisma.character.findMany({ where: { projectId } });
  }

  static async upsertMany(projectId: string, characters: CharacterBibleEntry[]): Promise<void> {
    for (const c of characters) {
      await this.upsertOne(projectId, c, false);
    }
    await persistBibleJson(projectId);
  }

  static async upsertOne(projectId: string, c: Partial<CharacterBibleEntry> & { characterKey: string }, persist = true) {
    const result = await prisma.character.upsert({
      where: { projectId_characterKey: { projectId, characterKey: c.characterKey } },
      create: {
        projectId,
        characterKey: c.characterKey,
        name: c.name ?? c.characterKey,
        appearance: c.appearance ?? "",
        age: c.age ?? "",
        colors: c.colors ?? "",
        clothing: c.clothing ?? "",
        personality: c.personality ?? "",
        visualStyle: c.visualStyle ?? "",
        environment: c.environment ?? "",
      },
      update: {
        ...(c.name !== undefined && { name: c.name }),
        ...(c.appearance !== undefined && { appearance: c.appearance }),
        ...(c.age !== undefined && { age: c.age }),
        ...(c.colors !== undefined && { colors: c.colors }),
        ...(c.clothing !== undefined && { clothing: c.clothing }),
        ...(c.personality !== undefined && { personality: c.personality }),
        ...(c.visualStyle !== undefined && { visualStyle: c.visualStyle }),
        ...(c.environment !== undefined && { environment: c.environment }),
      },
    });
    if (persist) await persistBibleJson(projectId);
    return result;
  }
}

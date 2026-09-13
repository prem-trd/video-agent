import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { StoryStructureSchema, type StoryStructure } from "../../types/schemas.js";
import { ProjectService } from "../../services/ProjectService.js";
import { SceneService } from "../../services/SceneService.js";
import { CharacterService } from "../../services/CharacterService.js";
import { EnvironmentService } from "../../services/EnvironmentService.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";
import { AppError } from "../../utils/errors.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    count: looseOptional(z.number().int().positive()).describe("Number of new scenes to add."),
    additionalDurationSec: looseOptional(z.number().positive()).describe(
      "Alternative to count: add enough scenes to cover this many more seconds (e.g. 'generate another 2 minutes' -> 120)."
    ),
    guidance: z.string().optional().describe("What the new scenes should be about, if not obvious from the existing story."),
  })
  .strict()
  .refine((v) => v.count !== undefined || v.additionalDurationSec !== undefined, "Either count or additionalDurationSec is required.");

/**
 * Appends new scenes to the end of the project ("add 5 more scenes",
 * "generate another 2 minutes"). Extends the project's target duration to
 * match, writes story beats for the new scenes only (existing scenes
 * untouched), then the agent should call generate_scene_prompts for them.
 */
export const addScenesTool: Tool<z.infer<typeof InputSchema>> = {
  name: "add_scenes",
  description:
    "Add new scenes after the current last scene, extending the project's total duration. Pass count (exact number of scenes) or additionalDurationSec (e.g. 120 for 'another 2 minutes'). Writes story beats for the new scenes only - call generate_scene_prompts afterwards to fill in their prompts.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const perSceneDuration = project.mediaType === "IMAGE" ? project.imageDurationSec : project.clipDurationSec;
    const existing = await SceneService.list(ctx.projectId);
    const lastNumber = existing[existing.length - 1]?.sceneNumber ?? 0;

    const count = input.count ?? Math.max(1, Math.ceil((input.additionalDurationSec ?? 0) / perSceneDuration));
    if (count <= 0) throw new AppError("VALIDATION_ERROR", "Computed 0 scenes to add.", { retryable: false });

    const context = await buildCreativeContext(ctx.projectId);
    const newSceneNumbers = Array.from({ length: count }, (_, i) => lastNumber + 1 + i);

    const result = await ollamaClient.chatJSON<StoryStructure>(
      [
        {
          role: "system",
          content:
            `You are extending an existing story with new scenes numbered exactly: ${newSceneNumbers.join(", ")}. ` +
            "Continue naturally from the story context and existing scenes given below - do not repeat earlier content. " +
            "For each new scene: title, summary, and narration (only if narrationRequired). List any NEW recurring characters/environments not already in the Bibles. " +
            "Refine storyContext to describe the FULL story including these new scenes. Respond with ONLY a JSON object matching the schema.",
        },
        {
          role: "user",
          content: `${context}\n\n${input.guidance ? `What the new scenes should cover: ${input.guidance}\n\n` : ""}Existing scenes so far: ${existing.map((s) => `#${s.sceneNumber} ${s.onScreenText || s.visualDescription}`).join("; ")}`,
        },
      ],
      StoryStructureSchema,
      {},
      3
    );

    const beats = result.scenes
      .filter((b) => newSceneNumbers.includes(b.sceneNumber))
      .sort((a, b) => a.sceneNumber - b.sceneNumber)
      .map((b) => ({ ...b, duration: perSceneDuration }));

    await SceneService.appendScenes(ctx.projectId, beats);
    if (result.characters.length > 0) await CharacterService.upsertMany(ctx.projectId, result.characters);
    if (result.environments.length > 0) await EnvironmentService.upsertMany(ctx.projectId, result.environments);
    if (result.storyContext) await ProjectService.update(ctx.projectId, { storyContext: result.storyContext } as any);

    const newDuration = project.duration + beats.length * perSceneDuration;
    await ProjectService.update(ctx.projectId, { duration: newDuration } as any);

    return { scenesAdded: beats.length, newTotalDuration: newDuration };
  },
};

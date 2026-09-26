import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { StoryStructureSchema, type StoryStructure } from "../../types/schemas.js";
import { ProjectService } from "../../services/ProjectService.js";
import { SceneService } from "../../services/SceneService.js";
import { CharacterService } from "../../services/CharacterService.js";
import { EnvironmentService } from "../../services/EnvironmentService.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";
import { computeSceneTimings } from "../../utils/sceneMath.js";
import { maxNarrationWords } from "../scenes/videoPromptGuide.js";

const InputSchema = z.object({}).strict();

// Scene count/timing is fixed by computeSceneTimings (deterministic, from
// targetDuration / clip-or-image-duration) - a 30-minute, 180-scene video
// is generated in chunks so no single LLM call has to write 180 scenes at
// once (the same "one reasoning step at a time" principle used throughout
// this app), while still costing only ONE tool call/agent iteration.
const BATCH_SIZE = 12;

/**
 * Story Structure step: writes a short beat/summary (and narration text, if
 * narrationRequired) for every scene, sized by the deterministic scene
 * count/timing, and identifies recurring characters AND environments plus
 * an overall story context - all persisted so continuity carries into
 * generate_scene_prompts next.
 */
export const createStoryStructureTool: Tool<z.infer<typeof InputSchema>> = {
  name: "create_story_structure",
  description:
    "Write the scene-by-scene story structure: a short beat/summary (and narration text, if narrationRequired) per scene, sized to the deterministically-calculated scene count and durations. Also identifies recurring characters and environments, and an overall story context. Call this after create_prompt_plan, before generate_scene_prompts.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const perSceneDuration = project.mediaType === "IMAGE" ? project.imageDurationSec : project.clipDurationSec;
    const timings = computeSceneTimings(project.duration, perSceneDuration);

    let storyContext = "";
    let previousBeatsSummary = "";

    for (let i = 0; i < timings.length; i += BATCH_SIZE) {
      const batch = timings.slice(i, i + BATCH_SIZE);
      const context = await buildCreativeContext(ctx.projectId);

      const result = await ollamaClient.chatJSON<StoryStructure>(
        [
          {
            role: "system",
            content:
              "You are a story editor breaking a topic into a numbered sequence of scenes for an AI image/video PROMPT generator (prompts only - media is generated externally). " +
              `Write EXACTLY these scenes: ${batch.map((t) => `#${t.sceneNumber}`).join(", ")} (sceneNumber must match exactly). ` +
              "For each: a short `title`, a `summary` of what happens (visual, not spoken), and `narration` text ONLY if narrationRequired is true (otherwise leave it empty). " +
              `Narration is spoken inside each ${perSceneDuration}s clip by the video generator, so keep each scene's narration to AT MOST ${maxNarrationWords(perSceneDuration)} words - short, simple, energetic sentences, no emojis. ` +
              (project.mediaType === "VIDEO" && project.narrationRequired
                ? "Unless the topic clearly suits a voice-over only, include ONE recurring on-screen presenter character (a friendly host who speaks the narration) in `characters`, with a very detailed appearance (age, height, skin, hair, eyes, exact clothing and shoes). "
                : "") +
              "If the topic naturally has more items than scenes (e.g. the alphabet, numbers 1-20), group multiple items into one scene rather than skipping ahead of the assigned scene numbers. " +
              "List any NEW recurring characters in `characters` and NEW recurring settings/environments in `environments` this batch introduces (skip ones already listed in the Character/Environment Bible below). " +
              "Every character needs a concrete, non-empty `appearance` (species/type, colors, clothing/accessories) - this becomes the Character Bible entry future prompts reuse verbatim. Every environment needs a concrete `description`. " +
              "Set `storyContext` to a 2-4 sentence summary of the ENTIRE video's narrative arc (not just this batch) - carry forward and refine the previous story context given below rather than replacing its intent. " +
              "Respond with ONLY a JSON object matching the schema.",
          },
          {
            role: "user",
            content: [
              context,
              storyContext ? `\nStory context so far: ${storyContext}` : "",
              previousBeatsSummary ? `\nPrevious scenes so far (for continuity, do not repeat): ${previousBeatsSummary}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
        StoryStructureSchema,
        {},
        3
      );

      const beatsWithTiming = result.scenes.map((beat) => {
        const timing = batch.find((t) => t.sceneNumber === beat.sceneNumber) ?? batch[result.scenes.indexOf(beat)];
        return { ...beat, duration: timing.duration, startTime: timing.startTime, endTime: timing.endTime };
      });
      await SceneService.applyStoryStructure(ctx.projectId, beatsWithTiming);

      if (result.characters.length > 0) await CharacterService.upsertMany(ctx.projectId, result.characters);
      if (result.environments.length > 0) await EnvironmentService.upsertMany(ctx.projectId, result.environments);

      storyContext = result.storyContext || storyContext;
      previousBeatsSummary = beatsWithTiming.map((b) => `#${b.sceneNumber} ${b.title}`).join("; ");
    }

    if (storyContext) {
      await ProjectService.update(ctx.projectId, { storyContext } as any);
    }

    return { sceneCount: timings.length, totalDuration: timings[timings.length - 1]?.endTime ?? 0, storyContext };
  },
};

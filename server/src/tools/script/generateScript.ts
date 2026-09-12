import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { ScriptGenerationSchema, type ScriptGeneration } from "../../types/schemas.js";
import { ProjectService } from "../../services/ProjectService.js";
import { SceneService } from "../../services/SceneService.js";
import { CharacterService } from "../../services/CharacterService.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    sceneCount: looseOptional(z.number().int().positive().max(60)).describe(
      "Number of scenes to write. Defaults to the plan's recommended sceneCount, or duration/6s if unset. Clamped server-side so scenes can never average under MIN_SCENE_DURATION_SEC - a topic with more items than fit (e.g. 26 letters in 60s) must group items per scene or cover a subset, not shrink scenes below a sensible length."
    ),
  })
  .strict();

// A real failure mode observed live: asked for "the alphabet" in 60s, the
// model wrote 26 scenes (one per letter) at 2.3s each - too short to be
// watchable, AND each scene needs its own generate_video/generate_voice
// call later, so 26 scenes alone consumed 52 agent iterations and blew
// through MAX_AGENT_ITERATIONS. Scene count is clamped here, deterministically,
// rather than trusted from the model's input - the model is still free to
// ask for fewer scenes, just never enough to make them absurdly short.
const MIN_SCENE_DURATION_SEC = 4;

/**
 * Writes the narration-level script (spec #13): one entry per scene with
 * narration, on-screen text and duration, plus any recurring characters
 * the script introduces (persisted into the Character Bible for
 * consistency, spec #14). Production-level fields (prompts, camera/anim
 * direction) are filled in afterwards by create_scene_plan.
 */
export const generateScriptTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_script",
  description:
    "Write the scene-by-scene narration script for the video: narration, on-screen text and duration per scene, sized to fit the project's total duration. Also identifies any recurring characters. Call this after create_video_plan.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const project = await ProjectService.get(ctx.projectId);
    const context = await buildCreativeContext(ctx.projectId);
    const maxScenesForDuration = Math.max(1, Math.floor(project.duration / MIN_SCENE_DURATION_SEC));
    const requestedSceneCount = input.sceneCount ?? Math.max(1, Math.round(project.duration / 6));
    const sceneCount = Math.min(requestedSceneCount, maxScenesForDuration);

    const script = await ollamaClient.chatJSON<ScriptGeneration>(
      [
        {
          role: "system",
          content:
            `You are a scriptwriter for short educational/entertainment videos. Write exactly ${sceneCount} scenes whose durations sum to approximately ${project.duration} seconds ` +
            `(each scene at least ${MIN_SCENE_DURATION_SEC} seconds - that floor is intentional and non-negotiable, a shorter scene isn't watchable). ` +
            `If the topic naturally has more items than ${sceneCount} (e.g. the alphabet, numbers 1-20), do NOT create one scene per item - group multiple items into a single scene's narration (e.g. "A is for Apple, B is for Ball" in one scene) or cover only the most representative subset. Never shrink scene duration to cram everything in. ` +
            "Narration should be simple, clear, and appropriate for the stated audience and language. For children's content: short sentences, repetition, one idea per scene. " +
            "sceneNumber must start at 1 and increase by 1 with no gaps. List any named recurring characters (e.g. animal hosts, mascots) in `characters`. " +
            "EVERY character entry is REQUIRED to have a non-empty `appearance` string with concrete visual detail (species/type, fur or skin color, clothing/accessories, size) - this is the Character Bible entry future image prompts will reuse verbatim, so do not leave it vague or blank. " +
            'Example character entry: { "characterKey": "amy_the_alpaca", "name": "Amy the Alpaca", "appearance": "fluffy pink alpaca with a light-blue scarf and big friendly eyes", "personality": "cheerful and curious" }. ' +
            "Respond with ONLY a JSON object matching the schema.",
        },
        { role: "user", content: context },
      ],
      ScriptGenerationSchema,
      {},
      3 // a couple of extra correction rounds - character appearance is easy for the model to skip on a first pass
    );

    const characters = script.characters ?? [];
    await SceneService.applyScript(ctx.projectId, script.scenes);
    if (characters.length > 0) {
      await CharacterService.upsertMany(ctx.projectId, characters);
    }

    return {
      sceneCount: script.scenes.length,
      totalDuration: script.scenes.reduce((sum, s) => sum + s.duration, 0),
      characters: characters.map((c) => c.characterKey),
    };
  },
};

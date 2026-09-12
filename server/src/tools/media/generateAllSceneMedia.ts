import { z } from "zod";
import type { Tool } from "../types.js";
import { SceneService } from "../../services/SceneService.js";
import { generateVideoTool } from "./generateVideo.js";
import { generateVoiceTool } from "../audio/generateVoice.js";
import { looseOptional } from "../../utils/zodHelpers.js";

const InputSchema = z
  .object({
    sceneNumbers: z
      .array(z.number().int().positive())
      .optional()
      .describe("Limit to these scene numbers. Omit to process every scene in the project."),
    include: z
      .array(z.enum(["video", "voice"]))
      .optional()
      .describe('Which media types to generate. Defaults to ["video","voice"].'),
    force: looseOptional(z.boolean()).describe("Bypass the generation cache for every scene processed."),
  })
  .strict();

interface SceneMediaResult {
  sceneNumber: number;
  video?: { success: boolean; cached?: boolean; error?: string };
  voice?: { success: boolean; cached?: boolean; error?: string };
}

/**
 * Generates video and/or voice for MANY scenes in a single tool call
 * instead of one call per scene per media type. A real failure mode this
 * fixes: a video with N scenes needs 2N individual generate_video/
 * generate_voice calls if done one at a time, each costing a full agent
 * iteration - for a 20+ scene video that alone can exceed
 * MAX_AGENT_ITERATIONS before assembly even starts. This tool reuses the
 * exact same generate_video/generate_voice logic (same caching,
 * versioning, provider calls) per scene internally, just inside ONE
 * iteration, and reports partial results instead of failing the whole
 * batch if one scene has an issue.
 */
export const generateAllSceneMediaTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_all_scene_media",
  description:
    "Generate video and/or voice for every scene (or a specific list of scene numbers) in one call, instead of calling generate_video/generate_voice separately per scene. Prefer this for the initial full-pipeline run on a video with several scenes - it uses far fewer of your iterations. Reports per-scene success/failure; a failure on one scene doesn't stop the others.",
  inputSchema: InputSchema,
  retryable: true,
  timeoutMs: 10 * 60_000, // generous - this does many sequential generations internally
  async execute(input, ctx) {
    const allScenes = await SceneService.list(ctx.projectId);
    const scenes = input.sceneNumbers?.length ? allScenes.filter((s) => input.sceneNumbers!.includes(s.sceneNumber)) : allScenes;
    const include = input.include ?? ["video", "voice"];

    const results: SceneMediaResult[] = [];

    for (const scene of scenes) {
      const entry: SceneMediaResult = { sceneNumber: scene.sceneNumber };

      if (include.includes("video")) {
        try {
          const r = await generateVideoTool.execute({ sceneId: scene.id, force: input.force }, ctx);
          entry.video = { success: true, cached: r.cached };
        } catch (err) {
          entry.video = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      }

      if (include.includes("voice")) {
        try {
          const r = await generateVoiceTool.execute({ sceneId: scene.id, force: input.force }, ctx);
          entry.voice = { success: true, cached: r.cached };
        } catch (err) {
          entry.voice = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      }

      results.push(entry);
    }

    const failures = results.filter((r) => r.video?.success === false || r.voice?.success === false);

    return {
      scenesProcessed: results.length,
      succeeded: results.length - failures.length,
      failed: failures.length,
      results,
    };
  },
};

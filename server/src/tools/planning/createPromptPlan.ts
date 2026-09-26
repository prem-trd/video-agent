import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { PromptPlanSchema, type PromptPlan } from "../../types/schemas.js";
import { ProjectService } from "../../services/ProjectService.js";
import { ProjectStorage } from "../../services/ProjectStorage.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";
import { computeSceneCount } from "../../utils/sceneMath.js";

const InputSchema = z.object({}).strict();

/**
 * Prompt Planner: produces the creative plan for the project - an
 * objective and a Style Bible - and computes the required scene count
 * DETERMINISTICALLY from targetDuration / (clip or image duration),
 * never asking the LLM to guess it. Supports any target duration (30s to
 * 30+ minutes) since it's just arithmetic. Persists the Style Bible as the
 * canonical visual reference every later prompt tool must respect.
 */
export const createPromptPlanTool: Tool<z.infer<typeof InputSchema>> = {
  name: "create_prompt_plan",
  description:
    "Create the prompt plan: an objective and a Style Bible (visual style, lighting, camera, environment, character style), plus the deterministically-calculated required scene count (targetDuration / clipDurationOrImageDuration). Call this once the project's basic configuration (title/topic/mediaType/duration/clip-or-image-duration/audience/style) is set, before create_story_structure.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const context = await buildCreativeContext(ctx.projectId);
    const project = await ProjectService.get(ctx.projectId);

    const perSceneDuration = project.mediaType === "IMAGE" ? project.imageDurationSec : project.clipDurationSec;
    const sceneCount = computeSceneCount(project.duration, perSceneDuration);

    const plan = await ollamaClient.chatJSON<PromptPlan>(
      [
        {
          role: "system",
          content:
            "You are a creative director for an AI prompt-generation tool (it writes prompts; the user generates the actual media externally and uploads it). " +
            "Given a project's configuration, produce an objective (what the finished video/slideshow should achieve) and a Style Bible that will be applied " +
            "consistently to every scene's visuals so externally-generated clips/images look like they belong together. " +
            "The Style Bible MUST faithfully expand the project's Visual style - e.g. for a 3D style write 3D-render language (\"3D animated Pixar-style cartoon, rendered 3D characters with soft shading, volumetric lighting, depth of field\") and never 2D words like flat colors, flat illustration, vector or simple shapes; for a 2D style do the reverse. " +
            "Respond with ONLY a JSON object matching the schema.",
        },
        { role: "user", content: `${context}\nRequired scene count (fixed, do not change): ${sceneCount}` },
      ],
      PromptPlanSchema
    );

    await ProjectService.setStyleBible(ctx.projectId, plan.styleBible);
    await ProjectStorage.writeJson(ctx.projectId, "style-bible.json", plan.styleBible);

    return { objective: plan.objective, sceneCount, perSceneDuration, styleBible: plan.styleBible, project: project.title };
  },
};

import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { VideoPlanSchema, type VideoPlan } from "../../types/schemas.js";
import { ProjectService } from "../../services/ProjectService.js";
import { ProjectStorage } from "../../services/ProjectStorage.js";
import { buildCreativeContext } from "../../agent/PromptContext.js";

const InputSchema = z.object({}).strict();

/**
 * VideoPlanner (spec #12): produces the creative plan for the project -
 * an objective, a recommended scene count, and a Style Bible - and
 * persists the Style Bible as the canonical visual reference every later
 * scene/prompt tool must respect (spec #15).
 */
export const createVideoPlanTool: Tool<z.infer<typeof InputSchema>> = {
  name: "create_video_plan",
  description:
    "Create the creative video plan: an objective, a recommended number of scenes, and a Style Bible (visual style, lighting, camera, environment, character style). Call this once the project's basic configuration (title/topic/duration/audience/style) is set, before generating a script.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const context = await buildCreativeContext(ctx.projectId);
    const project = await ProjectService.get(ctx.projectId);

    const plan = await ollamaClient.chatJSON<VideoPlan>(
      [
        {
          role: "system",
          content:
            "You are a video creative director. Given a project's configuration, produce an objective (what the video should achieve), " +
            "a recommended sceneCount (assume roughly 4-8 seconds of narration per scene, so a 60s video is about 8-12 scenes), " +
            "and a Style Bible that will be applied consistently to every scene's visuals. Respond with ONLY a JSON object matching the schema.",
        },
        { role: "user", content: context },
      ],
      VideoPlanSchema
    );

    await ProjectService.setStyleBible(ctx.projectId, plan.styleBible);
    await ProjectStorage.writeJson(ctx.projectId, "style-bible.json", plan.styleBible);

    return { objective: plan.objective, sceneCount: plan.sceneCount, styleBible: plan.styleBible, project: project.title };
  },
};

import { z } from "zod";
import type { Tool } from "../types.js";
import { EnvironmentService } from "../../services/EnvironmentService.js";

const InputSchema = z
  .object({
    environmentKey: z.string().min(1).describe("Existing or new environment key, e.g. red_barn"),
    name: z.string().optional(),
    description: z.string().optional(),
    lighting: z.string().optional(),
    colors: z.string().optional(),
    props: z.string().optional(),
    timeOfDay: z.string().optional(),
  })
  .strict();

/**
 * Lets the agent edit the Environment Bible directly, mirroring
 * update_character_bible. Future scene prompts pick up the change
 * automatically via buildCreativeContext. Existing scene prompts already
 * generated are not automatically rewritten.
 */
export const updateEnvironmentBibleTool: Tool<z.infer<typeof InputSchema>> = {
  name: "update_environment_bible",
  description:
    "Create or update an Environment Bible entry (a recurring setting/location: description, lighting, colors, props, time of day). Only pass the fields that should change.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const result = await EnvironmentService.upsertOne(ctx.projectId, input);
    return { environment: result };
  },
};

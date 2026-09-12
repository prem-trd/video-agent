import { z } from "zod";
import type { Tool } from "../types.js";
import { CharacterService } from "../../services/CharacterService.js";

const InputSchema = z
  .object({
    characterKey: z.string().min(1).describe("Existing or new character key, e.g. alpaca_01"),
    name: z.string().optional(),
    appearance: z.string().optional(),
    age: z.string().optional(),
    colors: z.string().optional(),
    clothing: z.string().optional(),
    personality: z.string().optional(),
    visualStyle: z.string().optional(),
    environment: z.string().optional(),
  })
  .strict();

/**
 * Lets the agent edit the Character Bible directly (spec #14: "the user
 * must be able to edit the character bible") in response to instructions
 * like "make the alpaca more playful" - future prompts automatically pick
 * up the change via buildCreativeContext.
 */
export const updateCharacterBibleTool: Tool<z.infer<typeof InputSchema>> = {
  name: "update_character_bible",
  description:
    "Create or update a Character Bible entry (name, appearance, personality, etc). Only pass the fields that should change. Existing scene prompts are not automatically rewritten - call generate_visual_prompt for affected scenes afterwards if needed.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input, ctx) {
    const result = await CharacterService.upsertOne(ctx.projectId, input);
    return { character: result };
  },
};

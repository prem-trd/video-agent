import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { RequestAnalysisSchema, type RequestAnalysis } from "../../types/schemas.js";

const InputSchema = z
  .object({
    request: z.string().min(1).describe("The user's freeform description of the video they want."),
  })
  .strict();

/**
 * Extracts structured project configuration from a freeform user request
 * (spec #11 "Create from prompt", spec #2 step 1-2 "understand the
 * request / ask for missing information"). Pure analysis - does not write
 * anything; the agent decides what to do with the result (e.g. call
 * update_project, or ask the user a clarifying question if missingInfo is
 * non-empty).
 */
export const analyzeRequestTool: Tool<z.infer<typeof InputSchema>> = {
  name: "analyze_request",
  description:
    "Analyze a freeform user request and extract structured video configuration (title, topic, duration, audience, language, style, aspectRatio, videoType). Also flags important missing details. Call this first for a vague or freeform request before creating a plan.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input) {
    const analysis = await ollamaClient.chatJSON<RequestAnalysis>(
      [
        {
          role: "system",
          content:
            "You extract structured video configuration from a user's request for an AI video generation tool. " +
            "Infer sensible defaults for anything not stated (e.g. default duration 60s, aspectRatio 16:9, language English) " +
            "but list anything IMPORTANT that was left ambiguous in missingInfo (e.g. target audience, specific topic, visual style) " +
            "only if it would meaningfully change the output. Respond with ONLY a JSON object matching the schema.",
        },
        { role: "user", content: input.request },
      ],
      RequestAnalysisSchema
    );
    return analysis;
  },
};

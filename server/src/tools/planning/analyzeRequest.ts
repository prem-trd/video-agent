import { z } from "zod";
import type { Tool } from "../types.js";
import { ollamaClient } from "../../llm/OllamaClient.js";
import { RequestAnalysisSchema, type RequestAnalysis } from "../../types/schemas.js";

const InputSchema = z
  .object({
    request: z.string().min(1).describe("The user's freeform description of the video/media they want."),
  })
  .strict();

/**
 * Extracts structured project configuration from a freeform user request:
 * title, topic, mediaType (video vs image), target duration (any length -
 * no cap), per-clip or per-image duration, aspect ratio, audience, style,
 * and whether narration/music are wanted. Pure analysis - does not write
 * anything; the agent decides what to do with the result (e.g. call
 * update_project, or ask the user a clarifying question if missingInfo is
 * non-empty).
 */
export const analyzeRequestTool: Tool<z.infer<typeof InputSchema>> = {
  name: "analyze_request",
  description:
    "Analyze a freeform user request and extract structured configuration: title, topic, mediaType (VIDEO or IMAGE), target duration in seconds (any length), clipDurationSec/imageDurationSec, aspectRatio, audience, language, style, narrationRequired, musicRequired. Call this first for a vague or freeform request before creating a prompt plan.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(input) {
    const analysis = await ollamaClient.chatJSON<RequestAnalysis>(
      [
        {
          role: "system",
          content:
            "You extract structured configuration from a user's request for a video/image PROMPT generation tool (it writes prompts for scenes; " +
            "the user generates the actual media externally with their own AI tools and uploads it - you never generate pixels). " +
            "Infer sensible defaults for anything not stated (default mediaType VIDEO, duration 60s if truly unstated, clipDurationSec 10, imageDurationSec 5, aspectRatio 16:9, language English) " +
            "but list anything IMPORTANT left ambiguous in missingInfo (e.g. target audience, specific topic, visual style) only if it would meaningfully change the output. " +
            "There is NO maximum duration - a request for 5, 10, 20 or 30+ minutes is normal; never cap or shrink it. " +
            "Respond with ONLY a JSON object matching the schema.",
        },
        { role: "user", content: input.request },
      ],
      RequestAnalysisSchema
    );
    return analysis;
  },
};

import { z } from "zod";
import { stringOrList } from "../utils/zodHelpers.js";

// Zod is the single source of truth for these shapes: it validates LLM
// structured output (chatJSON) AND tool input, and the TS types used
// everywhere else are inferred from it (no drift between "the schema we
// validate against" and "the type we code against").

export const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1", "4:3"]);
export const MediaTypeSchema = z.enum(["VIDEO", "IMAGE"]);

export const StyleBibleSchema = z.object({
  style: z.string(),
  lighting: z.string(),
  camera: z.string(),
  environment: z.string(),
  characterStyle: z.string(),
  colorDirection: z.string().default(""),
  renderingStyle: z.string().default(""),
  textStyle: z.string().default(""),
});
export type StyleBible = z.infer<typeof StyleBibleSchema>;

export const CharacterBibleEntrySchema = z.object({
  characterKey: z
    .string()
    .regex(/^[a-z0-9_]+$/, "characterKey must be lowercase snake_case, e.g. alpaca_01")
    .describe("Stable machine id used to reference this character in prompts, e.g. alpaca_01"),
  name: z.string(),
  appearance: z.string(),
  age: z.string().default(""),
  colors: z.string().default(""),
  clothing: z.string().default(""),
  personality: z.string().default(""),
  visualStyle: z.string().default(""),
  environment: z.string().default(""),
});
export type CharacterBibleEntry = z.infer<typeof CharacterBibleEntrySchema>;

export const EnvironmentBibleEntrySchema = z.object({
  environmentKey: z
    .string()
    .regex(/^[a-z0-9_]+$/, "environmentKey must be lowercase snake_case, e.g. red_barn")
    .describe("Stable machine id used to reference this environment/setting in prompts, e.g. red_barn"),
  name: z.string(),
  description: z.string(),
  lighting: z.string().default(""),
  colors: z.string().default(""),
  props: z.string().default(""),
  timeOfDay: z.string().default(""),
});
export type EnvironmentBibleEntry = z.infer<typeof EnvironmentBibleEntrySchema>;

// A scene's duration/startTime/endTime are computed deterministically from
// the project's targetDuration and clip/image duration (see
// tools/planning/createPromptPlan.ts) - the LLM is never asked to invent
// timing, only content.
export const SceneBeatSchema = z.object({
  sceneNumber: z.number().int().positive(),
  title: z.string().describe("Short scene title, e.g. 'A is for Apple'."),
  narration: z.string().default("").describe("Spoken/on-screen narration text for this scene, if narration is required. Empty otherwise."),
  onScreenText: z.string().default(""),
  summary: z.string().describe("What happens in this scene - the story beat, independent of visual styling detail."),
});
export type SceneBeat = z.infer<typeof SceneBeatSchema>;

export const StoryStructureSchema = z.object({
  storyContext: z.string().describe("2-4 sentence summary of the overall narrative arc/continuity across every scene."),
  scenes: z.array(SceneBeatSchema).min(1),
  characters: z
    .array(CharacterBibleEntrySchema)
    .default([])
    .describe("Any recurring characters this story introduces."),
  environments: z
    .array(EnvironmentBibleEntrySchema)
    .default([])
    .describe("Any recurring settings/environments this story introduces."),
});
export type StoryStructure = z.infer<typeof StoryStructureSchema>;

// One shared shape for both image-prompt and video-prompt scenes - fields
// irrelevant to the project's mediaType are simply left blank rather than
// forking into two near-identical schemas.
export const ScenePromptSchema = z.object({
  sceneNumber: z.number().int().positive(),
  visualDescription: z.string(),
  imagePrompt: z.string().describe("Full, self-contained prompt for an external AI image generator."),
  videoPrompt: z.string().default("").describe("Full, self-contained prompt for an external AI video generator (video mediaType only)."),
  animationDirection: z.string().default(""),
  cameraDirection: z.string().default(""),
  composition: z.string().default("").describe("Framing/composition detail, mainly for image prompts."),
  negativeInstructions: z.string().default("").describe("What to avoid generating, if useful."),
  continuityNotes: z.string().default(""),
  characters: z.array(z.string()).default([]).describe("characterKeys from the Character Bible appearing in this scene."),
  environmentKey: z.string().default("").describe("environmentKey from the Environment Bible this scene is set in, if any."),
  transition: z.string().default("fade"),
  soundEffects: stringOrList(),
});
export type ScenePrompt = z.infer<typeof ScenePromptSchema>;

export const ScenePromptBatchSchema = z.object({
  scenes: z.array(ScenePromptSchema).min(1),
});
export type ScenePromptBatch = z.infer<typeof ScenePromptBatchSchema>;

export const PromptPlanSchema = z.object({
  objective: z.string(),
  styleBible: StyleBibleSchema,
});
export type PromptPlan = z.infer<typeof PromptPlanSchema>;

export const RequestAnalysisSchema = z.object({
  title: z.string(),
  topic: z.string(),
  description: z.string(),
  mediaType: MediaTypeSchema,
  duration: z.number().int().positive().describe("Target total duration in seconds - no upper limit."),
  clipDurationSec: z.number().positive().default(10).describe("Per-clip duration in seconds, when mediaType is VIDEO."),
  imageDurationSec: z.number().positive().default(5).describe("Per-image display duration in seconds, when mediaType is IMAGE."),
  aspectRatio: AspectRatioSchema,
  language: z.string(),
  audience: z.string(),
  style: z.string(),
  videoType: z.string(),
  narrationRequired: z.boolean().default(false),
  musicRequired: z.boolean().default(false),
  durationStated: z.boolean().default(false).describe("true only if the user explicitly gave a total length (e.g. \"2 minutes\", \"90 seconds\")."),
  itemCount: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Number of distinct teaching items the topic covers, one per scene (alphabet A-Z = 26, numbers 1-10 = 10, a listed set = its length). 0 if the topic is not a countable list."),
  missingInfo: z
    .array(z.string())
    .default([])
    .describe("Important details the user did not specify and should be asked about, if any."),
});
export type RequestAnalysis = z.infer<typeof RequestAnalysisSchema>;

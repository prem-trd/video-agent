import { z } from "zod";

// Zod is the single source of truth for these shapes: it validates LLM
// structured output (chatJSON) AND tool input, and the TS types used
// everywhere else are inferred from it (no drift between "the schema we
// validate against" and "the type we code against").

export const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1"]);

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

export const SceneNarrationSchema = z.object({
  sceneNumber: z.number().int().positive(),
  duration: z.number().positive(),
  narration: z.string(),
  onScreenText: z.string().default(""),
});
export type SceneNarration = z.infer<typeof SceneNarrationSchema>;

export const ScenePlanSchema = z.object({
  sceneNumber: z.number().int().positive(),
  visualDescription: z.string(),
  imagePrompt: z.string(),
  videoPrompt: z.string(),
  animationDirection: z.string().default(""),
  cameraDirection: z.string().default(""),
  transition: z.string().default("fade"),
  soundEffects: z.string().default(""),
});
export type ScenePlan = z.infer<typeof ScenePlanSchema>;

export const VideoPlanSchema = z.object({
  objective: z.string(),
  sceneCount: z.number().int().positive().max(60),
  styleBible: StyleBibleSchema,
});
export type VideoPlan = z.infer<typeof VideoPlanSchema>;

export const RequestAnalysisSchema = z.object({
  title: z.string(),
  topic: z.string(),
  description: z.string(),
  duration: z.number().int().positive().max(3600),
  aspectRatio: AspectRatioSchema,
  language: z.string(),
  audience: z.string(),
  style: z.string(),
  videoType: z.string(),
  missingInfo: z
    .array(z.string())
    .default([])
    .describe("Important details the user did not specify and should be asked about, if any."),
});
export type RequestAnalysis = z.infer<typeof RequestAnalysisSchema>;

export const ScriptGenerationSchema = z.object({
  scenes: z.array(SceneNarrationSchema).min(1),
  characters: z
    .array(CharacterBibleEntrySchema)
    .default([])
    .describe("Any recurring characters this script introduces."),
});
export type ScriptGeneration = z.infer<typeof ScriptGenerationSchema>;

export const ScenePlanBatchSchema = z.object({
  scenes: z.array(ScenePlanSchema).min(1),
});
export type ScenePlanBatch = z.infer<typeof ScenePlanBatchSchema>;

export const YoutubeMetaSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  hashtags: z.array(z.string()),
  thumbnailPrompt: z.string(),
});
export type YoutubeMeta = z.infer<typeof YoutubeMetaSchema>;

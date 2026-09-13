// Core domain types shared across the agent, tools, and services.
// These mirror the Prisma models but are the shape used in memory / JSON
// files / API responses (Prisma uses stringified JSON columns for the
// nested structures - these types are what's inside those columns).

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3";
export type MediaType = "VIDEO" | "IMAGE";

export type ProjectStatus = "DRAFT" | "GENERATING" | "READY" | "FAILED";

export type AgentState =
  | "IDLE"
  | "ANALYZING"
  | "PLANNING"
  | "STORY_STRUCTURE"
  | "SCENE_PLANNING"
  | "PROMPT_GENERATION"
  | "AWAITING_UPLOADS"
  | "TIMELINE_BUILDING"
  | "VIDEO_ASSEMBLY"
  | "VALIDATING"
  | "FIXING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type SceneStatus = "PLANNED" | "GENERATING" | "READY" | "FAILED" | "REGENERATING" | "APPROVED";

export type FitMode = "FIT" | "CROP" | "BLUR_BACKGROUND";
export type TimelineItemKind = "IMAGE" | "VIDEO";
export type MediaAssetType = "IMAGE" | "VIDEO" | "AUDIO";
export type AudioTrackKind = "NARRATION" | "MUSIC";

// StyleBible / CharacterBibleEntry / EnvironmentBibleEntry are defined as
// zod schemas (the single source of truth, also used to validate LLM
// output) in ./schemas.ts.
export type { StyleBible, CharacterBibleEntry, EnvironmentBibleEntry } from "./schemas.js";

export interface SceneData {
  sceneNumber: number;
  duration: number;
  startTime: number;
  endTime: number;
  narration: string;
  onScreenText: string;
  visualDescription: string;
  imagePrompt: string;
  videoPrompt: string;
  animationDirection: string;
  cameraDirection: string;
  composition: string;
  negativeInstructions: string;
  continuityNotes: string;
  characters: string[];
  environmentKey: string;
  transition: string;
  soundEffects: string;
  status: SceneStatus;
}

export interface ProjectConfig {
  id: string;
  title: string;
  description: string;
  topic: string;
  duration: number;
  mediaType: MediaType;
  clipDurationSec: number;
  imageDurationSec: number;
  aspectRatio: AspectRatio;
  resolution: string;
  fps: number;
  language: string;
  audience: string;
  style: string;
  videoType: string;
  narrationRequired: boolean;
  musicRequired: boolean;
  status: ProjectStatus;
  agentState: AgentState;
}

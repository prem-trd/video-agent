// Core domain types shared across the agent, tools, and services.
// These mirror the Prisma models but are the shape used in memory / JSON
// files / API responses (Prisma uses stringified JSON columns for the
// nested structures - these types are what's inside those columns).

export type AspectRatio = "16:9" | "9:16" | "1:1";

export type ProjectStatus = "DRAFT" | "GENERATING" | "READY" | "FAILED";

export type AgentState =
  | "IDLE"
  | "ANALYZING"
  | "PLANNING"
  | "SCRIPT_GENERATION"
  | "SCENE_PLANNING"
  | "PROMPT_GENERATION"
  | "ASSET_GENERATION"
  | "VOICE_GENERATION"
  | "SUBTITLE_GENERATION"
  | "VIDEO_ASSEMBLY"
  | "VALIDATING"
  | "FIXING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type SceneStatus = "PLANNED" | "GENERATING" | "READY" | "FAILED" | "REGENERATING" | "APPROVED";

// StyleBible / CharacterBibleEntry are defined as zod schemas (the single
// source of truth, also used to validate LLM output) in ./schemas.ts.
export type { StyleBible, CharacterBibleEntry } from "./schemas.js";

export interface SceneData {
  sceneNumber: number;
  duration: number;
  narration: string;
  onScreenText: string;
  visualDescription: string;
  imagePrompt: string;
  videoPrompt: string;
  animationDirection: string;
  cameraDirection: string;
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
  aspectRatio: AspectRatio;
  resolution: string;
  fps: number;
  language: string;
  audience: string;
  style: string;
  videoType: string;
  status: ProjectStatus;
  agentState: AgentState;
}

// Mirrors the server's serialized API shapes (server/src/services/*Service.ts).
// Kept as a hand-written mirror rather than a shared package for now -
// simple enough at this size, and keeps the client fully decoupled from
// server internals.

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

export interface StyleBible {
  style: string;
  lighting: string;
  camera: string;
  environment: string;
  characterStyle: string;
  colorDirection?: string;
  renderingStyle?: string;
  textStyle?: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  topic: string;
  duration: number;
  mediaType: MediaType;
  clipDurationSec: number;
  imageDurationSec: number;
  narrationRequired: boolean;
  musicRequired: boolean;
  aspectRatio: AspectRatio;
  resolution: string;
  fps: number;
  language: string;
  audience: string;
  style: string;
  videoType: string;
  status: ProjectStatus;
  agentState: AgentState;
  script: unknown;
  styleBible: StyleBible | null;
  storyContext: string;
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  id: string;
  projectId: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface PromptVersion {
  id: string;
  projectId: string;
  sceneId: string;
  version: number;
  visualDescription: string;
  imagePrompt: string;
  videoPrompt: string;
  animationDirection: string;
  cameraDirection: string;
  composition: string;
  negativeInstructions: string;
  continuityNotes: string;
  isActive: boolean;
  createdAt: string;
}

export interface CharacterBibleEntry {
  id: string;
  characterKey: string;
  name: string;
  appearance: string;
  age: string;
  colors: string;
  clothing: string;
  personality: string;
  visualStyle: string;
  environment: string;
}

export interface EnvironmentBibleEntry {
  id: string;
  environmentKey: string;
  name: string;
  description: string;
  lighting: string;
  colors: string;
  props: string;
  timeOfDay: string;
}

export interface MediaAsset {
  id: string;
  projectId: string;
  type: MediaAssetType;
  originalFilename: string;
  filePath: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  aspectRatio: string;
  sizeBytes: number;
  status: string;
  matchedSceneNumber: number | null;
  createdAt: string;
}

export interface TimelineItem {
  id: string;
  projectId: string;
  mediaAssetId: string;
  sceneId: string | null;
  sceneNumber: number | null;
  kind: TimelineItemKind;
  order: number;
  displayDurationSec: number | null;
  trimStartSec: number | null;
  trimEndSec: number | null;
  fitMode: FitMode;
  transition: string;
  startTime: number;
  endTime: number;
  active: boolean;
  mediaAsset?: {
    id: string;
    type: MediaAssetType;
    originalFilename: string;
    filePath: string;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    aspectRatio: string;
  };
}

export interface AudioTrack {
  id: string;
  projectId: string;
  kind: AudioTrackKind;
  filePath: string;
  originalFilename: string;
  durationSec: number | null;
  volume: number;
  fadeInSec: number;
  fadeOutSec: number;
  active: boolean;
  createdAt: string;
}

export interface Render {
  id: string;
  projectId: string;
  filePath: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  durationSec: number;
  resolution: string;
  aspectRatio: string;
  fps: number;
  mediaItemCount: number;
  sizeBytes: number;
  hasAudio: boolean;
  hasSubtitles: boolean;
  validationIssues: string[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls: string;
  createdAt: string;
}

export interface AgentLog {
  id: string;
  projectId: string;
  level: string;
  agentState: string;
  task: string;
  tool: string;
  message: string;
  durationMs: number | null;
  data: string;
  createdAt: string;
}

export interface AgentTask {
  id: string;
  projectId: string;
  type: string;
  state: string;
  input: string;
  output: string;
  error: string | null;
  retryCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ChatTurnResult {
  reply: string;
  iterations: number;
  status: "COMPLETED" | "CANCELLED" | "MAX_ITERATIONS" | "FAILED";
  toolCalls: { name: string; success: boolean }[];
  error?: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> };
}

export interface AgentStatus {
  project: Project;
  agentState: AgentState;
  logs: AgentLog[];
  tasks: AgentTask[];
}

export interface UploadResult {
  uploaded: number;
  results: { mediaAsset: MediaAsset; match: { sceneNumber: number; confidence: "high" | "low" } | null; autoAssigned: boolean }[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> };
}

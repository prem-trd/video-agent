// Mirrors the server's serialized API shapes (server/src/services/*Service.ts).
// Kept as a hand-written mirror rather than a shared package for now -
// simple enough at this size, and keeps the client fully decoupled from
// server internals.

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

export interface YoutubeMeta {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  thumbnailPrompt: string;
}

export interface Project {
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
  script: unknown;
  styleBible: StyleBible | null;
  youtubeMeta: YoutubeMeta | null;
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  id: string;
  projectId: string;
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
  activeAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AssetType = "IMAGE" | "VIDEO" | "VOICE" | "MUSIC" | "SUBTITLE" | "THUMBNAIL";

export interface Asset {
  id: string;
  projectId: string;
  sceneId: string | null;
  type: AssetType;
  version: number;
  status: string;
  provider: string;
  isMock: boolean;
  prompt: string;
  filePath: string;
  duration: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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

export interface ApiErrorBody {
  error: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> };
}

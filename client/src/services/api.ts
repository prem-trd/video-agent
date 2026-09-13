import type {
  AgentStatus,
  AudioTrack,
  ChatMessage,
  ChatTurnResult,
  MediaAsset,
  Project,
  PromptVersion,
  Render,
  Scene,
  TimelineItem,
  UploadResult,
} from "../types/api";

// Every call is a relative /api/... path - the Vite dev server proxies it
// to the Node backend (see vite.config.ts), so the browser never talks to
// port 4000 directly and never sees OLLAMA_API_KEY or any other secret.

class ApiError extends Error {
  code: string;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, retryable: boolean, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    headers: isFormData ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (res.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = (body as any)?.error;
    throw new ApiError(err?.code ?? "UNKNOWN_ERROR", err?.message ?? res.statusText, err?.retryable ?? false, err?.details);
  }

  return body as T;
}

export const api = {
  listProjects: () => request<Project[]>("/api/projects"),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  createProject: (input: Partial<Project> & { title: string }) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify(input) }),
  updateProject: (id: string, patch: Partial<Project>) =>
    request<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  getChatHistory: (id: string) => request<ChatMessage[]>(`/api/projects/${id}/chat`),
  sendChatMessage: (id: string, message: string) =>
    request<ChatTurnResult>(`/api/projects/${id}/chat`, { method: "POST", body: JSON.stringify({ message }) }),

  generatePrompts: (id: string) => request<ChatTurnResult>(`/api/projects/${id}/generate-prompts`, { method: "POST" }),
  assemble: (id: string) => request<ChatTurnResult>(`/api/projects/${id}/assemble`, { method: "POST" }),
  cancelAgent: (id: string) => request<{ cancelled: boolean }>(`/api/projects/${id}/cancel`, { method: "POST" }),
  getStatus: (id: string) => request<AgentStatus>(`/api/projects/${id}/status`),
  getLatestRender: (id: string) => request<Render | null>(`/api/projects/${id}/renders/latest`),

  getScenes: (id: string) => request<Scene[]>(`/api/projects/${id}/scenes`),
  patchScene: (id: string, sceneId: string, patch: Partial<Scene>) =>
    request<Scene>(`/api/projects/${id}/scenes/${sceneId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  addScenes: (id: string, input: { count?: number; guidance?: string }) =>
    request<{ scenes: Scene[] }>(`/api/projects/${id}/scenes`, { method: "POST", body: JSON.stringify(input) }),
  deleteScene: (id: string, sceneId: string) => request<void>(`/api/projects/${id}/scenes/${sceneId}`, { method: "DELETE" }),
  moveScene: (id: string, sceneId: string, ref: { beforeSceneNumber?: number; afterSceneNumber?: number }) =>
    request<Scene>(`/api/projects/${id}/scenes/${sceneId}/move`, { method: "POST", body: JSON.stringify(ref) }),
  regenerateScenePrompt: (id: string, sceneId: string) =>
    request<{ scene: Scene }>(`/api/projects/${id}/scenes/${sceneId}/regenerate`, { method: "POST" }),
  getPromptVersions: (id: string, sceneId: string) => request<PromptVersion[]>(`/api/projects/${id}/scenes/${sceneId}/prompt-versions`),
  activatePromptVersion: (id: string, sceneId: string, versionId: string) =>
    request<Scene>(`/api/projects/${id}/scenes/${sceneId}/prompt-versions/${versionId}/activate`, { method: "POST" }),

  getMediaLibrary: (id: string) => request<MediaAsset[]>(`/api/projects/${id}/media`),
  uploadMedia: (id: string, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return request<UploadResult>(`/api/projects/${id}/upload`, { method: "POST", body: form });
  },
  getAudioTracks: (id: string) => request<AudioTrack[]>(`/api/projects/${id}/audio-tracks`),
  uploadAudio: (id: string, kind: "NARRATION" | "MUSIC", file: File) => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    return request<AudioTrack>(`/api/projects/${id}/upload-audio`, { method: "POST", body: form });
  },
  uploadSubtitles: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ filePath: string }>(`/api/projects/${id}/upload-subtitles`, { method: "POST", body: form });
  },

  getTimeline: (id: string) => request<TimelineItem[]>(`/api/projects/${id}/timeline`),
  assignMedia: (id: string, mediaId: string, sceneNumber?: number) =>
    request<TimelineItem>(`/api/projects/${id}/timeline/assign`, { method: "POST", body: JSON.stringify({ mediaId, sceneNumber }) }),
  replaceMedia: (id: string, itemId: string, newMediaId: string) =>
    request<TimelineItem>(`/api/projects/${id}/timeline/${itemId}/replace`, { method: "POST", body: JSON.stringify({ newMediaId }) }),
  reorderTimelineItem: (id: string, itemId: string, ref: { beforeItemId?: string; afterItemId?: string }) =>
    request<TimelineItem[]>(`/api/projects/${id}/timeline/${itemId}/reorder`, { method: "POST", body: JSON.stringify(ref) }),
  patchTimelineItem: (id: string, itemId: string, patch: { displayDurationSec?: number; fitMode?: string; trimStartSec?: number; trimEndSec?: number }) =>
    request<TimelineItem>(`/api/projects/${id}/timeline/${itemId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeTimelineItem: (id: string, itemId: string) => request<void>(`/api/projects/${id}/timeline/${itemId}`, { method: "DELETE" }),

  videoUrl: (id: string) => `/api/projects/${id}/video`,
  thumbnailUrl: (id: string) => `/api/projects/${id}/thumbnail`,
  fileUrl: (id: string, relativePath: string) => `/api/projects/${id}/files/${relativePath}`,
};

export { ApiError };

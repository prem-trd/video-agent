import type { AgentStatus, Asset, ChatMessage, ChatTurnResult, Project, Scene } from "../types/api";

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
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  getChatHistory: (id: string) => request<ChatMessage[]>(`/api/projects/${id}/chat`),
  sendChatMessage: (id: string, message: string) =>
    request<ChatTurnResult>(`/api/projects/${id}/chat`, { method: "POST", body: JSON.stringify({ message }) }),

  triggerGenerate: (id: string) => request<ChatTurnResult>(`/api/projects/${id}/generate`, { method: "POST" }),
  cancelAgent: (id: string) => request<{ cancelled: boolean }>(`/api/projects/${id}/cancel`, { method: "POST" }),
  getStatus: (id: string) => request<AgentStatus>(`/api/projects/${id}/status`),

  getScenes: (id: string) => request<Scene[]>(`/api/projects/${id}/scenes`),
  patchScene: (id: string, sceneId: string, patch: Partial<Scene>) =>
    request<Scene>(`/api/projects/${id}/scenes/${sceneId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  regenerateScene: (id: string, sceneId: string, type: "video" | "voice" | "image") =>
    request<{ scene: Scene; result: unknown }>(`/api/projects/${id}/scenes/${sceneId}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ type }),
    }),
  getSceneVersions: (id: string, sceneId: string, type: string = "VIDEO") =>
    request<Asset[]>(`/api/projects/${id}/scenes/${sceneId}/versions?type=${type}`),
  activateSceneVersion: (id: string, sceneId: string, assetId: string) =>
    request<{ scene: Scene; activatedAsset: Asset }>(`/api/projects/${id}/scenes/${sceneId}/versions/${assetId}/activate`, {
      method: "POST",
    }),

  getAssets: (id: string, params?: { sceneId?: string; type?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Asset[]>(`/api/projects/${id}/assets${qs ? `?${qs}` : ""}`);
  },

  videoUrl: (id: string) => `/api/projects/${id}/video`,
  thumbnailUrl: (id: string) => `/api/projects/${id}/thumbnail`,
  fileUrl: (id: string, relativePath: string) => `/api/projects/${id}/files/${relativePath}`,
};

export { ApiError };

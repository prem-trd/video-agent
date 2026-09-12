import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import { useAgentEvents } from "./useAgentEvents";
import type { AgentStatus, Asset, ChatMessage, Project, Scene } from "../types/api";

/**
 * Everything one selected project's UI panels need: project config, scenes,
 * assets, chat history, and live agent status. Real-time updates come from
 * the project's SSE event stream (spec #31) rather than polling on a timer
 * - `sending` and the Agent Activity feed both react to
 * agent_started/tool_called/tool_completed/project_completed/error events
 * pushed the moment AgentLoop/VideoAgent publish them, with a DB-backed
 * refresh (GET /status, /scenes, /assets) triggered alongside so the data
 * shown is always the authoritative server state, not a reconstruction of
 * the lightweight event payloads.
 */
export function useProjectWorkspace(projectId: string | null) {
  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    if (!projectId) return;
    const [p, s, a, c] = await Promise.all([
      api.getProject(projectId),
      api.getScenes(projectId),
      api.getAssets(projectId),
      api.getChatHistory(projectId),
    ]);
    setProject(p);
    setScenes(s);
    setAssets(a);
    setChatHistory(c);
  }, [projectId]);

  const refreshStatus = useCallback(async () => {
    if (!projectId) return;
    const st = await api.getStatus(projectId);
    setStatus(st);
    setProject(st.project);
  }, [projectId]);

  // initial load whenever the selected project changes
  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setScenes([]);
      setAssets([]);
      setChatHistory([]);
      setStatus(null);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([refreshAll(), refreshStatus()])
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [projectId, refreshAll, refreshStatus]);

  useAgentEvents(
    projectId,
    useCallback(
      (event) => {
        if (event.type === "agent_started") setSending(true);
        if (event.type === "tool_called" || event.type === "tool_completed") {
          refreshStatus().catch(() => {});
        }
        if (event.type === "tool_completed" || event.type === "project_completed") {
          refreshAll().catch(() => {});
        }
        if (event.type === "project_completed" || event.type === "error") {
          setSending(false);
          refreshStatus().catch(() => {});
          refreshAll().catch(() => {});
        }
      },
      [refreshAll, refreshStatus]
    )
  );

  const runAgentTurn = useCallback(
    async (turn: () => Promise<import("../types/api").ChatTurnResult>, optimisticUserMessage?: string) => {
      if (!projectId) return;
      setError(null);
      if (optimisticUserMessage) {
        setChatHistory((h) => [
          ...h,
          { id: `local-${Date.now()}`, projectId, role: "user", content: optimisticUserMessage, toolCalls: "null", createdAt: new Date().toISOString() },
        ]);
      }
      try {
        const result = await turn();
        if (result.status === "FAILED" && result.error) {
          setError(result.error.message);
        }
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setSending(false); // the request itself failed (e.g. network) - no project_completed/error event will arrive to clear this
        throw err;
      } finally {
        await Promise.all([refreshAll(), refreshStatus()]).catch(() => {});
      }
    },
    [projectId, refreshAll, refreshStatus]
  );

  const sendMessage = useCallback((text: string) => runAgentTurn(() => api.sendChatMessage(projectId!, text), text), [projectId, runAgentTurn]);

  const triggerGenerate = useCallback(
    () => runAgentTurn(() => api.triggerGenerate(projectId!), "▶ Generate full video"),
    [projectId, runAgentTurn]
  );

  const cancel = useCallback(async () => {
    if (!projectId) return;
    await api.cancelAgent(projectId);
  }, [projectId]);

  const regenerateScene = useCallback(
    async (sceneId: string, type: "video" | "voice" | "image") => {
      if (!projectId) return;
      setSending(true);
      try {
        await api.regenerateScene(projectId, sceneId, type);
      } finally {
        setSending(false);
        await refreshAll().catch(() => {});
      }
    },
    [projectId, refreshAll]
  );

  const activateVersion = useCallback(
    async (sceneId: string, assetId: string) => {
      if (!projectId) return;
      await api.activateSceneVersion(projectId, sceneId, assetId);
      await refreshAll().catch(() => {});
    },
    [projectId, refreshAll]
  );

  return {
    project,
    scenes,
    assets,
    chatHistory,
    status,
    sending,
    loading,
    error,
    sendMessage,
    triggerGenerate,
    cancel,
    regenerateScene,
    activateVersion,
    refreshAll,
  };
}

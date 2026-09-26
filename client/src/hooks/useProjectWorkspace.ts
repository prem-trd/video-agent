import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import { useAgentEvents } from "./useAgentEvents";
import type { AgentStatus, AudioTrack, ChatMessage, MediaAsset, Project, Render, Scene, TimelineItem } from "../types/api";

/**
 * Everything one selected project's UI panels need: project config, scenes/
 * prompts, uploaded media library, the assembly timeline, chat history, and
 * live agent status. Real-time updates come from the project's SSE event
 * stream rather than polling on a timer - `sending` and the Agent Activity
 * feed both react to agent_started/tool_called/tool_completed/
 * project_completed/error events pushed the moment AgentLoop/VideoAgent
 * publish them, with a DB-backed refresh triggered alongside so the data
 * shown is always the authoritative server state.
 */
export function useProjectWorkspace(projectId: string | null) {
  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<MediaAsset[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [latestRender, setLatestRender] = useState<Render | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [sending, setSending] = useState(false);
  // Tool currently executing (from tool_called until tool_completed) - AgentLog rows are only
  // written when a tool FINISHES, so this is what lets the activity feed show a long step
  // (e.g. render_timeline) while it's still running.
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    if (!projectId) return;
    const [p, s, m, t, a, r, c] = await Promise.all([
      api.getProject(projectId),
      api.getScenes(projectId),
      api.getMediaLibrary(projectId),
      api.getTimeline(projectId),
      api.getAudioTracks(projectId),
      api.getLatestRender(projectId),
      api.getChatHistory(projectId),
    ]);
    setProject(p);
    setScenes(s);
    setMediaLibrary(m);
    setTimeline(t);
    setAudioTracks(a);
    setLatestRender(r);
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
      setMediaLibrary([]);
      setTimeline([]);
      setAudioTracks([]);
      setLatestRender(null);
      setChatHistory([]);
      setStatus(null);
      setActiveTool(null);
      return;
    }
    setActiveTool(null);
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
        if (event.type === "tool_called") setActiveTool(typeof event.data?.tool === "string" ? event.data.tool : null);
        if (event.type === "tool_completed" || event.type === "project_completed" || event.type === "error") setActiveTool(null);
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
      // The POST itself doesn't resolve until the whole turn is finished
      // server-side (it's not streamed), so it's the ground truth for
      // "is this turn still running" - not the SSE `project_completed`
      // event, which can be missed if the EventSource reconnects mid-turn
      // (long turns like generate-prompts/assemble easily take a minute+),
      // which would otherwise leave `sending` stuck true forever.
      setSending(true);
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
        throw err;
      } finally {
        setSending(false);
        setActiveTool(null);
        await Promise.all([refreshAll(), refreshStatus()]).catch(() => {});
      }
    },
    [projectId, refreshAll, refreshStatus]
  );

  const sendMessage = useCallback((text: string) => runAgentTurn(() => api.sendChatMessage(projectId!, text), text), [projectId, runAgentTurn]);

  const generatePrompts = useCallback(
    () => runAgentTurn(() => api.generatePrompts(projectId!), "▶ Generate Prompts"),
    [projectId, runAgentTurn]
  );

  const assemble = useCallback(() => runAgentTurn(() => api.assemble(projectId!), "▶ Assemble Video"), [projectId, runAgentTurn]);

  const cancel = useCallback(async () => {
    if (!projectId) return;
    await api.cancelAgent(projectId);
  }, [projectId]);

  // ---- direct (non-LLM) actions - each refreshes the affected slice ----

  const updateProjectConfig = useCallback(
    async (patch: Partial<Project>) => {
      if (!projectId) return;
      await api.updateProject(projectId, patch);
      await refreshAll();
    },
    [projectId, refreshAll]
  );

  const regenerateScenePrompt = useCallback(
    async (sceneId: string) => {
      if (!projectId) return;
      setSending(true);
      try {
        await api.regenerateScenePrompt(projectId, sceneId);
      } finally {
        setSending(false);
        await refreshAll().catch(() => {});
      }
    },
    [projectId, refreshAll]
  );

  const addScenes = useCallback(
    async (count: number) => {
      if (!projectId) return;
      await api.addScenes(projectId, { count });
      await refreshAll();
    },
    [projectId, refreshAll]
  );

  const deleteScene = useCallback(
    async (sceneId: string) => {
      if (!projectId) return;
      await api.deleteScene(projectId, sceneId);
      await refreshAll();
    },
    [projectId, refreshAll]
  );

  const moveScene = useCallback(
    async (sceneId: string, ref: { beforeSceneNumber?: number; afterSceneNumber?: number }) => {
      if (!projectId) return;
      await api.moveScene(projectId, sceneId, ref);
      await refreshAll();
    },
    [projectId, refreshAll]
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!projectId) return;
      const result = await api.uploadMedia(projectId, files);
      await refreshAll();
      return result;
    },
    [projectId, refreshAll]
  );

  const uploadAudio = useCallback(
    async (kind: "NARRATION" | "MUSIC", file: File) => {
      if (!projectId) return;
      await api.uploadAudio(projectId, kind, file);
      await refreshAll();
    },
    [projectId, refreshAll]
  );

  const uploadSubtitles = useCallback(
    async (file: File) => {
      if (!projectId) return;
      await api.uploadSubtitles(projectId, file);
    },
    [projectId]
  );

  const assignMedia = useCallback(
    async (mediaId: string, sceneNumber?: number) => {
      if (!projectId) return;
      await api.assignMedia(projectId, mediaId, sceneNumber);
      await refreshAll();
    },
    [projectId, refreshAll]
  );

  const replaceMedia = useCallback(
    async (itemId: string, newMediaId: string) => {
      if (!projectId) return;
      await api.replaceMedia(projectId, itemId, newMediaId);
      await refreshAll();
    },
    [projectId, refreshAll]
  );

  const reorderTimelineItem = useCallback(
    async (itemId: string, ref: { beforeItemId?: string; afterItemId?: string }) => {
      if (!projectId) return;
      await api.reorderTimelineItem(projectId, itemId, ref);
      await refreshAll();
    },
    [projectId, refreshAll]
  );

  const patchTimelineItem = useCallback(
    async (itemId: string, patch: { displayDurationSec?: number; fitMode?: string; trimStartSec?: number; trimEndSec?: number }) => {
      if (!projectId) return;
      await api.patchTimelineItem(projectId, itemId, patch);
      await refreshAll();
    },
    [projectId, refreshAll]
  );

  const removeTimelineItem = useCallback(
    async (itemId: string) => {
      if (!projectId) return;
      await api.removeTimelineItem(projectId, itemId);
      await refreshAll();
    },
    [projectId, refreshAll]
  );

  return {
    project,
    scenes,
    mediaLibrary,
    timeline,
    audioTracks,
    latestRender,
    chatHistory,
    status,
    sending,
    activeTool,
    loading,
    error,
    sendMessage,
    generatePrompts,
    assemble,
    cancel,
    updateProjectConfig,
    regenerateScenePrompt,
    addScenes,
    deleteScene,
    moveScene,
    uploadFiles,
    uploadAudio,
    uploadSubtitles,
    assignMedia,
    replaceMedia,
    reorderTimelineItem,
    patchTimelineItem,
    removeTimelineItem,
    refreshAll,
  };
}

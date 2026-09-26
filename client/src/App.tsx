import { useEffect, useRef, useState } from "react";
import { useProjects } from "./hooks/useProjects";
import { useProjectWorkspace } from "./hooks/useProjectWorkspace";
import { ProjectSidebar } from "./features/projects/ProjectSidebar";
import { NewProjectModal, type NewProjectSubmission } from "./features/projects/NewProjectModal";
import { ChatPanel } from "./features/chat/ChatPanel";
import { PreviewPanel } from "./features/preview/PreviewPanel";
import { AgentActivity } from "./features/activity/AgentActivity";
import { ThemeToggle } from "./features/settings/ThemeToggle";
import { FullVideoWorkspace } from "./features/assemble/FullVideoWorkspace";
import { ModeSwitch, type WorkspaceMode } from "./components/ModeSwitch";
import { ChannelSettingsModal } from "./features/settings/ChannelSettingsModal";
import { useChannel } from "./hooks/useChannel";

export default function App() {
  const { projects, createProject, deleteProject } = useProjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<WorkspaceMode>("prompts");
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const channel = useChannel();

  const workspace = useProjectWorkspace(selectedId);

  // "Describe it" needs to send that prompt as the first chat message
  // through the SAME path a normal send uses (loading state, live status
  // polling, etc) - but `workspace` only starts pointing at the new project
  // once `selectedId` changes and this component re-renders, so the send
  // is deferred via this pending-ref + effect rather than fired directly
  // inside the create handler.
  const pendingInitialPrompt = useRef<{ projectId: string; prompt: string } | null>(null);

  useEffect(() => {
    const pending = pendingInitialPrompt.current;
    if (pending && workspace.project?.id === pending.projectId) {
      pendingInitialPrompt.current = null;
      workspace.sendMessage(pending.prompt);
    }
  }, [workspace.project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateProject(submission: NewProjectSubmission) {
    setCreating(true);
    try {
      if (submission.mode === "structured" && submission.structured) {
        const project = await createProject(submission.structured);
        setSelectedId(project.id);
        setShowNewProject(false);
      } else if (submission.mode === "prompt" && submission.prompt) {
        // Create a minimal project, then let the agent's analyze_request /
        // update_project tools fill in the real configuration from the
        // freeform prompt and generate its prompt package.
        const derivedTitle = submission.prompt.length > 60 ? `${submission.prompt.slice(0, 57)}...` : submission.prompt;
        const project = await createProject({ title: derivedTitle, topic: submission.prompt });
        pendingInitialPrompt.current = { projectId: project.id, prompt: submission.prompt };
        setSelectedId(project.id);
        setShowNewProject(false);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span className="brand-name">AI Video Studio</span>
        </div>
        <ModeSwitch mode={mode} onChange={setMode} />
        <div className="topbar-actions">
          <button className="theme-toggle" onClick={() => setShowChannelSettings(true)} title="Channel logo, name and screen settings">
            📺 <span className="topbar-label">Channel</span>
          </button>
          <ThemeToggle />
        </div>
      </div>

      <ProjectSidebar
        projects={projects}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNewProject={() => setShowNewProject(true)}
        onDelete={async (id) => {
          await deleteProject(id);
          if (id === selectedId) setSelectedId(null);
        }}
      />

      <main className="main">
        <div className={`content-row ${mode === "video" ? "video-mode" : ""}`}>
          {!workspace.project ? (
            <div className="empty-state">
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>No project selected</div>
              <div>Pick a project on the left, or create a new one.</div>
              <button className="new-project-btn" style={{ marginTop: 8 }} onClick={() => setShowNewProject(true)}>
                + New Project
              </button>
            </div>
          ) : mode === "prompts" ? (
            <>
              <ChatPanel
                chatHistory={workspace.chatHistory}
                sending={workspace.sending}
                error={workspace.error}
                onSend={workspace.sendMessage}
                onCancel={workspace.cancel}
              />
              <PreviewPanel
                project={workspace.project}
                scenes={workspace.scenes}
                sending={workspace.sending}
                onUpdateConfig={workspace.updateProjectConfig}
                onGeneratePrompts={workspace.generatePrompts}
                onRegenerateScenePrompt={workspace.regenerateScenePrompt}
                onDeleteScene={workspace.deleteScene}
                onMoveScene={workspace.moveScene}
                onAddScenes={workspace.addScenes}
                onRefresh={workspace.refreshAll}
                onGenerateBackgroundPrompt={() => workspace.generateBackgroundPrompt()}
              />
            </>
          ) : (
            <FullVideoWorkspace
              project={workspace.project}
              scenes={workspace.scenes}
              mediaLibrary={workspace.mediaLibrary}
              timeline={workspace.timeline}
              audioTracks={workspace.audioTracks}
              latestRender={workspace.latestRender}
              sending={workspace.sending}
              error={workspace.error}
              onUploadFiles={workspace.uploadFiles}
              onUploadAudio={workspace.uploadAudio}
              onAssignMedia={workspace.assignMedia}
              onRemoveTimelineItem={workspace.removeTimelineItem}
              onReorderTimelineItem={workspace.reorderTimelineItem}
              onPatchTimelineItem={workspace.patchTimelineItem}
              onAssemble={workspace.assemble}
              channel={channel.channel}
              channelConfigured={channel.configured}
              onToggleBranding={workspace.updateProjectConfig}
              onUploadBrandBackground={workspace.uploadBrandBackground}
              onRemoveBrandBackground={workspace.removeBrandBackground}
              onUpdateChannel={channel.update}
              onOpenChannelSettings={() => setShowChannelSettings(true)}
            />
          )}
        </div>

        {workspace.project && (
          <AgentActivity
            agentState={workspace.status?.agentState}
            logs={workspace.status?.logs ?? []}
            sending={workspace.sending}
            activeTool={workspace.activeTool}
          />
        )}
      </main>

      {showChannelSettings && channel.channel && (
        <ChannelSettingsModal
          channel={channel.channel}
          onSave={channel.update}
          onUploadFile={channel.uploadFile}
          onRemoveFile={channel.removeFile}
          onClose={() => setShowChannelSettings(false)}
        />
      )}

      {showNewProject && <NewProjectModal onCancel={() => setShowNewProject(false)} onSubmit={handleCreateProject} submitting={creating} />}
    </div>
  );
}

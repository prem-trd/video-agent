import { useEffect, useRef, useState } from "react";
import { useProjects } from "./hooks/useProjects";
import { useProjectWorkspace } from "./hooks/useProjectWorkspace";
import { ProjectSidebar } from "./features/projects/ProjectSidebar";
import { NewProjectModal, type NewProjectSubmission } from "./features/projects/NewProjectModal";
import { ChatPanel } from "./features/chat/ChatPanel";
import { PreviewPanel } from "./features/preview/PreviewPanel";
import { AgentActivity } from "./features/activity/AgentActivity";
import { ThemeToggle } from "./features/settings/ThemeToggle";

export default function App() {
  const { projects, createProject, deleteProject } = useProjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [creating, setCreating] = useState(false);

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
          AI Video Studio
        </div>
        <ThemeToggle />
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
        <div className="content-row">
          {!workspace.project ? (
            <div className="empty-state">
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>No project selected</div>
              <div>Pick a project on the left, or create a new one.</div>
              <button className="new-project-btn" style={{ marginTop: 8 }} onClick={() => setShowNewProject(true)}>
                + New Project
              </button>
            </div>
          ) : (
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
                mediaLibrary={workspace.mediaLibrary}
                timeline={workspace.timeline}
                audioTracks={workspace.audioTracks}
                latestRender={workspace.latestRender}
                sending={workspace.sending}
                onUpdateConfig={workspace.updateProjectConfig}
                onGeneratePrompts={workspace.generatePrompts}
                onRegenerateScenePrompt={workspace.regenerateScenePrompt}
                onDeleteScene={workspace.deleteScene}
                onMoveScene={workspace.moveScene}
                onAddScenes={workspace.addScenes}
                onUploadFiles={workspace.uploadFiles}
                onUploadAudio={workspace.uploadAudio}
                onAssignMedia={workspace.assignMedia}
                onRemoveTimelineItem={workspace.removeTimelineItem}
                onReorderTimelineItem={workspace.reorderTimelineItem}
                onPatchTimelineItem={workspace.patchTimelineItem}
                onAssemble={workspace.assemble}
                onRefresh={workspace.refreshAll}
              />
            </>
          )}
        </div>

        {workspace.project && (
          <AgentActivity agentState={workspace.status?.agentState} logs={workspace.status?.logs ?? []} sending={workspace.sending} />
        )}
      </main>

      {showNewProject && <NewProjectModal onCancel={() => setShowNewProject(false)} onSubmit={handleCreateProject} submitting={creating} />}
    </div>
  );
}

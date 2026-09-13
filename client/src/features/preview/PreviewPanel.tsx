import { useState } from "react";
import type { AudioTrack, MediaAsset, Project, Render, Scene, TimelineItem } from "../../types/api";
import { StatusBadge } from "../../components/StatusBadge";
import { PromptGeneratorPanel } from "../promptgen/PromptGeneratorPanel";
import { ScenePromptList } from "../scenes/ScenePromptList";
import { UploadAssemblePanel } from "../assemble/UploadAssemblePanel";
import { FinalRenderPanel } from "../render/FinalRenderPanel";

interface Props {
  project: Project;
  scenes: Scene[];
  mediaLibrary: MediaAsset[];
  timeline: TimelineItem[];
  audioTracks: AudioTrack[];
  latestRender: Render | null;
  sending: boolean;
  onUpdateConfig: (patch: Partial<Project>) => Promise<void>;
  onGeneratePrompts: () => void;
  onRegenerateScenePrompt: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onMoveScene: (sceneId: string, ref: { beforeSceneNumber?: number; afterSceneNumber?: number }) => void;
  onAddScenes: (count: number) => void;
  onUploadFiles: (files: File[]) => void;
  onUploadAudio: (kind: "NARRATION" | "MUSIC", file: File) => void;
  onAssignMedia: (mediaId: string, sceneNumber?: number) => void;
  onRemoveTimelineItem: (itemId: string) => void;
  onReorderTimelineItem: (itemId: string, ref: { beforeItemId?: string; afterItemId?: string }) => void;
  onPatchTimelineItem: (itemId: string, patch: { displayDurationSec?: number; fitMode?: string }) => void;
  onAssemble: () => void;
  onRefresh: () => void;
}

type Tab = "prompts" | "assemble" | "final";

export function PreviewPanel(props: Props) {
  const { project, scenes, mediaLibrary, timeline, audioTracks, latestRender, sending } = props;
  const [tab, setTab] = useState<Tab>("prompts");

  return (
    <section className="preview-panel">
      <div className="panel-card">
        <h3>Project</h3>
        <dl className="info-grid">
          <dt>Status</dt>
          <dd>
            <StatusBadge status={project.status} />
          </dd>
          <dt>Agent state</dt>
          <dd>
            <StatusBadge status={project.agentState} />
          </dd>
          <dt>Media type</dt>
          <dd>{project.mediaType}</dd>
          <dt>Target duration</dt>
          <dd>{project.duration}s</dd>
          <dt>Resolution</dt>
          <dd>{project.resolution}</dd>
          <dt>Aspect ratio</dt>
          <dd>{project.aspectRatio}</dd>
          <dt>Style</dt>
          <dd>{project.style}</dd>
          <dt>Scenes</dt>
          <dd>{scenes.length}</dd>
        </dl>
      </div>

      <div className="tab-row">
        <button className={`tab-btn ${tab === "prompts" ? "active" : ""}`} onClick={() => setTab("prompts")}>
          Prompts
        </button>
        <button className={`tab-btn ${tab === "assemble" ? "active" : ""}`} onClick={() => setTab("assemble")}>
          Upload &amp; Assemble
        </button>
        <button className={`tab-btn ${tab === "final" ? "active" : ""}`} onClick={() => setTab("final")}>
          Final Render
        </button>
      </div>

      {tab === "prompts" && (
        <>
          <PromptGeneratorPanel project={project} sending={sending} onUpdateConfig={props.onUpdateConfig} onGenerate={props.onGeneratePrompts} />
          <ScenePromptList
            projectId={project.id}
            mediaType={project.mediaType}
            scenes={scenes}
            sending={sending}
            onRegenerate={props.onRegenerateScenePrompt}
            onDelete={props.onDeleteScene}
            onMove={props.onMoveScene}
            onAddScenes={props.onAddScenes}
            onRefresh={props.onRefresh}
          />
        </>
      )}

      {tab === "assemble" && (
        <UploadAssemblePanel
          scenes={scenes}
          mediaLibrary={mediaLibrary}
          timeline={timeline}
          audioTracks={audioTracks}
          sending={sending}
          onUploadFiles={props.onUploadFiles}
          onUploadAudio={props.onUploadAudio}
          onAssignMedia={props.onAssignMedia}
          onRemoveTimelineItem={props.onRemoveTimelineItem}
          onReorderTimelineItem={props.onReorderTimelineItem}
          onPatchTimelineItem={props.onPatchTimelineItem}
          onAssemble={props.onAssemble}
        />
      )}

      {tab === "final" && <FinalRenderPanel project={project} latestRender={latestRender} />}
    </section>
  );
}

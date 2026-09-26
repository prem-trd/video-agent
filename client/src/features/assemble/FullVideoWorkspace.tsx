import type { AudioTrack, MediaAsset, Project, Render, Scene, TimelineItem } from "../../types/api";
import { ProjectInfoCard } from "../projects/ProjectInfoCard";
import { FinalRenderPanel } from "../render/FinalRenderPanel";
import { UploadAssemblePanel } from "./UploadAssemblePanel";

interface Props {
  project: Project;
  scenes: Scene[];
  mediaLibrary: MediaAsset[];
  timeline: TimelineItem[];
  audioTracks: AudioTrack[];
  latestRender: Render | null;
  sending: boolean;
  error: string | null;
  onUploadFiles: (files: File[]) => void;
  onUploadAudio: (kind: "NARRATION" | "MUSIC", file: File) => void;
  onAssignMedia: (mediaId: string, sceneNumber?: number) => void;
  onRemoveTimelineItem: (itemId: string) => void;
  onReorderTimelineItem: (itemId: string, ref: { beforeItemId?: string; afterItemId?: string }) => void;
  onPatchTimelineItem: (itemId: string, patch: { displayDurationSec?: number; fitMode?: string }) => void;
  onAssemble: () => void;
}

/** The "Generate Full Video" mode: upload the externally generated clips, arrange the timeline, assemble and review the final render. */
export function FullVideoWorkspace(props: Props) {
  const { project, scenes, latestRender } = props;

  return (
    <>
      <section className="preview-panel workspace-primary">
        {props.error && <div className="error-banner">{props.error}</div>}
        <UploadAssemblePanel
          scenes={scenes}
          mediaLibrary={props.mediaLibrary}
          timeline={props.timeline}
          audioTracks={props.audioTracks}
          sending={props.sending}
          onUploadFiles={props.onUploadFiles}
          onUploadAudio={props.onUploadAudio}
          onAssignMedia={props.onAssignMedia}
          onRemoveTimelineItem={props.onRemoveTimelineItem}
          onReorderTimelineItem={props.onReorderTimelineItem}
          onPatchTimelineItem={props.onPatchTimelineItem}
          onAssemble={props.onAssemble}
        />
      </section>
      <section className="preview-panel">
        <FinalRenderPanel project={project} latestRender={latestRender} sceneCount={scenes.length} />
        <ProjectInfoCard project={project} sceneCount={scenes.length} />
      </section>
    </>
  );
}

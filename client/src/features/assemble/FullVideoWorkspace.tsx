import type { AudioTrack, Channel, ChannelPatch, MediaAsset, Project, Render, Scene, TimelineItem } from "../../types/api";
import { BrandingPanel } from "./BrandingPanel";
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
  channel: Channel | null;
  channelConfigured: boolean;
  onToggleBranding: (patch: Partial<Pick<Project, "introEnabled" | "outroEnabled">>) => Promise<void>;
  onUploadBrandBackground: (file: File) => Promise<void>;
  onRemoveBrandBackground: () => Promise<void>;
  onUpdateChannel: (patch: ChannelPatch) => Promise<void>;
  onOpenChannelSettings: () => void;
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
        <BrandingPanel
          project={project}
          channel={props.channel}
          channelConfigured={props.channelConfigured}
          timeline={props.timeline}
          sending={props.sending}
          onToggle={props.onToggleBranding}
          onUploadBackground={props.onUploadBrandBackground}
          onRemoveBackground={props.onRemoveBrandBackground}
          onUpdateChannel={props.onUpdateChannel}
          onOpenChannelSettings={props.onOpenChannelSettings}
        />
        <ProjectInfoCard project={project} sceneCount={scenes.length} />
      </section>
    </>
  );
}

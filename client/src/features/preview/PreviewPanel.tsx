import type { Project, Scene } from "../../types/api";
import { ProjectInfoCard } from "../projects/ProjectInfoCard";
import { PromptGeneratorPanel } from "../promptgen/PromptGeneratorPanel";
import { ScenePromptList } from "../scenes/ScenePromptList";

interface Props {
  project: Project;
  scenes: Scene[];
  sending: boolean;
  onUpdateConfig: (patch: Partial<Project>) => Promise<void>;
  onGeneratePrompts: () => void;
  onRegenerateScenePrompt: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onMoveScene: (sceneId: string, ref: { beforeSceneNumber?: number; afterSceneNumber?: number }) => void;
  onAddScenes: (count: number) => void;
  onRefresh: () => void;
}

/** Right-hand column of the "Generate Prompts" mode: project summary, prompt settings and the per-scene prompt list. */
export function PreviewPanel(props: Props) {
  const { project, scenes, sending } = props;

  return (
    <section className="preview-panel">
      <ProjectInfoCard project={project} sceneCount={scenes.length} />
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
    </section>
  );
}

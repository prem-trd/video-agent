import type { Project } from "../../types/api";
import { StatusBadge } from "../../components/StatusBadge";

export function ProjectInfoCard({ project, sceneCount }: { project: Project; sceneCount: number }) {
  return (
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
        <dd>{sceneCount}</dd>
      </dl>
    </div>
  );
}

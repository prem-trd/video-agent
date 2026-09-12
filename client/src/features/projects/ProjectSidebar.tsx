import type { Project } from "../../types/api";
import { StatusBadge } from "../../components/StatusBadge";

interface Props {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewProject: () => void;
  onDelete: (id: string) => void;
}

export function ProjectSidebar({ projects, selectedId, onSelect, onNewProject, onDelete }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="new-project-btn" onClick={onNewProject}>
          + New Project
        </button>
      </div>
      <div className="project-list">
        <div className="project-list-label">Projects ({projects.length})</div>
        {projects.length === 0 && (
          <div style={{ padding: "10px 8px", fontSize: 12.5, color: "var(--text-dim)" }}>No projects yet - create one to get started.</div>
        )}
        {projects.map((p) => (
          <div key={p.id} className={`project-item ${p.id === selectedId ? "active" : ""}`} onClick={() => onSelect(p.id)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <span className="project-item-title">{p.title}</span>
              <button
                className="delete-btn"
                title="Delete project"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${p.title}"? This removes all its scenes, assets and files.`)) onDelete(p.id);
                }}
              >
                ✕
              </button>
            </div>
            <div className="project-item-meta">
              <StatusBadge status={p.status} />
              <span>
                {p.duration}s · {p.aspectRatio}
              </span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

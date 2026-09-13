import { useState } from "react";
import type { Project, Render } from "../../types/api";
import { api } from "../../services/api";

interface Props {
  project: Project;
  latestRender: Render | null;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VideoFrame({ project }: { project: Project }) {
  const [failed, setFailed] = useState(false);
  const src = `${api.videoUrl(project.id)}?t=${encodeURIComponent(project.updatedAt)}`;

  if (failed) {
    return (
      <div className="video-frame empty">
        <span>No video rendered yet</span>
        <span>Upload media and click "Assemble Video" in the Upload &amp; Assemble tab.</span>
      </div>
    );
  }

  return (
    <div className="video-frame">
      <video key={src} src={src} controls onError={() => setFailed(true)} />
    </div>
  );
}

export function FinalRenderPanel({ project, latestRender }: Props) {
  return (
    <div className="panel-card">
      <h3>Final Render</h3>
      <VideoFrame project={project} />

      {latestRender ? (
        <>
          <dl className="info-grid" style={{ marginTop: 12 }}>
            <dt>Status</dt>
            <dd>
              <span className={`badge status-${latestRender.status === "SUCCEEDED" ? "READY" : "FAILED"}`}>{latestRender.status}</span>
            </dd>
            <dt>Duration</dt>
            <dd>{latestRender.durationSec.toFixed(1)}s</dd>
            <dt>Resolution</dt>
            <dd>{latestRender.resolution || "—"}</dd>
            <dt>Aspect Ratio</dt>
            <dd>{latestRender.aspectRatio}</dd>
            <dt>Media Items</dt>
            <dd>{latestRender.mediaItemCount}</dd>
            <dt>File Size</dt>
            <dd>{formatBytes(latestRender.sizeBytes)}</dd>
            <dt>Audio</dt>
            <dd>{latestRender.hasAudio ? "Yes" : "None"}</dd>
            <dt>Subtitles</dt>
            <dd>{latestRender.hasSubtitles ? "Yes" : "None"}</dd>
          </dl>

          {latestRender.validationIssues.length > 0 && (
            <div className="error-banner" style={{ margin: "10px 0 0" }}>
              {latestRender.validationIssues.join(" ")}
            </div>
          )}

          {latestRender.status === "SUCCEEDED" && (
            <a className="btn-primary" style={{ display: "block", textAlign: "center", marginTop: 10, textDecoration: "none" }} href={api.videoUrl(project.id)} target="_blank" rel="noreferrer">
              Download Final Video
            </a>
          )}
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 10 }}>No assembly run yet.</div>
      )}
    </div>
  );
}

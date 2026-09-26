import { useState } from "react";
import type { Project, Render } from "../../types/api";
import { api } from "../../services/api";

interface Props {
  project: Project;
  latestRender: Render | null;
  sceneCount: number;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Remounted (via `key`) for every new render, so a load error from before the video existed doesn't stick. */
function VideoFrame({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="video-frame empty">
        <span>No video rendered yet</span>
        <span>Upload media and click "Assemble Video".</span>
      </div>
    );
  }

  return (
    <div className="video-frame">
      <video key={src} src={src} controls onError={() => setFailed(true)} />
    </div>
  );
}

export function FinalRenderPanel({ project, latestRender, sceneCount }: Props) {
  // Cache-bust per render: the URL is fixed, but its file is overwritten on every assembly.
  const version = latestRender?.id ?? project.updatedAt;
  const src = `${api.videoUrl(project.id)}?v=${encodeURIComponent(version)}`;

  return (
    <div className="panel-card">
      <h3>Final Render</h3>
      <VideoFrame key={src} src={src} />

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

          {latestRender.status === "SUCCEEDED" && sceneCount > 0 && latestRender.mediaItemCount < sceneCount && (
            <div className="mock-note" style={{ marginTop: 10 }}>
              Partial render: {latestRender.mediaItemCount} of {sceneCount} scenes ({latestRender.durationSec.toFixed(0)}s of the {project.duration}s target). Upload the remaining clips and assemble again for the full-length video.
            </div>
          )}

          {latestRender.validationIssues.length > 0 && (
            <div className="error-banner" style={{ margin: "10px 0 0" }}>
              {latestRender.validationIssues.join(" ")}
            </div>
          )}

          {latestRender.status === "SUCCEEDED" && (
            <a className="btn-primary" style={{ display: "block", textAlign: "center", marginTop: 10, textDecoration: "none" }} href={src} target="_blank" rel="noreferrer">
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

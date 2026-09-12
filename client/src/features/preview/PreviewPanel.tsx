import { useState } from "react";
import type { Asset, Project, Scene } from "../../types/api";
import { api } from "../../services/api";
import { StatusBadge } from "../../components/StatusBadge";

interface Props {
  project: Project;
  scenes: Scene[];
  assets: Asset[];
  sending: boolean;
  onGenerate: () => void;
  onRegenerateScene: (sceneId: string, type: "video" | "voice" | "image") => void;
  onActivateVersion: (sceneId: string, assetId: string) => void;
}

function VideoFrame({ project }: { project: Project }) {
  const [failed, setFailed] = useState(false);
  const src = `${api.videoUrl(project.id)}?t=${encodeURIComponent(project.updatedAt)}`;

  if (failed) {
    return (
      <div className="video-frame empty">
        <span>No video rendered yet</span>
        <span>Ask the agent to generate the video, or click "Generate Full Video" below.</span>
      </div>
    );
  }

  return (
    <div className="video-frame">
      {/* key forces a fresh <video> element (and reload) whenever the underlying file changes */}
      <video key={src} src={src} controls onError={() => setFailed(true)} />
    </div>
  );
}

// All four *_PROVIDER env vars default to "mock" (spec #46: never claim a
// mock asset is real AI-generated media). A per-asset `isMock` flag already
// exists in the Asset model for a future per-asset indicator; this banner
// is deliberately static until a dedicated provider-summary endpoint makes
// it worth wiring up dynamically.
const PROVIDERS_ARE_MOCK = true;

export function PreviewPanel({ project, scenes, assets, sending, onGenerate, onRegenerateScene, onActivateVersion }: Props) {
  const sceneAssetCount = (sceneId: string, type: string) => assets.filter((a) => a.sceneId === sceneId && a.type === type).length;
  const sceneVideoVersions = (sceneId: string) =>
    assets.filter((a) => a.sceneId === sceneId && a.type === "VIDEO").sort((a, b) => a.version - b.version);

  return (
    <section className="preview-panel">
      <VideoFrame project={project} />

      <button className="generate-btn" onClick={onGenerate} disabled={sending}>
        {sending ? "Working…" : "▶ Generate Full Video"}
      </button>

      {PROVIDERS_ARE_MOCK && (
        <div className="mock-note">⚠ Media providers: Mock / Development mode - no real AI image/video/voice/music API is being called.</div>
      )}

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
          <dt>Duration</dt>
          <dd>{project.duration}s</dd>
          <dt>Resolution</dt>
          <dd>{project.resolution}</dd>
          <dt>Aspect ratio</dt>
          <dd>{project.aspectRatio}</dd>
          <dt>FPS</dt>
          <dd>{project.fps}</dd>
          <dt>Style</dt>
          <dd>{project.style}</dd>
          <dt>Audience</dt>
          <dd>{project.audience}</dd>
          <dt>Scenes</dt>
          <dd>{scenes.length}</dd>
          <dt>Assets</dt>
          <dd>{assets.length}</dd>
        </dl>
      </div>

      {project.styleBible && (
        <div className="panel-card">
          <h3>Style Bible</h3>
          <dl className="info-grid">
            <dt>Style</dt>
            <dd>{project.styleBible.style}</dd>
            <dt>Lighting</dt>
            <dd>{project.styleBible.lighting}</dd>
            <dt>Camera</dt>
            <dd>{project.styleBible.camera}</dd>
            <dt>Environment</dt>
            <dd>{project.styleBible.environment}</dd>
          </dl>
        </div>
      )}

      {project.youtubeMeta && (
        <div className="panel-card">
          <h3>YouTube Metadata</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
            <div>
              <strong>{project.youtubeMeta.title}</strong>
            </div>
            <div style={{ color: "var(--text-dim)", whiteSpace: "pre-wrap" }}>{project.youtubeMeta.description}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {project.youtubeMeta.hashtags.map((h) => (
                <span key={h} className="badge status-READY">
                  {h}
                </span>
              ))}
            </div>
            <div style={{ color: "var(--text-dim)" }}>Tags: {project.youtubeMeta.tags.join(", ")}</div>
            {assets.some((a) => a.type === "THUMBNAIL") && (
              <img
                src={`${api.thumbnailUrl(project.id)}?t=${encodeURIComponent(project.updatedAt)}`}
                alt="Generated thumbnail"
                style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)" }}
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            )}
          </div>
        </div>
      )}

      <div className="panel-card">
        <h3>Scenes</h3>
        {scenes.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>No scenes yet.</div>
        ) : (
          <div className="scene-list">
            {scenes.map((s) => (
              <div key={s.id} className="scene-row">
                <div className="scene-row-top">
                  <strong>#{s.sceneNumber}</strong>
                  <StatusBadge status={s.status} />
                  <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>{s.duration}s</span>
                </div>
                <div className="scene-row-narration">{s.narration || "(no narration yet)"}</div>
                <div className="scene-actions">
                  <button
                    className="icon-btn"
                    disabled={sending || !s.videoPrompt}
                    title={s.videoPrompt || "Needs create_scene_plan first"}
                    onClick={() => onRegenerateScene(s.id, "video")}
                  >
                    {sceneAssetCount(s.id, "VIDEO") > 0 ? "↻ Video" : "▶ Video"}
                  </button>
                  <button
                    className="icon-btn"
                    disabled={sending || !s.narration}
                    onClick={() => onRegenerateScene(s.id, "voice")}
                  >
                    {sceneAssetCount(s.id, "VOICE") > 0 ? "↻ Voice" : "▶ Voice"}
                  </button>
                  {sceneVideoVersions(s.id).length > 1 && (
                    <select
                      className="icon-btn"
                      value={s.activeAssetId ?? ""}
                      disabled={sending}
                      title="Switch which generated version is active for assembly"
                      onChange={(e) => onActivateVersion(s.id, e.target.value)}
                    >
                      {sceneVideoVersions(s.id).map((v) => (
                        <option key={v.id} value={v.id}>
                          v{v.version}
                          {v.id === s.activeAssetId ? " (active)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

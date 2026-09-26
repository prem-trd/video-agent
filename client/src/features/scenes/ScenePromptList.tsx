import { useState } from "react";
import type { MediaType, PromptVersion, Scene } from "../../types/api";
import { api } from "../../services/api";
import { StatusBadge } from "../../components/StatusBadge";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";

interface Props {
  projectId: string;
  mediaType: MediaType;
  scenes: Scene[];
  sending: boolean;
  onRegenerate: (sceneId: string) => void;
  onDelete: (sceneId: string) => void;
  onMove: (sceneId: string, ref: { beforeSceneNumber?: number; afterSceneNumber?: number }) => void;
  onAddScenes: (count: number) => void;
  onRefresh: () => void;
}

function promptFor(scene: Scene, mediaType: MediaType) {
  return mediaType === "IMAGE" ? scene.imagePrompt : scene.videoPrompt || scene.imagePrompt;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function SceneVersions({ projectId, scene, onRestored }: { projectId: string; scene: Scene; onRestored: () => void }) {
  const [versions, setVersions] = useState<PromptVersion[] | null>(null);
  const [open, setOpen] = useState(false);

  async function toggle() {
    if (!open && !versions) {
      const v = await api.getPromptVersions(projectId, scene.id);
      setVersions(v);
    }
    setOpen(!open);
  }

  if (!open) {
    return (
      <button className="icon-btn" onClick={toggle}>
        Versions
      </button>
    );
  }

  return (
    <select
      className="icon-btn"
      defaultValue=""
      onChange={async (e) => {
        if (!e.target.value) return;
        await api.activatePromptVersion(projectId, scene.id, e.target.value);
        onRestored();
      }}
    >
      <option value="" disabled>
        {versions?.length ? `${versions.length} version(s)` : "No history yet"}
      </option>
      {versions?.map((v) => (
        <option key={v.id} value={v.id}>
          v{v.version}
          {v.isActive ? " (current)" : ""}
        </option>
      ))}
    </select>
  );
}

export function ScenePromptList({ projectId, mediaType, scenes, sending, onRegenerate, onDelete, onMove, onAddScenes, onRefresh }: Props) {
  const { copiedKey, copy } = useCopyToClipboard();
  const withPrompts = scenes.filter((s) => promptFor(s, mediaType));

  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <h3>Scenes / Prompts ({scenes.length})</h3>
        {withPrompts.length > 0 && (
          <button
            className={`copy-btn ${copiedKey === "all" ? "copied" : ""}`}
            title="Copy every scene's prompt, numbered, one per paragraph"
            onClick={() => copy("all", withPrompts.map((s) => `Scene ${s.sceneNumber}:\n${promptFor(s, mediaType)}`).join("\n\n"))}
          >
            {copiedKey === "all" ? "Copied ✓" : `Copy all (${withPrompts.length})`}
          </button>
        )}
      </div>
      {scenes.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>No scenes yet - use the Prompt Generator above, or ask the agent in chat.</div>
      ) : (
        <div className="scene-list">
          {scenes.map((s, i) => {
            const prompt = promptFor(s, mediaType);
            return (
              <div key={s.id} className="scene-row">
                <div className="scene-row-top">
                  <strong>#{s.sceneNumber}</strong>
                  <StatusBadge status={s.status} />
                  <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>
                    {formatTime(s.startTime)}–{formatTime(s.endTime)} ({s.duration}s)
                  </span>
                  {prompt && (
                    <button
                      className={`copy-btn ${copiedKey === s.id ? "copied" : ""}`}
                      title={`Copy scene #${s.sceneNumber}'s prompt`}
                      onClick={() => copy(s.id, prompt)}
                    >
                      {copiedKey === s.id ? "Copied ✓" : "Copy"}
                    </button>
                  )}
                </div>
                <div className="scene-row-narration" title={prompt} style={{ whiteSpace: "normal" }}>
                  {prompt || "(no prompt yet)"}
                </div>
                {(s.characters.length > 0 || s.environmentKey) && (
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {s.environmentKey && <span>📍 {s.environmentKey} </span>}
                    {s.characters.length > 0 && <span>👤 {s.characters.join(", ")}</span>}
                  </div>
                )}
                <div className="scene-actions">
                  <button className="icon-btn" disabled={sending} onClick={() => onRegenerate(s.id)}>
                    ↻ Regenerate
                  </button>
                  <button className="icon-btn" disabled={sending || i === 0} onClick={() => onMove(s.id, { beforeSceneNumber: scenes[i - 1]?.sceneNumber })}>
                    ↑
                  </button>
                  <button className="icon-btn" disabled={sending || i === scenes.length - 1} onClick={() => onMove(s.id, { afterSceneNumber: scenes[i + 1]?.sceneNumber })}>
                    ↓
                  </button>
                  <SceneVersions projectId={projectId} scene={s} onRestored={onRefresh} />
                  <button
                    className="icon-btn"
                    disabled={sending}
                    onClick={() => {
                      if (confirm(`Remove scene #${s.sceneNumber}?`)) onDelete(s.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button className="icon-btn" style={{ marginTop: 10, width: "100%" }} disabled={sending} onClick={() => onAddScenes(1)}>
        + Add Scene
      </button>
    </div>
  );
}

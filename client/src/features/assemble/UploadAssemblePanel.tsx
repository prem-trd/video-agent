import { useRef, useState } from "react";
import type { AudioTrack, MediaAsset, Scene, TimelineItem } from "../../types/api";

interface Props {
  scenes: Scene[];
  mediaLibrary: MediaAsset[];
  timeline: TimelineItem[];
  audioTracks: AudioTrack[];
  sending: boolean;
  onUploadFiles: (files: File[]) => void;
  onUploadAudio: (kind: "NARRATION" | "MUSIC", file: File) => void;
  onAssignMedia: (mediaId: string, sceneNumber?: number) => void;
  onRemoveTimelineItem: (itemId: string) => void;
  onReorderTimelineItem: (itemId: string, ref: { beforeItemId?: string; afterItemId?: string }) => void;
  onPatchTimelineItem: (itemId: string, patch: { displayDurationSec?: number; fitMode?: string }) => void;
  onAssemble: () => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Dropzone({ disabled, onFiles }: { disabled: boolean; onFiles: (files: File[]) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`dropzone ${dragOver ? "drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled && e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      }}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        style={{ display: "none" }}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <div>📁 Drop images/videos here, or click to browse</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>One file, many files, or a mix of images and videos</div>
    </div>
  );
}

export function UploadAssemblePanel({
  scenes,
  mediaLibrary,
  timeline,
  audioTracks,
  sending,
  onUploadFiles,
  onUploadAudio,
  onAssignMedia,
  onRemoveTimelineItem,
  onReorderTimelineItem,
  onPatchTimelineItem,
  onAssemble,
}: Props) {
  const timelineMediaIds = new Set(timeline.map((t) => t.mediaAssetId));
  const unmatched = mediaLibrary.filter((m) => m.type !== "AUDIO" && !timelineMediaIds.has(m.id));
  const narration = audioTracks.find((a) => a.kind === "NARRATION");
  const music = audioTracks.find((a) => a.kind === "MUSIC");

  return (
    <div className="panel-card">
      <h3>Upload &amp; Assemble</h3>

      <Dropzone disabled={sending} onFiles={onUploadFiles} />

      {unmatched.length > 0 && (
        <div className="media-grid">
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>Needs a scene ({unmatched.length}):</div>
          {unmatched.map((m) => (
            <div key={m.id} className="media-card">
              <span className="media-card-name" title={m.originalFilename}>
                {m.type === "IMAGE" ? "🖼" : "🎬"} {m.originalFilename}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {m.width}×{m.height} {m.durationSec ? `· ${m.durationSec.toFixed(1)}s` : ""} · {formatBytes(m.sizeBytes)}
              </span>
              <div className="inline-fields">
                <select
                  className="icon-btn"
                  defaultValue={m.matchedSceneNumber ?? ""}
                  disabled={sending}
                  onChange={(e) => e.target.value && onAssignMedia(m.id, Number(e.target.value))}
                >
                  <option value="" disabled>
                    Assign to scene…
                  </option>
                  {scenes.map((s) => (
                    <option key={s.id} value={s.sceneNumber}>
                      Scene #{s.sceneNumber}
                    </option>
                  ))}
                </select>
                <button className="icon-btn" disabled={sending} onClick={() => onAssignMedia(m.id)}>
                  Append
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>Timeline ({timeline.length})</h3>
      {timeline.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Nothing on the timeline yet - upload media above.</div>
      ) : (
        <div className="scene-list">
          {timeline.map((t, i) => (
            <div key={t.id} className="scene-row">
              <div className="scene-row-top">
                <strong>{t.sceneNumber ? `Scene #${t.sceneNumber}` : `#${i + 1}`}</strong>
                <span className="badge status-READY">{t.kind}</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>
                  {t.startTime.toFixed(1)}s–{t.endTime.toFixed(1)}s
                </span>
              </div>
              <div className="scene-row-narration">{t.mediaAsset?.originalFilename}</div>
              <div className="scene-actions">
                {t.kind === "IMAGE" && (
                  <input
                    type="number"
                    min={1}
                    className="icon-btn"
                    style={{ width: 60 }}
                    defaultValue={t.displayDurationSec ?? 5}
                    disabled={sending}
                    onBlur={(e) => onPatchTimelineItem(t.id, { displayDurationSec: Number(e.target.value) })}
                    title="Display duration (seconds)"
                  />
                )}
                <select
                  className="icon-btn"
                  defaultValue={t.fitMode}
                  disabled={sending}
                  onChange={(e) => onPatchTimelineItem(t.id, { fitMode: e.target.value })}
                  title="How to fit non-matching aspect ratio"
                >
                  <option value="FIT">Fit</option>
                  <option value="CROP">Crop</option>
                  <option value="BLUR_BACKGROUND">Blur Background</option>
                </select>
                {!t.sceneId && (
                  <>
                    <button className="icon-btn" disabled={sending || i === 0} onClick={() => onReorderTimelineItem(t.id, { beforeItemId: timeline[i - 1]?.id })}>
                      ↑
                    </button>
                    <button className="icon-btn" disabled={sending || i === timeline.length - 1} onClick={() => onReorderTimelineItem(t.id, { afterItemId: timeline[i + 1]?.id })}>
                      ↓
                    </button>
                  </>
                )}
                <button className="icon-btn" disabled={sending} onClick={() => onRemoveTimelineItem(t.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>Audio (optional)</h3>
      <div className="form-grid">
        <div className="form-row">
          <label>Narration {narration ? `— ${narration.originalFilename}` : "(none uploaded)"}</label>
          <input type="file" accept="audio/*" disabled={sending} onChange={(e) => e.target.files?.[0] && onUploadAudio("NARRATION", e.target.files[0])} />
        </div>
        <div className="form-row">
          <label>Music {music ? `— ${music.originalFilename}` : "(none uploaded)"}</label>
          <input type="file" accept="audio/*" disabled={sending} onChange={(e) => e.target.files?.[0] && onUploadAudio("MUSIC", e.target.files[0])} />
        </div>
      </div>

      <button className="generate-btn" style={{ marginTop: 10 }} disabled={sending || timeline.length === 0} onClick={onAssemble}>
        {sending ? "Working…" : "▶ Assemble Video"}
      </button>
    </div>
  );
}

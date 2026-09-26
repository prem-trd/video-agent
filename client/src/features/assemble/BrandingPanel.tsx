import { useState } from "react";
import { api } from "../../services/api";
import type { Channel, ChannelPatch, Project, TimelineItem } from "../../types/api";
import { WatermarkEditor } from "./WatermarkEditor";

interface Props {
  project: Project;
  channel: Channel | null;
  channelConfigured: boolean;
  timeline: TimelineItem[];
  sending: boolean;
  onToggle: (patch: Partial<Pick<Project, "introEnabled" | "outroEnabled">>) => Promise<void>;
  onUploadBackground: (file: File) => Promise<void>;
  onRemoveBackground: () => Promise<void>;
  onUpdateChannel: (patch: ChannelPatch) => Promise<void>;
  onOpenChannelSettings: () => void;
}

/** Matches the server's circle-close hand-over from the opening screen into the first clip. */
const OPENING_TRANSITION_SEC = 0.5;

type PreviewKind = "intro" | "watermark" | "outro";

/** Previews are rendered server-side (a few seconds each), so they're loaded on request rather than on every change. */
function Previews({ project, channel, timeline }: { project: Project; channel: Channel; timeline: TimelineItem[] }) {
  const [version, setVersion] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  function refresh() {
    setLoaded({});
    setFailed({});
    setVersion(`${project.updatedAt}-${channel.updatedAt}-${timeline[0]?.id ?? ""}-${Date.now()}`);
  }

  if (!version) {
    return (
      <button className="icon-btn" style={{ width: "100%", marginTop: 10 }} onClick={refresh}>
        👁 Preview opening, watermark &amp; end screen
      </button>
    );
  }

  const kinds: { kind: PreviewKind; label: string }[] = [
    ...(project.introEnabled ? [{ kind: "intro" as const, label: "Opening" }] : []),
    ...(channel.watermarkEnabled && timeline.some((t) => t.kind === "VIDEO") ? [{ kind: "watermark" as const, label: "Watermark on your first clip" }] : []),
    ...(project.outroEnabled ? [{ kind: "outro" as const, label: "End screen" }] : []),
  ];

  return (
    <div className="brand-previews">
      {kinds.map(({ kind, label }) => (
        <figure key={kind} className="brand-preview">
          <div className="brand-preview-frame">
            {!loaded[kind] && !failed[kind] && <span className="spinner" />}
            {failed[kind] ? (
              <span className="field-hint">Preview failed</span>
            ) : (
              <img
                src={api.brandPreviewUrl(project.id, kind, version)}
                alt={`${label} preview`}
                style={{ opacity: loaded[kind] ? 1 : 0 }}
                onLoad={() => setLoaded((l) => ({ ...l, [kind]: true }))}
                onError={() => setFailed((f) => ({ ...f, [kind]: true }))}
              />
            )}
          </div>
          <figcaption>{label}</figcaption>
        </figure>
      ))}
      <button className="icon-btn" onClick={refresh}>
        ↻ Refresh preview
      </button>
    </div>
  );
}

export function BrandingPanel({ project, channel, channelConfigured, timeline, sending, onToggle, onUploadBackground, onRemoveBackground, onUpdateChannel, onOpenChannelSettings }: Props) {
  const [expanded, setExpanded] = useState(false);
  const frameKey = `${timeline[0]?.id ?? "none"}-${project.hasBrandBackground}`;
  const clipsSec = timeline.reduce((max, t) => Math.max(max, t.endTime), 0);
  const introSec = channelConfigured && project.introEnabled ? (channel?.introDurationSec ?? 0) - OPENING_TRANSITION_SEC : 0;
  const outroSec = channelConfigured && project.outroEnabled ? channel?.outroDurationSec ?? 0 : 0;

  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <h3>Opening &amp; End Screen</h3>
        <button className="icon-btn" onClick={onOpenChannelSettings}>
          Channel settings
        </button>
      </div>

      {!channelConfigured || !channel ? (
        <div className="mock-note" style={{ marginTop: 0 }}>
          Add your channel logo (and music, end-screen logo and voice) in Channel settings to get opening and end screens on your videos.
        </div>
      ) : (
        <>
          <div className="brand-toggles">
            <label className="radio-option">
              <input type="checkbox" checked={project.introEnabled} disabled={sending} onChange={(e) => onToggle({ introEnabled: e.target.checked })} />
              Opening screen ({channel.introDurationSec}s)
            </label>
            <label className="radio-option">
              <input type="checkbox" checked={project.outroEnabled} disabled={sending} onChange={(e) => onToggle({ outroEnabled: e.target.checked })} />
              End screen ({channel.outroDurationSec}s)
            </label>
          </div>

          <div className="form-row" style={{ marginTop: 12 }}>
            <label>Opening background for this video</label>
            <div className="brand-file-row">
              {project.hasBrandBackground ? (
                <img className="brand-bg-thumb" src={api.brandBackgroundUrl(project.id, project.updatedAt)} alt="Background" />
              ) : (
                <div className="brand-bg-thumb empty">Blurred clip frame</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <input type="file" accept=".png,.jpg,.jpeg,.webp" disabled={sending} onChange={(e) => e.target.files?.[0] && onUploadBackground(e.target.files[0])} />
                {project.hasBrandBackground && (
                  <button className="icon-btn" style={{ alignSelf: "flex-start" }} disabled={sending} onClick={onRemoveBackground}>
                    Remove
                  </button>
                )}
              </div>
            </div>
            {!project.hasBrandBackground && (
              <span className="field-hint">Get a matching image prompt under Generate Prompts → Opening / End Screen Background.</span>
            )}
          </div>

          <div className="watermark-controls">
            <label className="radio-option">
              <input type="checkbox" checked={channel.watermarkEnabled} onChange={(e) => onUpdateChannel({ watermarkEnabled: e.target.checked })} />
              Logo watermark during the video
            </label>
            {channel.watermarkEnabled && channel.hasLogo && !expanded && (
              <>
                <WatermarkEditor key={channel.id} project={project} channel={channel} frameKey={frameKey} onUpdate={onUpdateChannel} />
                <button className="icon-btn" style={{ width: "100%", marginTop: 8 }} onClick={() => setExpanded(true)}>
                  ⤢ Larger view
                </button>
              </>
            )}
          </div>

          {expanded && channel.watermarkEnabled && channel.hasLogo && (
            <div className="modal-backdrop" onClick={() => setExpanded(false)}>
              <div className="modal wm-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Place your logo</h2>
                <p className="modal-sub">Drag to move · scroll or pinch over the logo (or drag its corner) to resize. Saved automatically.</p>
                <WatermarkEditor key={`${channel.id}-large`} project={project} channel={channel} frameKey={frameKey} onUpdate={onUpdateChannel} />
                <div className="modal-actions">
                  <button className="btn-primary" onClick={() => setExpanded(false)}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="calc-summary" style={{ marginBottom: 0 }}>
            <span>
              Final length ≈ <strong>{(introSec + clipsSec + outroSec).toFixed(0)}s</strong>
            </span>
            <span>
              {channel.introDurationSec}s opening + {clipsSec.toFixed(0)}s clips + {outroSec}s end
            </span>
          </div>

          <Previews project={project} channel={channel} timeline={timeline} />
        </>
      )}
    </div>
  );
}

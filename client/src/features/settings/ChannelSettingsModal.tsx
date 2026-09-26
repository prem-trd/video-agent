import { useState } from "react";
import { api } from "../../services/api";
import type { Channel, ChannelFileKind, ChannelPatch } from "../../types/api";

interface Props {
  channel: Channel;
  onSave: (patch: ChannelPatch) => Promise<void>;
  onUploadFile: (kind: ChannelFileKind, file: File) => Promise<void>;
  onRemoveFile: (kind: ChannelFileKind) => Promise<void>;
  onClose: () => void;
}

/** One uploadable channel file: preview (image thumbnail / audio player), replace, remove. */
function FileField({
  label,
  kind,
  present,
  fileName,
  accept,
  preview,
  channel,
  busy,
  onUpload,
  onRemove,
  hint,
}: {
  label: string;
  kind: ChannelFileKind;
  present: boolean;
  fileName?: string;
  accept: string;
  preview: "image" | "audio" | "none";
  channel: Channel;
  busy: boolean;
  onUpload: (kind: ChannelFileKind, file: File) => void;
  onRemove: (kind: ChannelFileKind) => void;
  hint?: string;
}) {
  const url = api.channelFileUrl(kind, channel.updatedAt);
  return (
    <div className="form-row">
      <label>
        {label}
        {fileName ? ` — ${fileName}` : ""}
      </label>
      <div className="brand-file-row">
        {preview === "image" && (present ? <img className="brand-logo-thumb" src={url} alt={label} /> : <div className="brand-logo-thumb empty">None</div>)}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          {preview === "audio" && present && <audio className="brand-audio" src={url} controls preload="none" />}
          <input type="file" accept={accept} disabled={busy} onChange={(e) => e.target.files?.[0] && onUpload(kind, e.target.files[0])} />
        </div>
        {present && (
          <button className="icon-btn" disabled={busy} onClick={() => onRemove(kind)}>
            Remove
          </button>
        )}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

/** Channel branding shared by every video: opening screen, end screen and the logo watermark. */
export function ChannelSettingsModal({ channel, onSave, onUploadFile, onRemoveFile, onClose }: Props) {
  const [name, setName] = useState(channel.name);
  const [openingText, setOpeningText] = useState(channel.openingText);
  const [textColor, setTextColor] = useState(channel.textColor);
  const [introSec, setIntroSec] = useState(channel.introDurationSec);
  const [outroSec, setOutroSec] = useState(channel.outroDurationSec);
  const [showTitle, setShowTitle] = useState(channel.showTitleOnIntro);
  const [musicVolume, setMusicVolume] = useState(channel.musicVolume);
  const [endBackground, setEndBackground] = useState(channel.endBackground);
  const [watermarkEnabled, setWatermarkEnabled] = useState(channel.watermarkEnabled);
  const [watermarkOpacity, setWatermarkOpacity] = useState(channel.watermarkOpacity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const ok = await run(() =>
      onSave({
        name: name.trim(),
        openingText: openingText.trim(),
        textColor,
        introDurationSec: introSec,
        outroDurationSec: outroSec,
        showTitleOnIntro: showTitle,
        musicVolume,
        endBackground,
        watermarkEnabled,
        watermarkOpacity,
      })
    );
    if (ok) onClose();
  }

  const fileProps = {
    channel,
    busy,
    onUpload: (kind: ChannelFileKind, file: File) => run(() => onUploadFile(kind, file)),
    onRemove: (kind: ChannelFileKind) => run(() => onRemoveFile(kind)),
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Channel</h2>
        <p className="modal-sub">Shared by every video. Only the opening background changes per video (upload it in Generate Full Video).</p>

        <div className="form-row">
          <label>Channel name</label>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Little Baby First Talk" />
        </div>

        <h3 className="modal-section">Opening screen</h3>
        <FileField {...fileProps} label="Logo" kind="logo" present={channel.hasLogo} accept=".png,.jpg,.jpeg,.webp" preview="image" hint="Pops in and pulses on the opening; also used as the watermark. A transparent PNG works best." />
        <FileField {...fileProps} label="Music" kind="openingMusic" present={Boolean(channel.openingMusicName)} fileName={channel.openingMusicName} accept="audio/*" preview="audio" />
        <div className="form-grid">
          <div className="form-row">
            <label>Text before the logo</label>
            <input value={openingText} maxLength={40} onChange={(e) => setOpeningText(e.target.value)} placeholder="Welcome to (empty = none)" />
          </div>
          <div className="form-row">
            <label>Text colour</label>
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value.toUpperCase())} style={{ height: 38, padding: 4 }} />
          </div>
          <div className="form-row">
            <label>Length (seconds)</label>
            <input type="number" min={2} max={15} step={0.5} value={introSec} onChange={(e) => setIntroSec(Number(e.target.value))} />
          </div>
          <div className="form-row">
            <label>Music volume — {Math.round(musicVolume * 100)}%</label>
            <input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))} />
          </div>
        </div>
        <FileField {...fileProps} label="Font for the text (optional)" kind="font" present={Boolean(channel.fontName)} fileName={channel.fontName || "Georgia Bold"} accept=".ttf,.otf" preview="none" />
        <label className="radio-option">
          <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} />
          Also show the video title under the logo
        </label>

        <h3 className="modal-section">End screen</h3>
        <FileField {...fileProps} label="Wide logo" kind="endLogo" present={channel.hasEndLogo} accept=".png,.jpg,.jpeg,.webp" preview="image" hint="Revealed with a left-to-right wipe. Falls back to the opening logo." />
        <FileField {...fileProps} label="Voice / audio" kind="endAudio" present={Boolean(channel.endAudioName)} fileName={channel.endAudioName} accept="audio/*" preview="audio" hint="Plays over a soft bed of the opening music." />
        <div className="form-grid">
          <div className="form-row">
            <label>Background</label>
            <select value={endBackground} onChange={(e) => setEndBackground(e.target.value as Channel["endBackground"])}>
              <option value="WHITE">Plain white</option>
              <option value="VIDEO">This video's opening background</option>
            </select>
          </div>
          <div className="form-row">
            <label>Length (seconds)</label>
            <input type="number" min={5} max={20} step={0.5} value={outroSec} onChange={(e) => setOutroSec(Number(e.target.value))} />
            <span className="field-hint">5–20s: YouTube end-screen elements need the last 5–20 seconds.</span>
          </div>
        </div>

        <h3 className="modal-section">Buttons</h3>
        <p className="field-hint" style={{ marginTop: -4 }}>
          Shown on the opening and end screens. A white background around the button is removed automatically. Remove one to use the built-in button.
        </p>
        <div className="brand-buttons-grid">
          <FileField {...fileProps} label="Like" kind="likeButton" present={channel.hasLikeButton} accept=".png,.jpg,.jpeg,.webp" preview="image" />
          <FileField {...fileProps} label="Share" kind="shareButton" present={channel.hasShareButton} accept=".png,.jpg,.jpeg,.webp" preview="image" />
          <FileField {...fileProps} label="Subscribe" kind="subscribeButton" present={channel.hasSubscribeButton} accept=".png,.jpg,.jpeg,.webp" preview="image" />
        </div>

        <h3 className="modal-section">Logo watermark during the video</h3>
        <label className="radio-option">
          <input type="checkbox" checked={watermarkEnabled} onChange={(e) => setWatermarkEnabled(e.target.checked)} />
          Show the logo over the video after the opening screen
        </label>
        {watermarkEnabled && (
          <div className="form-grid" style={{ marginTop: 8 }}>
            <span className="field-hint" style={{ gridColumn: "1 / -1" }}>
              Drag and zoom the logo on your video in Generate Full Video → Opening &amp; End Screen.
            </span>
            <div className="form-row">
              <label>Opacity — {Math.round(watermarkOpacity * 100)}%</label>
              <input type="range" min={0.1} max={1} step={0.05} value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(Number(e.target.value))} />
            </div>
          </div>
        )}

        {error && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

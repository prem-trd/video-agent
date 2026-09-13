import { useEffect, useState } from "react";
import type { AspectRatio, MediaType, Project } from "../../types/api";

interface Props {
  project: Project;
  sending: boolean;
  onUpdateConfig: (patch: Partial<Project>) => Promise<void>;
  onGenerate: () => void;
}

const ASPECTS: AspectRatio[] = ["16:9", "4:3", "1:1", "9:16"];
const CLIP_DURATIONS = [5, 6, 8, 10, 15, 20];
const IMAGE_DURATIONS = [3, 4, 5, 6, 8, 10];
const STYLES = ["3D Cartoon", "Realistic", "2D Cartoon", "Cinematic", "Anime", "Watercolor"];
const AUDIENCES = ["Preschool", "Kids", "General", "Educational", "Teens", "Adults"];

function isCustom(value: number, options: number[]) {
  return !options.includes(value);
}

/** The prompt configuration panel: topic, duration, media type, clip/image duration, style, audience, etc. */
export function PromptGeneratorPanel({ project, sending, onUpdateConfig, onGenerate }: Props) {
  const [topic, setTopic] = useState(project.topic);
  const [durationValue, setDurationValue] = useState(project.duration >= 60 ? Math.round((project.duration / 60) * 100) / 100 : project.duration);
  const [durationUnit, setDurationUnit] = useState<"seconds" | "minutes">(project.duration >= 60 && project.duration % 60 === 0 ? "minutes" : "seconds");
  const [mediaType, setMediaType] = useState<MediaType>(project.mediaType);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(project.aspectRatio);
  const [clipDurationSec, setClipDurationSec] = useState(project.clipDurationSec);
  const [clipCustom, setClipCustom] = useState(isCustom(project.clipDurationSec, CLIP_DURATIONS));
  const [imageDurationSec, setImageDurationSec] = useState(project.imageDurationSec);
  const [imageCustom, setImageCustom] = useState(isCustom(project.imageDurationSec, IMAGE_DURATIONS));
  const [style, setStyle] = useState(project.style);
  const [styleCustom, setStyleCustom] = useState(!STYLES.includes(project.style));
  const [audience, setAudience] = useState(project.audience);
  const [audienceCustom, setAudienceCustom] = useState(!AUDIENCES.includes(project.audience));
  const [language, setLanguage] = useState(project.language);
  const [narrationRequired, setNarrationRequired] = useState(project.narrationRequired);
  const [musicRequired, setMusicRequired] = useState(project.musicRequired);
  const [saving, setSaving] = useState(false);

  // Re-sync local form state when a different project is selected.
  useEffect(() => {
    setTopic(project.topic);
    setDurationValue(project.duration >= 60 && project.duration % 60 === 0 ? project.duration / 60 : project.duration);
    setDurationUnit(project.duration >= 60 && project.duration % 60 === 0 ? "minutes" : "seconds");
    setMediaType(project.mediaType);
    setAspectRatio(project.aspectRatio);
    setClipDurationSec(project.clipDurationSec);
    setClipCustom(isCustom(project.clipDurationSec, CLIP_DURATIONS));
    setImageDurationSec(project.imageDurationSec);
    setImageCustom(isCustom(project.imageDurationSec, IMAGE_DURATIONS));
    setStyle(project.style);
    setStyleCustom(!STYLES.includes(project.style));
    setAudience(project.audience);
    setAudienceCustom(!AUDIENCES.includes(project.audience));
    setLanguage(project.language);
    setNarrationRequired(project.narrationRequired);
    setMusicRequired(project.musicRequired);
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const targetDurationSec = Math.round(durationUnit === "minutes" ? durationValue * 60 : durationValue);
  const perSceneDuration = mediaType === "IMAGE" ? imageDurationSec : clipDurationSec;
  const requiredScenes = perSceneDuration > 0 ? Math.max(1, Math.ceil(targetDurationSec / perSceneDuration)) : 0;

  async function handleGenerate() {
    setSaving(true);
    try {
      await onUpdateConfig({
        topic,
        duration: targetDurationSec,
        mediaType,
        aspectRatio,
        clipDurationSec,
        imageDurationSec,
        style,
        audience,
        language,
        narrationRequired,
        musicRequired,
      });
      onGenerate();
    } finally {
      setSaving(false);
    }
  }

  const disabled = sending || saving;

  return (
    <div className="panel-card promptgen">
      <h3>Create Prompts</h3>

      <div className="form-row">
        <label>Topic</label>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="ABC with Farm Animals" disabled={disabled} />
      </div>

      <div className="form-row">
        <label>Target Duration</label>
        <div className="inline-fields">
          <input type="number" min={1} value={durationValue} onChange={(e) => setDurationValue(Number(e.target.value))} disabled={disabled} style={{ width: 90 }} />
          <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as "seconds" | "minutes")} disabled={disabled}>
            <option value="seconds">seconds</option>
            <option value="minutes">minutes</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <label>Media Type</label>
        <div className="radio-row">
          <label className="radio-option">
            <input type="radio" checked={mediaType === "VIDEO"} onChange={() => setMediaType("VIDEO")} disabled={disabled} /> Video
          </label>
          <label className="radio-option">
            <input type="radio" checked={mediaType === "IMAGE"} onChange={() => setMediaType("IMAGE")} disabled={disabled} /> Image
          </label>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Aspect Ratio</label>
          <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} disabled={disabled}>
            {ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {mediaType === "VIDEO" ? (
          <div className="form-row">
            <label>Video Clip Duration</label>
            {clipCustom ? (
              <div className="inline-fields">
                <input type="number" min={1} value={clipDurationSec} onChange={(e) => setClipDurationSec(Number(e.target.value))} disabled={disabled} />
                <button type="button" className="icon-btn" onClick={() => setClipCustom(false)} disabled={disabled}>
                  Presets
                </button>
              </div>
            ) : (
              <select
                value={clipDurationSec}
                onChange={(e) => (e.target.value === "custom" ? setClipCustom(true) : setClipDurationSec(Number(e.target.value)))}
                disabled={disabled}
              >
                {CLIP_DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} seconds
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            )}
          </div>
        ) : (
          <div className="form-row">
            <label>Image Display Duration</label>
            {imageCustom ? (
              <div className="inline-fields">
                <input type="number" min={1} value={imageDurationSec} onChange={(e) => setImageDurationSec(Number(e.target.value))} disabled={disabled} />
                <button type="button" className="icon-btn" onClick={() => setImageCustom(false)} disabled={disabled}>
                  Presets
                </button>
              </div>
            ) : (
              <select
                value={imageDurationSec}
                onChange={(e) => (e.target.value === "custom" ? setImageCustom(true) : setImageDurationSec(Number(e.target.value)))}
                disabled={disabled}
              >
                {IMAGE_DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} seconds
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            )}
          </div>
        )}
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Visual Style</label>
          {styleCustom ? (
            <div className="inline-fields">
              <input value={style} onChange={(e) => setStyle(e.target.value)} disabled={disabled} />
              <button type="button" className="icon-btn" onClick={() => setStyleCustom(false)} disabled={disabled}>
                Presets
              </button>
            </div>
          ) : (
            <select value={style} onChange={(e) => (e.target.value === "custom" ? setStyleCustom(true) : setStyle(e.target.value))} disabled={disabled}>
              {STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          )}
        </div>

        <div className="form-row">
          <label>Audience</label>
          {audienceCustom ? (
            <div className="inline-fields">
              <input value={audience} onChange={(e) => setAudience(e.target.value)} disabled={disabled} />
              <button type="button" className="icon-btn" onClick={() => setAudienceCustom(false)} disabled={disabled}>
                Presets
              </button>
            </div>
          ) : (
            <select value={audience} onChange={(e) => (e.target.value === "custom" ? setAudienceCustom(true) : setAudience(e.target.value))} disabled={disabled}>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          )}
        </div>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Language</label>
          <input value={language} onChange={(e) => setLanguage(e.target.value)} disabled={disabled} />
        </div>
        <div className="form-row">
          <label>Optional</label>
          <div className="radio-row">
            <label className="radio-option">
              <input type="checkbox" checked={narrationRequired} onChange={(e) => setNarrationRequired(e.target.checked)} disabled={disabled} /> Narration
            </label>
            <label className="radio-option">
              <input type="checkbox" checked={musicRequired} onChange={(e) => setMusicRequired(e.target.checked)} disabled={disabled} /> Music
            </label>
          </div>
        </div>
      </div>

      <div className="calc-summary">
        <span>
          Target Duration: <strong>{durationUnit === "minutes" ? `${durationValue}m` : `${durationValue}s`}</strong>
        </span>
        <span>
          {mediaType === "IMAGE" ? "Image Duration" : "Clip Duration"}: <strong>{perSceneDuration}s</strong>
        </span>
        <span>
          Required Scenes: <strong>{requiredScenes}</strong>
        </span>
      </div>

      <button className="generate-btn" onClick={handleGenerate} disabled={disabled || !topic.trim()}>
        {disabled ? "Working…" : "Generate Prompts"}
      </button>
    </div>
  );
}

import { useState } from "react";
import type { AspectRatio, MediaType } from "../../types/api";

export interface NewProjectSubmission {
  mode: "structured" | "prompt";
  structured?: {
    title: string;
    topic: string;
    duration: number;
    mediaType: MediaType;
    aspectRatio: AspectRatio;
  };
  prompt?: string;
}

interface Props {
  onCancel: () => void;
  onSubmit: (submission: NewProjectSubmission) => void;
  submitting: boolean;
}

const ASPECT_PRESETS: { label: string; value: AspectRatio; hint: string }[] = [
  { label: "Landscape", value: "16:9", hint: "1920x1080" },
  { label: "Portrait / Shorts", value: "9:16", hint: "1080x1920" },
  { label: "Square", value: "1:1", hint: "1080x1080" },
  { label: "Classic 4:3", value: "4:3", hint: "1440x1080" },
];

// Pre-filled "Describe it" text - a complete request (topic + items,
// audience, narration + presenter, style, clip length, aspect,
// scene layout) so a new video only needs the topic lines edited. No
// duration: analyze_request derives it from the item count. The
// presenter is an adult + animal mascot on purpose: a young child presenter
// combined with topics like body parts trips video generators' minor-safety
// filters.
const DEFAULT_PROMPT =
  "Create an educational kids video about body parts: Head, Eyes, Nose, Mouth, Ears, Hands, Legs, Feet. " +
  "For preschool kids aged 2-5. " +
  "Narration required, spoken by a cheerful grown-up woman teacher with curly brown hair, a bright yellow t-shirt and blue overalls, " +
  "who points to each part on herself. A friendly white bunny mascot with a blue bow tie appears only in the intro and goodbye. " +
  "3D Cartoon Pixar style, bright classroom. " +
  "10-second clips, 16:9. " +
  "One body part per scene, with an intro scene and a goodbye scene at the end.";

/**
 * Minimal project creation - just enough to get a project id. Full prompt
 * configuration (clip/image duration, style, audience, narration/music,
 * etc) lives in PromptGeneratorPanel, not duplicated here.
 */
export function NewProjectModal({ onCancel, onSubmit, submitting }: Props) {
  const [mode, setMode] = useState<"structured" | "prompt">("prompt");

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(60);
  const [mediaType, setMediaType] = useState<MediaType>("VIDEO");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  function handleSubmit() {
    if (mode === "structured") {
      if (!title.trim() || !topic.trim()) return;
      onSubmit({ mode, structured: { title, topic, duration, mediaType, aspectRatio } });
    } else {
      if (!prompt.trim()) return;
      onSubmit({ mode, prompt });
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New Project</h2>
        <p className="modal-sub">Describe what you want, or fill in the basics yourself - you'll configure prompt generation in detail next.</p>

        <div className="tab-row">
          <button className={`tab-btn ${mode === "prompt" ? "active" : ""}`} onClick={() => setMode("prompt")}>
            Describe it
          </button>
          <button className={`tab-btn ${mode === "structured" ? "active" : ""}`} onClick={() => setMode("structured")}>
            Fill in basics
          </button>
        </div>

        {mode === "prompt" ? (
          <div className="form-row">
            <label>What do you want to make?</label>
            <textarea rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Create a 5 minute ABC with Farm Animals video for preschool kids." />
          </div>
        ) : (
          <>
            <div className="form-row">
              <label>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ABC with Farm Animals" />
            </div>
            <div className="form-row">
              <label>Topic</label>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Teach the alphabet using farm animals" />
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>Target duration (seconds)</label>
                <input type="number" min={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
              </div>
              <div className="form-row">
                <label>Media type</label>
                <select value={mediaType} onChange={(e) => setMediaType(e.target.value as MediaType)}>
                  <option value="VIDEO">Video</option>
                  <option value="IMAGE">Image</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <label>Aspect ratio</label>
              <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}>
                {ASPECT_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} ({p.value} · {p.hint})
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

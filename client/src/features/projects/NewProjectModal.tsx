import { useState } from "react";
import type { AspectRatio } from "../../types/api";

export interface NewProjectSubmission {
  mode: "structured" | "prompt";
  structured?: {
    title: string;
    topic: string;
    duration: number;
    style: string;
    audience: string;
    language: string;
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
  { label: "YouTube Landscape", value: "16:9", hint: "1920x1080" },
  { label: "YouTube Shorts", value: "9:16", hint: "1080x1920" },
  { label: "Square Social", value: "1:1", hint: "1080x1080" },
];

export function NewProjectModal({ onCancel, onSubmit, submitting }: Props) {
  const [mode, setMode] = useState<"structured" | "prompt">("prompt");

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(60);
  const [style, setStyle] = useState("3D Cartoon");
  const [audience, setAudience] = useState("Preschool");
  const [language, setLanguage] = useState("English");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");

  const [prompt, setPrompt] = useState("Create a 60-second video teaching the alphabet with cute farm animals.");

  function handleSubmit() {
    if (mode === "structured") {
      if (!title.trim() || !topic.trim()) return;
      onSubmit({ mode, structured: { title, topic, duration, style, audience, language, aspectRatio } });
    } else {
      if (!prompt.trim()) return;
      onSubmit({ mode, prompt });
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New Project</h2>
        <p className="modal-sub">Describe your video, or fill in the details yourself.</p>

        <div className="tab-row">
          <button className={`tab-btn ${mode === "prompt" ? "active" : ""}`} onClick={() => setMode("prompt")}>
            Create from prompt
          </button>
          <button className={`tab-btn ${mode === "structured" ? "active" : ""}`} onClick={() => setMode("structured")}>
            Structured form
          </button>
        </div>

        {mode === "prompt" ? (
          <div className="form-row">
            <label>What do you want to make?</label>
            <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Create a 45 second educational video about numbers 1 to 20 for preschool children." />
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
                <label>Duration (seconds)</label>
                <input type="number" min={5} max={600} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
              </div>
              <div className="form-row">
                <label>Style</label>
                <input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="3D Cartoon" />
              </div>
              <div className="form-row">
                <label>Audience</label>
                <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Preschool" />
              </div>
              <div className="form-row">
                <label>Language</label>
                <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="English" />
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

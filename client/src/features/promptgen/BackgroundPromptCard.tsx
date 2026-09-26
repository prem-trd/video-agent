import type { Project } from "../../types/api";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";

interface Props {
  project: Project;
  sending: boolean;
  onGenerate: () => void;
}

/** The opening/end screen background prompt - generate the image elsewhere, then upload it under Generate Full Video. */
export function BackgroundPromptCard({ project, sending, onGenerate }: Props) {
  const { copiedKey, copy } = useCopyToClipboard();
  const prompt = project.brandBackgroundPrompt;

  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <h3>Opening / End Screen Background</h3>
        {prompt && (
          <button className={`copy-btn ${copiedKey === "bg" ? "copied" : ""}`} onClick={() => copy("bg", prompt)}>
            {copiedKey === "bg" ? "Copied ✓" : "Copy"}
          </button>
        )}
      </div>
      {prompt ? (
        <div className="scene-row-narration" style={{ whiteSpace: "normal", fontSize: 12.5 }}>
          {prompt}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
          One image prompt for this video's opening and end screen background. Your channel logo, name and the video title are added on top when the video is assembled.
        </div>
      )}
      <div className="field-hint" style={{ marginTop: 8 }}>
        Generate the image on your usual platform, then upload it in Generate Full Video → Opening &amp; End Screen.
      </div>
      <button className="icon-btn" style={{ marginTop: 10 }} disabled={sending} onClick={onGenerate}>
        {prompt ? "↻ Regenerate" : "✨ Generate background prompt"}
      </button>
    </div>
  );
}

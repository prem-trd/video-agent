export type WorkspaceMode = "prompts" | "video";

const MODES: { value: WorkspaceMode; label: string; short: string }[] = [
  { value: "prompts", label: "Generate Prompts", short: "Prompts" },
  { value: "video", label: "Generate Full Video", short: "Full Video" },
];

export function ModeSwitch({ mode, onChange }: { mode: WorkspaceMode; onChange: (mode: WorkspaceMode) => void }) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Workspace mode">
      {MODES.map((m) => (
        <button
          key={m.value}
          role="tab"
          aria-selected={mode === m.value}
          aria-label={m.label}
          className={`mode-btn ${mode === m.value ? "active" : ""}`}
          onClick={() => onChange(m.value)}
        >
          <span className="mode-label">{m.label}</span>
          <span className="mode-label-short">{m.short}</span>
        </button>
      ))}
    </div>
  );
}

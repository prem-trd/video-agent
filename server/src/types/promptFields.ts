// Shared between SceneService and PromptVersionService (avoids a circular
// import between the two) - the scene fields a prompt version snapshots.
export const PROMPT_FIELDS = [
  "visualDescription",
  "imagePrompt",
  "videoPrompt",
  "animationDirection",
  "cameraDirection",
  "composition",
  "negativeInstructions",
  "continuityNotes",
] as const;

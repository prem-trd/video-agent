import { describe, it, expect } from "vitest";
import { updateSceneTool } from "../src/tools/scenes/updateScene.js";
import { generateVisualPromptTool } from "../src/tools/scenes/generateVisualPrompt.js";
import { updateProjectTool } from "../src/tools/planning/updateProject.js";

// Regression coverage for a real bug found during live testing: tool input
// schemas without .strict() silently stripped unrecognized fields instead
// of erroring, so the agent could "successfully" call update_scene with
// fields like visualDescription/animationDirection that were never
// persisted anywhere - a silent data-loss bug with no error signal for
// the agent to notice and correct.

describe("tool input schemas reject unknown fields (.strict())", () => {
  it("update_scene rejects a field it doesn't support instead of silently dropping it", () => {
    const result = updateSceneTool.inputSchema.safeParse({
      sceneId: "scene_1",
      narration: "ok",
      totallyMadeUpField: "should not be silently dropped",
    });
    expect(result.success).toBe(false);
  });

  it("update_scene accepts sceneNumber as an alternative to sceneId", () => {
    const result = updateSceneTool.inputSchema.safeParse({ sceneNumber: 3, duration: 7 });
    expect(result.success).toBe(true);
  });

  it("update_scene requires either sceneId or sceneNumber", () => {
    const result = updateSceneTool.inputSchema.safeParse({ narration: "no scene reference" });
    expect(result.success).toBe(false);
  });

  it("generate_visual_prompt rejects unknown fields", () => {
    const result = generateVisualPromptTool.inputSchema.safeParse({
      sceneNumber: 1,
      visualDescription: "should go through generate_visual_prompt's own LLM call, not be passed in directly",
    });
    expect(result.success).toBe(false);
  });

  it("update_project rejects unknown fields", () => {
    const result = updateProjectTool.inputSchema.safeParse({ title: "ok", notARealField: 123 });
    expect(result.success).toBe(false);
  });

  it("update_project still accepts a normal partial update", () => {
    const result = updateProjectTool.inputSchema.safeParse({ duration: 45, style: "Realistic" });
    expect(result.success).toBe(true);
  });
});

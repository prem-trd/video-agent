import { describe, it, expect } from "vitest";
import { updateSceneTool } from "../src/tools/scenes/updateScene.js";
import { generateVisualPromptTool } from "../src/tools/scenes/generateVisualPrompt.js";
import { listAssetsTool } from "../src/tools/media/listAssets.js";
import { updateProjectTool } from "../src/tools/planning/updateProject.js";
import { generateVoiceTool } from "../src/tools/audio/generateVoice.js";

// Regression coverage for a real bug found during live testing against
// gpt-oss:120b: it sometimes fills EVERY schema property rather than
// omitting unused optional ones, sending "" for an optional enum/number
// field instead of leaving it out entirely. A plain z.string().optional()
// tolerates "" fine, but z.number().optional() and z.enum().optional() do
// not - "" satisfies neither type, so validation failed even though the
// field was genuinely optional. looseOptional() fixes this by treating ""
// as "not provided" before the real validation runs.

describe("looseOptional: tools tolerate an empty-string placeholder for unused optional fields", () => {
  it("list_assets: type:'' alongside no sceneId still validates (matches the exact failure observed live)", () => {
    const result = listAssetsTool.inputSchema.safeParse({ sceneId: "", type: "" });
    expect(result.success).toBe(true);
  });

  it("update_scene: sceneId:'' with a real sceneNumber still validates", () => {
    const result = updateSceneTool.inputSchema.safeParse({ sceneId: "", sceneNumber: 3, duration: 7 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sceneId).toBeUndefined();
  });

  it("update_scene: status:'' still validates and is treated as omitted", () => {
    const result = updateSceneTool.inputSchema.safeParse({ sceneNumber: 1, status: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBeUndefined();
  });

  it("generate_visual_prompt: sceneNumber:'' alongside a real sceneId still validates", () => {
    const result = generateVisualPromptTool.inputSchema.safeParse({ sceneId: "abc123", sceneNumber: "" });
    expect(result.success).toBe(true);
  });

  it("update_project: aspectRatio:'' and duration:'' still validate as omitted", () => {
    const result = updateProjectTool.inputSchema.safeParse({ title: "New Title", aspectRatio: "", duration: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aspectRatio).toBeUndefined();
      expect(result.data.duration).toBeUndefined();
    }
  });

  it("generate_voice: speed:'' and pitch:'' still validate as omitted", () => {
    const result = generateVoiceTool.inputSchema.safeParse({ text: "hello", speed: "", pitch: "" });
    expect(result.success).toBe(true);
  });

  it("a genuinely invalid (non-empty, wrong-type) value is still rejected", () => {
    const result = updateProjectTool.inputSchema.safeParse({ aspectRatio: "not-a-real-ratio" });
    expect(result.success).toBe(false);
  });
});

describe("caseInsensitiveEnum: tools tolerate lowercase enum values from the model", () => {
  it("list_assets: type:'video' (lowercase, as observed live) is accepted and normalized", () => {
    const result = listAssetsTool.inputSchema.safeParse({ type: "video" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("VIDEO");
  });

  it("update_scene: status:'ready' (lowercase) is accepted and normalized", () => {
    const result = updateSceneTool.inputSchema.safeParse({ sceneNumber: 1, status: "ready" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("READY");
  });

  it("a genuinely invalid enum value is still rejected regardless of case", () => {
    const result = listAssetsTool.inputSchema.safeParse({ type: "not_a_real_type" });
    expect(result.success).toBe(false);
  });
});

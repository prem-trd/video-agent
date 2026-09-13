import { describe, it, expect } from "vitest";
import { updateSceneTool } from "../src/tools/scenes/updateScene.js";
import { regenerateScenePromptTool } from "../src/tools/scenes/regenerateScenePrompt.js";
import { listMediaTool } from "../src/tools/media/listMedia.js";
import { updateProjectTool } from "../src/tools/planning/updateProject.js";

// Regression coverage for a real bug found during live testing against
// gpt-oss:120b: it sometimes fills EVERY schema property rather than
// omitting unused optional ones, sending "" for an optional enum/number
// field instead of leaving it out entirely. A plain z.string().optional()
// tolerates "" fine, but z.number().optional() and z.enum().optional() do
// not - "" satisfies neither type, so validation failed even though the
// field was genuinely optional. looseOptional() fixes this by treating ""
// as "not provided" before the real validation runs.

describe("looseOptional: tools tolerate an empty-string placeholder for unused optional fields", () => {
  it("list_media: type:'' alongside no unmatchedOnly still validates (matches the exact failure observed live)", () => {
    const result = listMediaTool.inputSchema.safeParse({ type: "", unmatchedOnly: "" });
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

  it("regenerate_scene_prompt: sceneNumber:'' alongside a real sceneId still validates", () => {
    const result = regenerateScenePromptTool.inputSchema.safeParse({ sceneId: "abc123", sceneNumber: "" });
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

  it("update_project: mediaType:'' and clipDurationSec:'' still validate as omitted", () => {
    const result = updateProjectTool.inputSchema.safeParse({ mediaType: "", clipDurationSec: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mediaType).toBeUndefined();
      expect(result.data.clipDurationSec).toBeUndefined();
    }
  });

  it("a genuinely invalid (non-empty, wrong-type) value is still rejected", () => {
    const result = updateProjectTool.inputSchema.safeParse({ aspectRatio: "not-a-real-ratio" });
    expect(result.success).toBe(false);
  });
});

describe("caseInsensitiveEnum: tools tolerate lowercase enum values from the model", () => {
  it("list_media: type:'video' (lowercase, as observed live) is accepted and normalized", () => {
    const result = listMediaTool.inputSchema.safeParse({ type: "video" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("VIDEO");
  });

  it("update_scene: status:'ready' (lowercase) is accepted and normalized", () => {
    const result = updateSceneTool.inputSchema.safeParse({ sceneNumber: 1, status: "ready" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("READY");
  });

  it("update_project: mediaType:'image' (lowercase) is accepted and normalized", () => {
    const result = updateProjectTool.inputSchema.safeParse({ mediaType: "image" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mediaType).toBe("IMAGE");
  });

  it("a genuinely invalid enum value is still rejected regardless of case", () => {
    const result = listMediaTool.inputSchema.safeParse({ type: "not_a_real_type" });
    expect(result.success).toBe(false);
  });
});

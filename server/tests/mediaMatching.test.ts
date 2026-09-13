import { describe, it, expect } from "vitest";
import { matchFilenameToSceneNumber } from "../src/services/MediaUploadService.js";

describe("matchFilenameToSceneNumber", () => {
  it("matches 'scene-01.mp4' style names with high confidence", () => {
    expect(matchFilenameToSceneNumber("scene-01.mp4")).toEqual({ sceneNumber: 1, confidence: "high" });
    expect(matchFilenameToSceneNumber("scene_01.mp4")).toEqual({ sceneNumber: 1, confidence: "high" });
    expect(matchFilenameToSceneNumber("Scene 12.png")).toEqual({ sceneNumber: 12, confidence: "high" });
    expect(matchFilenameToSceneNumber("01-scene.mp4")).toEqual({ sceneNumber: 1, confidence: "high" });
  });

  it("matches a purely numeric filename with high confidence", () => {
    expect(matchFilenameToSceneNumber("01.mp4")).toEqual({ sceneNumber: 1, confidence: "high" });
    expect(matchFilenameToSceneNumber("7.png")).toEqual({ sceneNumber: 7, confidence: "high" });
  });

  it("suggests a low-confidence match for an ambiguous filename with some other number", () => {
    const result = matchFilenameToSceneNumber("cow_02_final.mp4");
    expect(result).toEqual({ sceneNumber: 2, confidence: "low" });
  });

  it("returns null when there is no number to go on at all", () => {
    expect(matchFilenameToSceneNumber("cow_scene.mp4")).toBeNull();
    expect(matchFilenameToSceneNumber("final_output.png")).toBeNull();
  });
});

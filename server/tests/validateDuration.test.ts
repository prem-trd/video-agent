import { describe, it, expect } from "vitest";
import { durationIssue } from "../src/tools/validation/validateVideo.js";

describe("durationIssue (render vs. timeline)", () => {
  it("accepts a partial assembly that matches its own timeline (4 x 10s clips of a 300s project)", () => {
    expect(durationIssue(40.0, 40)).toBeNull();
  });

  it("tolerates small fps/frame-rounding drift", () => {
    expect(durationIssue(40.9, 40)).toBeNull();
    expect(durationIssue(9.2, 10)).toBeNull();
  });

  it("flags a render that doesn't match the timeline it was built from", () => {
    expect(durationIssue(20, 40)).toMatch(/timeline adds up to 40\.0s/);
  });

  it("skips the check when the timeline has no computed duration", () => {
    expect(durationIssue(12, 0)).toBeNull();
  });
});

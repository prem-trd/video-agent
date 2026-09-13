import { describe, it, expect } from "vitest";
import { computeSceneCount, computeSceneTimings } from "../src/utils/sceneMath.js";

describe("computeSceneCount - deterministic, no fixed duration cap", () => {
  it("matches the spec's worked examples exactly", () => {
    expect(computeSceneCount(180, 10)).toBe(18); // 3 minutes / 10s clips
    expect(computeSceneCount(300, 10)).toBe(30); // 5 minutes / 10s clips
    expect(computeSceneCount(450, 10)).toBe(45); // 7m30s / 10s clips
  });

  it("supports very long durations (30+ minutes) just as arithmetic", () => {
    expect(computeSceneCount(1800, 10)).toBe(180); // 30 minutes
  });

  it("rounds up a non-exact division", () => {
    expect(computeSceneCount(65, 10)).toBe(7);
  });

  it("never returns fewer than 1 scene", () => {
    expect(computeSceneCount(3, 10)).toBe(1);
  });
});

describe("computeSceneTimings", () => {
  it("produces contiguous, non-overlapping timings summing to the target duration", () => {
    const timings = computeSceneTimings(180, 10);
    expect(timings).toHaveLength(18);
    expect(timings[0]).toMatchObject({ sceneNumber: 1, startTime: 0, duration: 10, endTime: 10 });
    expect(timings[timings.length - 1].endTime).toBeCloseTo(180, 1);
    for (let i = 1; i < timings.length; i++) {
      expect(timings[i].startTime).toBeCloseTo(timings[i - 1].endTime, 5);
    }
  });

  it("folds a tiny remainder scene into the previous one instead of leaving an oddly short final scene", () => {
    // 101s / 10s => 11 scenes, last would be 1s (10% of a normal scene) - too small, folds into #10.
    const timings = computeSceneTimings(101, 10);
    expect(timings).toHaveLength(10);
    expect(timings[timings.length - 1].duration).toBeCloseTo(11, 1);
    expect(timings[timings.length - 1].endTime).toBeCloseTo(101, 1);
  });

  it("keeps a substantial remainder as its own final scene", () => {
    // 65s / 10s => 7 scenes, last is 5s (50% of a normal scene) - kept.
    const timings = computeSceneTimings(65, 10);
    expect(timings).toHaveLength(7);
    expect(timings[timings.length - 1].duration).toBeCloseTo(5, 1);
  });
});

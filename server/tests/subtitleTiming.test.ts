import { describe, it, expect } from "vitest";
import { formatSrtTime, formatVttTime } from "../src/tools/audio/generateSubtitles.js";

describe("subtitle time formatting", () => {
  it("formats whole seconds correctly", () => {
    expect(formatSrtTime(0)).toBe("00:00:00,000");
    expect(formatSrtTime(5)).toBe("00:00:05,000");
    expect(formatSrtTime(65)).toBe("00:01:05,000");
    expect(formatSrtTime(3661)).toBe("01:01:01,000");
  });

  it("formats fractional seconds correctly", () => {
    expect(formatSrtTime(5.2)).toBe("00:00:05,200");
    expect(formatSrtTime(5.123)).toBe("00:00:05,123");
  });

  it("does not let a rounding carry produce an invalid 4-digit millisecond field", () => {
    // 4.9997s rounds to 5000ms total, which must carry into the seconds
    // field (05,000) rather than being emitted as the invalid "04,1000".
    const result = formatSrtTime(4.9997);
    expect(result).toBe("00:00:05,000");
    expect(result).not.toContain(",1000");
  });

  it("formats WebVTT time with a period instead of a comma", () => {
    expect(formatVttTime(5.2)).toBe("00:00:05.200");
  });
});

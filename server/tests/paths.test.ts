import { describe, it, expect } from "vitest";
import { safeProjectPath, assertSafeId } from "../src/utils/paths.js";

describe("safeProjectPath", () => {
  it("resolves a normal relative path inside the storage root", () => {
    const p = safeProjectPath("proj-1", "assets", "images", "a.png");
    expect(p).toContain("proj-1");
    expect(p.endsWith("assets/images/a.png")).toBe(true);
  });

  it("rejects path traversal via ..", () => {
    expect(() => safeProjectPath("proj-1", "..", "..", "etc", "passwd")).toThrow(/escapes/);
  });

  it("rejects an absolute path that points outside the root", () => {
    expect(() => safeProjectPath("/etc/passwd")).toThrow(/escapes/);
  });

  it("rejects traversal hidden inside a single segment", () => {
    expect(() => safeProjectPath("proj-1/../../../etc")).toThrow(/escapes/);
  });
});

describe("assertSafeId", () => {
  it("accepts alphanumeric/dash/underscore ids", () => {
    expect(() => assertSafeId("abc-123_XYZ")).not.toThrow();
  });

  it("rejects ids containing path separators", () => {
    expect(() => assertSafeId("../evil")).toThrow();
    expect(() => assertSafeId("a/b")).toThrow();
  });
});

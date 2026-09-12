import path from "node:path";
import { PROJECT_STORAGE_ROOT } from "./env.js";
import { AppError } from "./errors.js";

/**
 * Tool safety (spec #26): every filesystem operation a tool performs must
 * be resolved through here first. Rejects any path that would escape
 * PROJECT_STORAGE_ROOT (traversal via "..", absolute paths, symlink-style
 * tricks in the string itself, etc). Tools must NEVER build paths with
 * raw string concatenation outside this helper.
 */
export function safeProjectPath(...segments: string[]): string {
  const resolved = path.resolve(PROJECT_STORAGE_ROOT, ...segments);
  const rootWithSep = PROJECT_STORAGE_ROOT.endsWith(path.sep)
    ? PROJECT_STORAGE_ROOT
    : PROJECT_STORAGE_ROOT + path.sep;

  if (resolved !== PROJECT_STORAGE_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new AppError("PATH_SECURITY_ERROR", "Resolved path escapes the project storage root.", {
      retryable: false,
      details: { attempted: segments.join("/") },
    });
  }
  return resolved;
}

/** Path to a specific project's directory, with id validated as a safe segment. */
export function projectDir(projectId: string): string {
  assertSafeId(projectId);
  return safeProjectPath(projectId);
}

/** Rejects ids that aren't a plain filename-safe token (defense in depth beyond safeProjectPath). */
export function assertSafeId(id: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new AppError("PATH_SECURITY_ERROR", `Invalid id: "${id}"`, { retryable: false });
  }
}

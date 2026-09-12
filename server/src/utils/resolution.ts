import { AppError } from "./errors.js";

export function parseResolution(resolution: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec(resolution.trim());
  if (!match) {
    throw new AppError("VALIDATION_ERROR", `Invalid resolution string: "${resolution}" (expected e.g. "1920x1080")`, {
      retryable: false,
    });
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

import fs from "node:fs/promises";
import path from "node:path";
import { projectDir, safeProjectPath } from "../utils/paths.js";
import { AppError } from "../utils/errors.js";

// Filesystem layout for a single project (spec #8). The DB holds queryable
// metadata; this directory holds the actual working files and rendered
// media. All paths are produced through utils/paths.ts so nothing here can
// ever escape PROJECT_STORAGE_ROOT.
const SUBDIRS = [
  "script",
  "scenes",
  "characters",
  "assets/uploads/images",
  "assets/uploads/videos",
  "assets/audio",
  "assets/subtitles",
  "renders",
  "thumbnails",
  "logs",
];

export class ProjectStorage {
  static async bootstrap(projectId: string): Promise<string> {
    const root = projectDir(projectId);
    await fs.mkdir(root, { recursive: true });
    for (const sub of SUBDIRS) {
      await fs.mkdir(safeProjectPath(projectId, sub), { recursive: true });
    }
    return root;
  }

  static async writeJson(projectId: string, relativePath: string, data: unknown): Promise<string> {
    const filePath = safeProjectPath(projectId, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    return filePath;
  }

  static async readJson<T>(projectId: string, relativePath: string): Promise<T | null> {
    const filePath = safeProjectPath(projectId, relativePath);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch (err: any) {
      if (err?.code === "ENOENT") return null;
      throw new AppError("FILE_ERROR", `Failed to read ${relativePath}: ${err.message}`, { retryable: false });
    }
  }

  static async exists(projectId: string, relativePath: string): Promise<boolean> {
    const filePath = safeProjectPath(projectId, relativePath);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async remove(projectId: string): Promise<void> {
    const root = projectDir(projectId);
    await fs.rm(root, { recursive: true, force: true });
  }

  static absolutePath(projectId: string, relativePath: string): string {
    return safeProjectPath(projectId, relativePath);
  }
}

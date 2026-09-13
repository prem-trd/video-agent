import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import type { Tool } from "../types.js";
import { SceneService } from "../../services/SceneService.js";
import { RenderPaths } from "../../services/RenderPaths.js";
import { AppError } from "../../utils/errors.js";

const InputSchema = z.object({}).strict();

export function formatSrtTime(totalSec: number): string {
  // Round to whole milliseconds FIRST, then derive h/m/s/ms from that one
  // integer - rounding each field independently can carry (e.g. 4.9997s
  // -> ms=1000) and produce an invalid "04,1000" instead of "05,000".
  const totalMs = Math.round(totalSec * 1000);
  const ms = totalMs % 1000;
  const totalWholeSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalWholeSec / 3600);
  const m = Math.floor((totalWholeSec % 3600) / 60);
  const s = totalWholeSec % 60;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function formatVttTime(totalSec: number): string {
  return formatSrtTime(totalSec).replace(",", ".");
}

/**
 * Generates SRT and WebVTT subtitle files from each scene's narration/
 * on-screen text, timed using the scene's own (deterministic) startTime/
 * endTime. Entirely optional - only meaningful if the project actually has
 * narration or on-screen text; scenes without any are skipped, and if NO
 * scene has any, this tool reports that subtitles aren't applicable rather
 * than writing an empty file.
 */
export const generateSubtitlesTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_subtitles",
  description: "Generate SRT and WebVTT subtitle files from scene narration/on-screen text, timed to each scene. Optional - skip if the project has no narration or on-screen text (or the user uploaded their own subtitle file).",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const scenes = await SceneService.list(ctx.projectId);
    const cues = scenes
      .filter((s) => s.narration || s.onScreenText)
      .map((s, i) => ({ index: i + 1, start: s.startTime, end: s.endTime, text: s.narration || s.onScreenText }));

    if (cues.length === 0) {
      throw new AppError("VALIDATION_ERROR", "No scene has narration or on-screen text - subtitles aren't applicable to this project. Skip this step.", { retryable: false });
    }

    const srt = cues.map((c) => `${c.index}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`).join("\n");
    const vtt = `WEBVTT\n\n${cues.map((c) => `${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${c.text}\n`).join("\n")}`;

    const srtPath = RenderPaths.subtitlesSrt(ctx.projectId);
    const vttPath = RenderPaths.subtitlesVtt(ctx.projectId);
    await fs.mkdir(path.dirname(srtPath), { recursive: true });
    await fs.writeFile(srtPath, srt, "utf-8");
    await fs.writeFile(vttPath, vtt, "utf-8");

    return { srtPath, vttPath, cueCount: cues.length };
  },
};

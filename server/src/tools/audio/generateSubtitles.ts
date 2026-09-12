import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import type { Tool } from "../types.js";
import { SceneService } from "../../services/SceneService.js";
import { AssetService, computeGenerationHash } from "../../services/AssetService.js";
import { RenderPaths } from "../../services/RenderPaths.js";

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
 * Generates SRT and WebVTT subtitle files synced to each scene's narration
 * timing (spec #22). Uses each scene's actual generated voice-clip
 * duration when available (more accurate than the script's estimated
 * scene duration), falling back to the stored scene duration otherwise.
 */
export const generateSubtitlesTool: Tool<z.infer<typeof InputSchema>> = {
  name: "generate_subtitles",
  description:
    "Generate SRT and WebVTT subtitle files from the scene narration, timed sequentially using each scene's actual narration length. Call after generate_voice has run for every scene (or after add_audio) for the most accurate timing.",
  inputSchema: InputSchema,
  retryable: true,
  async execute(_input, ctx) {
    const scenes = await SceneService.list(ctx.projectId);

    let cursor = 0;
    const cues: { index: number; start: number; end: number; text: string }[] = [];
    for (const scene of scenes) {
      const voiceAsset = await AssetService.getLatest(ctx.projectId, scene.id, "VOICE");
      const duration = voiceAsset?.duration ?? scene.duration;
      cues.push({ index: cues.length + 1, start: cursor, end: cursor + duration, text: scene.narration || scene.onScreenText || " " });
      cursor += duration;
    }

    const srt = cues.map((c) => `${c.index}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`).join("\n");
    const vtt = `WEBVTT\n\n${cues.map((c) => `${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${c.text}\n`).join("\n")}`;

    const srtPath = RenderPaths.subtitlesSrt(ctx.projectId);
    const vttPath = RenderPaths.subtitlesVtt(ctx.projectId);
    await fs.mkdir(path.dirname(srtPath), { recursive: true });
    await fs.writeFile(srtPath, srt, "utf-8");
    await fs.writeFile(vttPath, vtt, "utf-8");

    const generationHash = computeGenerationHash({ type: "SUBTITLE", cues: cues.map((c) => c.text) });
    await AssetService.record({
      projectId: ctx.projectId,
      type: "SUBTITLE",
      provider: "internal",
      isMock: false,
      filePath: srtPath,
      duration: cursor,
      generationHash,
      metadata: { vttPath, cueCount: cues.length },
    });

    return { srtPath, vttPath, cueCount: cues.length, totalDurationSec: cursor };
  },
};
